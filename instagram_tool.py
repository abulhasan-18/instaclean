#!/usr/bin/env python3
"""
Instagram Mass Unlike Tool
Bulk unlikes Instagram posts and reels from your official liked_posts.json data export.
Supports session-cookie authentication (bypassing 2FA/challenges) as well as credential authentication.
"""

import os
import sys
import json
import time
import random
import logging
import platform
import re
import signal
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from logging.handlers import RotatingFileHandler
import urllib.request
import urllib.parse
import urllib.error

# Global Configuration
CONFIG_FILE = "config.json"
DEFAULT_CONFIG = {
    "delay": {
        "min": 5,
        "max": 15
    },
    "break": {
        "min": 300,        # 5 minutes
        "max": 900,        # 15 minutes
        "probability": 0.05 # 5% chance of pause
    },
    "accounts": {},
    "log_level": "INFO",
    "max_retries": 3,
    "retry_delay": 15
}

class ConsoleColors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    PURPLE = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    RESET = '\033[0m'


def instagram_code_to_media_id(url_or_code: str) -> int:
    """Convert Instagram shortcode or URL into a numeric media ID."""
    match = re.search(r'/(?:p|reel|tv)/([A-Za-z0-9_-]+)', url_or_code)
    code = match.group(1) if match else url_or_code.strip().strip('/')
    charmap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    return sum(charmap.index(char) * (64 ** i) for i, char in enumerate(reversed(code)))


class InstagramWebClient:
    """
    Direct HTTP client for Instagram Web API using session cookies.
    Bypasses 2FA checkpoints and allows reliable automation.
    """
    def __init__(self, session_id: str, csrf_token: str = "", ds_user_id: Optional[str] = None):
        self.session_id = session_id.strip()
        self.csrf_token = csrf_token.strip()
        self.ds_user_id = ds_user_id.strip() if ds_user_id else self.session_id.split("%3A")[0]
        self.user_agent = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        )

    def _request(self, url: str, data: Optional[Dict[str, Any]] = None, method: str = "GET") -> Tuple[int, Dict[str, Any]]:
        cookie_str = f"sessionid={self.session_id}; ds_user_id={self.ds_user_id}"
        if self.csrf_token:
            cookie_str += f"; csrftoken={self.csrf_token}"

        headers = {
            "User-Agent": self.user_agent,
            "X-IG-App-ID": "936619743392459",
            "X-ASBD-ID": "129477",
            "X-IG-WWW-Claim": "0",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://www.instagram.com/",
            "Cookie": cookie_str
        }
        if self.csrf_token:
            headers["X-CSRFToken"] = self.csrf_token

        req_data = None
        if data is not None:
            req_data = urllib.parse.urlencode(data).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"

        req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                status = resp.status
                body = resp.read().decode("utf-8")
                try:
                    return status, json.loads(body)
                except Exception:
                    return status, {"raw": body}
        except urllib.error.HTTPError as e:
            try:
                err_body = e.read().decode("utf-8")
                return e.code, json.loads(err_body)
            except Exception:
                return e.code, {"error": str(e)}
        except Exception as e:
            return 0, {"error": str(e)}

    def validate_session(self) -> Tuple[bool, str]:
        """Check if session is valid by pinging Instagram's notification endpoint."""
        status, res = self._request("https://www.instagram.com/api/v1/notifications/badge/")
        if status == 200:
            return True, "Session valid"
        if status in (401, 403):
            return False, "Session expired or invalid. Please refresh your cookies."
        return False, f"Could not verify session (HTTP {status})"

    def unlike_post(self, media_id: int) -> Tuple[bool, str]:
        """Unlike a post by media ID."""
        url = f"https://www.instagram.com/api/v1/web/likes/{media_id}/unlike/"
        status, res = self._request(url, data={}, method="POST")
        if status == 200 and res.get("status") == "ok":
            return True, "Unliked successfully"
        error_msg = res.get("message", res.get("error", f"HTTP {status}"))
        return False, error_msg


class InstagramTool:
    def __init__(self):
        self.config_file = CONFIG_FILE
        self.accounts_dir = Path("accounts")
        self.logs_dir = Path("logs")
        self.running = True
        self.config = self.load_config()

        self.accounts_dir.mkdir(exist_ok=True)
        self.logs_dir.mkdir(exist_ok=True)
        self.setup_logging()
        self._setup_signals()

    def _setup_signals(self):
        signal.signal(signal.SIGINT, self._handle_sigint)
        signal.signal(signal.SIGTERM, self._handle_sigint)

    def _handle_sigint(self, signum, frame):
        print(f"\n{ConsoleColors.YELLOW}[!] Stopping operation gracefully...{ConsoleColors.RESET}")
        self.running = False
        sys.exit(0)

    def setup_logging(self):
        log_file = self.logs_dir / "instagram_tool.log"
        handler = RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
        formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
        handler.setFormatter(formatter)

        root = logging.getLogger()
        root.setLevel(logging.INFO)
        root.handlers.clear()
        root.addHandler(handler)

    def load_config(self) -> Dict[str, Any]:
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, "r") as f:
                    return {**DEFAULT_CONFIG, **json.load(f)}
            except Exception:
                pass
        self.save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG

    def save_config(self, cfg: Optional[Dict[str, Any]] = None):
        if cfg is not None:
            self.config = cfg
        with open(self.config_file, "w") as f:
            json.dump(self.config, f, indent=4)

    def add_account(self):
        print(f"\n{ConsoleColors.CYAN}{ConsoleColors.BOLD}➕ Connect Instagram Account{ConsoleColors.RESET}")
        print("-" * 45)
        print("Choose connection method:")
        print("1. [Recommended] Session Cookies (Safe, bypasses 2FA)")
        print("2. Username & Password (uses Ensta)")
        print("0. Cancel")

        choice = input(f"\n{ConsoleColors.WHITE}Choice (1/2): {ConsoleColors.RESET}").strip()
        if choice == "1":
            self._add_account_cookies()
        elif choice == "2":
            self._add_account_credentials()

    def _add_account_cookies(self):
        print(f"\n{ConsoleColors.YELLOW}Paste your cookies from instagram.com:{ConsoleColors.RESET}")
        username = input(f"{ConsoleColors.BOLD}Instagram Username: @{ConsoleColors.RESET}").strip().lstrip('@')
        session_id = input(f"{ConsoleColors.BOLD}sessionid cookie: {ConsoleColors.RESET}").strip()
        csrf_token = input(f"{ConsoleColors.BOLD}csrftoken cookie: {ConsoleColors.RESET}").strip()
        ds_user_id = input(f"{ConsoleColors.BOLD}ds_user_id (optional, press Enter to skip): {ConsoleColors.RESET}").strip()

        if not username or not session_id:
            print(f"{ConsoleColors.RED}[✗] Username and sessionid are required.{ConsoleColors.RESET}")
            return

        client = InstagramWebClient(session_id, csrf_token, ds_user_id)
        print(f"\n{ConsoleColors.BLUE}[*] Validating session cookies...{ConsoleColors.RESET}")
        valid, msg = client.validate_session()
        if not valid:
            print(f"{ConsoleColors.YELLOW}[!] Validation warning: {msg}{ConsoleColors.RESET}")
            proceed = input("Save anyway? (y/N): ").strip().lower()
            if proceed != "y":
                return
        else:
            print(f"{ConsoleColors.GREEN}[✓] Session validated successfully!{ConsoleColors.RESET}")

        account_data = {
            "username": username,
            "type": "cookie",
            "session_id": session_id,
            "csrf_token": csrf_token,
            "ds_user_id": ds_user_id,
            "created_at": datetime.now().isoformat(),
            "total_unliked": 0
        }

        with open(self.accounts_dir / f"{username}.json", "w") as f:
            json.dump(account_data, f, indent=4)

        self.config["accounts"][username] = {"enabled": True}
        self.save_config()
        print(f"{ConsoleColors.GREEN}✨ Account @{username} saved!{ConsoleColors.RESET}")

    def _add_account_credentials(self):
        username = input(f"{ConsoleColors.BOLD}Username: @{ConsoleColors.RESET}").strip().lstrip('@')
        password = input(f"{ConsoleColors.BOLD}Password: {ConsoleColors.RESET}").strip()
        if not username or not password:
            print(f"{ConsoleColors.RED}Username and password required.{ConsoleColors.RESET}")
            return

        account_data = {
            "username": username,
            "type": "password",
            "password": password,
            "created_at": datetime.now().isoformat(),
            "total_unliked": 0
        }

        with open(self.accounts_dir / f"{username}.json", "w") as f:
            json.dump(account_data, f, indent=4)

        self.config["accounts"][username] = {"enabled": True}
        self.save_config()
        print(f"{ConsoleColors.GREEN}✨ Account @{username} saved!{ConsoleColors.RESET}")

    def list_accounts(self) -> List[str]:
        if not self.accounts_dir.exists():
            return []
        return [f.stem for f in self.accounts_dir.glob("*.json")]

    def get_client(self, username: str):
        acc_file = self.accounts_dir / f"{username}.json"
        if not acc_file.exists():
            return None
        with open(acc_file, "r") as f:
            data = json.load(f)

        if data.get("type") == "cookie" or "session_id" in data:
            return InstagramWebClient(data["session_id"], data.get("csrf_token", ""), data.get("ds_user_id"))
        else:
            try:
                from ensta import Web
                return Web(data["username"], data["password"])
            except ImportError:
                print(f"{ConsoleColors.RED}[!] 'ensta' is not installed. Use cookie mode.{ConsoleColors.RESET}")
                return None

    def mass_unlike(self):
        """Execute mass unlike from liked_posts.json."""
        accounts = self.list_accounts()
        if not accounts:
            print(f"{ConsoleColors.YELLOW}No accounts connected. Please add an account first.{ConsoleColors.RESET}")
            return

        filepath = Path("liked_posts.json")
        if not filepath.exists():
            custom = input(f"{ConsoleColors.WHITE}Enter path to liked_posts.json (default: liked_posts.json): {ConsoleColors.RESET}").strip()
            if custom:
                filepath = Path(custom)

        if not filepath.exists():
            print(f"{ConsoleColors.RED}[✗] File not found: {filepath}{ConsoleColors.RESET}")
            return

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"{ConsoleColors.RED}[✗] Error reading JSON: {e}{ConsoleColors.RESET}")
            return

        items = []
        if isinstance(data, dict):
            items = data.get("likes_media_likes", [])
        elif isinstance(data, list):
            items = data

        if not items:
            print(f"{ConsoleColors.YELLOW}No liked items found in {filepath}.{ConsoleColors.RESET}")
            return

        print(f"\n{ConsoleColors.CYAN}Select account to use:{ConsoleColors.RESET}")
        for i, acc in enumerate(accounts, 1):
            print(f"{i}. @{acc}")
        choice = input("Choice: ").strip()
        if not choice.isdigit() or int(choice) < 1 or int(choice) > len(accounts):
            return
        username = accounts[int(choice) - 1]

        client = self.get_client(username)
        if not client:
            return

        print(f"\n{ConsoleColors.GREEN}[✓] Starting Unlike Process for @{username}{ConsoleColors.RESET}")
        print(f"{ConsoleColors.BLUE}Total posts to unlike: {len(items)}{ConsoleColors.RESET}")
        print(f"{ConsoleColors.YELLOW}Delay: {self.config['delay']['min']} - {self.config['delay']['max']}s between actions.{ConsoleColors.RESET}\n")

        total = len(items)
        unliked = 0
        errors = 0

        while items and self.running:
            item = items.pop(0)
            href = ""
            if "string_list_data" in item and len(item["string_list_data"]) > 0:
                href = item["string_list_data"][0].get("href", "")

            if not href:
                continue

            try:
                media_id = instagram_code_to_media_id(href)
            except Exception:
                errors += 1
                continue

            delay = random.uniform(self.config["delay"]["min"], self.config["delay"]["max"])
            time.sleep(delay)

            success = False
            msg = ""
            for attempt in range(self.config.get("max_retries", 3)):
                try:
                    if isinstance(client, InstagramWebClient):
                        ok, msg = client.unlike_post(media_id)
                        success = ok
                    else:
                        client.unlike(media_id)
                        success = True
                    if success:
                        break
                except Exception as e:
                    msg = str(e)
                    time.sleep(self.config.get("retry_delay", 15))

            if success:
                unliked += 1
                print(f"[{unliked}/{total}] {ConsoleColors.GREEN}✓ Unliked:{ConsoleColors.RESET} {href}")
            else:
                errors += 1
                print(f"[{unliked + errors}/{total}] {ConsoleColors.RED}✗ Failed:{ConsoleColors.RESET} {href} ({msg})")

            # Save state
            try:
                with open(filepath, "w", encoding="utf-8") as f:
                    if isinstance(data, dict):
                        data["likes_media_likes"] = items
                        json.dump(data, f, indent=2)
                    else:
                        json.dump(items, f, indent=2)
            except Exception:
                pass

            # Safety break
            if random.random() < self.config["break"]["probability"]:
                pause_time = random.uniform(self.config["break"]["min"], self.config["break"]["max"])
                print(f"\n{ConsoleColors.YELLOW}☕ Safety Cooldown: Pausing for {pause_time / 60:.1f} minutes...{ConsoleColors.RESET}")
                time.sleep(pause_time)

        print(f"\n{ConsoleColors.GREEN}🎉 Finished! Unliked: {unliked} posts | Errors: {errors}{ConsoleColors.RESET}")

    def show_menu(self):
        while self.running:
            accounts = self.list_accounts()
            print(f"\n{ConsoleColors.CYAN}{ConsoleColors.BOLD}╔{'═' * 46}╗")
            print(f"║          Instagram Mass Unlike Tool          ║")
            print(f"╚{'═' * 46}╝{ConsoleColors.RESET}")
            print(f"Connected Accounts: {ConsoleColors.GREEN}{len(accounts)}{ConsoleColors.RESET}")
            for acc in accounts[:3]:
                print(f" • @{acc}")

            print(f"\n{ConsoleColors.BOLD}Actions:{ConsoleColors.RESET}")
            print("1. ➕ Connect Instagram Account (Cookies or Credentials)")
            print("2. 💔 Mass Unlike Posts (from liked_posts.json)")
            print("3. ⚙️  Settings & Delays")
            print("4. ❌ Remove Account")
            print("0. 🚪 Exit")

            choice = input(f"\n{ConsoleColors.WHITE}Enter choice: {ConsoleColors.RESET}").strip()
            if choice == "1":
                self.add_account()
            elif choice == "2":
                self.mass_unlike()
            elif choice == "3":
                self.show_settings()
            elif choice == "4":
                self.remove_account()
            elif choice == "0":
                print(f"\n{ConsoleColors.GREEN}Goodbye!{ConsoleColors.RESET}")
                break

    def show_settings(self):
        print(f"\n{ConsoleColors.CYAN}Current Settings:{ConsoleColors.RESET}")
        print(f"1. Min Delay: {self.config['delay']['min']}s")
        print(f"2. Max Delay: {self.config['delay']['max']}s")
        print(f"3. Break Probability: {self.config['break']['probability'] * 100}%")
        print("0. Back")
        c = input("Change setting (1-3) or 0: ").strip()
        if c == "1":
            v = float(input("New Min Delay (s): "))
            self.config["delay"]["min"] = v
        elif c == "2":
            v = float(input("New Max Delay (s): "))
            self.config["delay"]["max"] = v
        elif c == "3":
            v = float(input("New Break Probability (0.01-0.5): "))
            self.config["break"]["probability"] = v
        self.save_config()

    def remove_account(self):
        accounts = self.list_accounts()
        if not accounts:
            print("No accounts to remove.")
            return
        for i, acc in enumerate(accounts, 1):
            print(f"{i}. @{acc}")
        choice = input("Select account to remove: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(accounts):
            acc = accounts[int(choice) - 1]
            (self.accounts_dir / f"{acc}.json").unlink(missing_ok=True)
            if acc in self.config.get("accounts", {}):
                del self.config["accounts"][acc]
                self.save_config()
            print(f"{ConsoleColors.GREEN}Account @{acc} removed.{ConsoleColors.RESET}")


def main():
    tool = InstagramTool()
    tool.show_menu()


if __name__ == "__main__":
    main()
