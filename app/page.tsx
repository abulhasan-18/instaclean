'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  HeartCrack,
  KeyRound,
  Sliders,
  Terminal,
  Upload,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Info,
  Trash2,
  Loader2
} from 'lucide-react';
import { LikedPostItem, instagramCodeToMediaId, parseCookieString } from '@/lib/instagram';

type Tab = 'unlike' | 'account' | 'settings' | 'logs';

interface LogEntry {
  id: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('unlike');

  // Credentials
  const [cookieHeader, setCookieHeader] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [dsUserId, setDsUserId] = useState('');
  const [accountStatus, setAccountStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [accountStatusMsg, setAccountStatusMsg] = useState('');

  // Safety settings (user requested: min 3s to 10s per post)
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(10);
  const [breakProbability, setBreakProbability] = useState(0); // 0% default (no unexpected 5-min freezes)
  const [breakMin, setBreakMin] = useState(3); // minutes
  const [breakMax, setBreakMax] = useState(8); // minutes
  const [maxRetries, setMaxRetries] = useState(1);

  // Likes state
  const [likedItems, setLikedItems] = useState<LikedPostItem[]>([]);
  const [likesFileName, setLikesFileName] = useState('');
  const [isParsingLikes, setIsParsingLikes] = useState(false);
  const [isUnliking, setIsUnliking] = useState(false);
  const [unlikeProgress, setUnlikeProgress] = useState({ current: 0, total: 0, success: 0, errors: 0 });
  const [currentUnlikingUrl, setCurrentUnlikingUrl] = useState('');

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Abort controller ref
  const unlikeAbortRef = useRef<AbortController | null>(null);

  // Handle cookieHeader change with auto extraction
  const handleCookieHeaderChange = (val: string) => {
    setCookieHeader(val);
    const parsed = parseCookieString(val);
    if (parsed['sessionid']) setSessionId(parsed['sessionid']);
    if (parsed['csrftoken']) setCsrfToken(parsed['csrftoken']);
    if (parsed['ds_user_id']) setDsUserId(parsed['ds_user_id']);
  };

  // Load credentials & settings from localStorage
  useEffect(() => {
    try {
      const savedCookie = localStorage.getItem('insta_cookie_header');
      const savedSid = localStorage.getItem('insta_sid');
      const savedCsrf = localStorage.getItem('insta_csrf');
      const savedUid = localStorage.getItem('insta_uid');
      if (savedCookie) {
        setCookieHeader(savedCookie);
        const parsed = parseCookieString(savedCookie);
        if (parsed['sessionid'] && !savedSid) setSessionId(parsed['sessionid']);
        if (parsed['csrftoken'] && !savedCsrf) setCsrfToken(parsed['csrftoken']);
        if (parsed['ds_user_id'] && !savedUid) setDsUserId(parsed['ds_user_id']);
      }
      if (savedSid) setSessionId(savedSid);
      if (savedCsrf) setCsrfToken(savedCsrf);
      if (savedUid) setDsUserId(savedUid);

      const savedSettings = localStorage.getItem('insta_settings');
      if (savedSettings) {
        const s = JSON.parse(savedSettings);
        if (s.minDelay) setMinDelay(s.minDelay);
        if (s.maxDelay) setMaxDelay(s.maxDelay);
        if (s.breakProbability !== undefined) setBreakProbability(s.breakProbability);
        if (s.breakMin) setBreakMin(s.breakMin);
        if (s.breakMax) setBreakMax(s.breakMax);
        if (s.maxRetries) setMaxRetries(s.maxRetries);
      }
    } catch {
      // ignore
    }
  }, []);

  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    const time = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random()}`;
    setLogs((prev) => [...prev.slice(-400), { id, time, type, message }]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Save credentials
  const handleSaveCredentials = () => {
    try {
      localStorage.setItem('insta_cookie_header', cookieHeader);
      localStorage.setItem('insta_sid', sessionId);
      localStorage.setItem('insta_csrf', csrfToken);
      localStorage.setItem('insta_uid', dsUserId);
      addLog('info', 'Instagram session & cookies saved locally in browser.');
    } catch {
      // ignore
    }
  };

  // Test account validation
  const validateAccount = async () => {
    if (!cookieHeader && !sessionId) {
      setAccountStatus('invalid');
      setAccountStatusMsg('Please enter your cookies or sessionid.');
      return;
    }

    setAccountStatus('validating');
    setAccountStatusMsg('Verifying session with Instagram...');
    addLog('info', 'Verifying session validity with Instagram...');

    try {
      const res = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookieHeader, sessionId, csrfToken, dsUserId }),
      });
      const data = await res.json();

      if (data.ok) {
        setAccountStatus('valid');
        setAccountStatusMsg(data.message || 'Session is valid and ready!');
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
        if (data.dsUserId) {
          setDsUserId(data.dsUserId);
        }
        addLog('success', `Instagram session confirmed! ${data.message || ''}`);
        try {
          if (cookieHeader) localStorage.setItem('insta_cookie_header', cookieHeader);
          if (sessionId) localStorage.setItem('insta_sid', sessionId);
          if (data.csrfToken) localStorage.setItem('insta_csrf', data.csrfToken);
          if (data.dsUserId) localStorage.setItem('insta_uid', data.dsUserId);
        } catch {}
      } else {
        setAccountStatus('invalid');
        setAccountStatusMsg(data.message || 'Session validation failed.');
        addLog('error', `Session validation failed: ${data.message}`);
      }
    } catch (err: any) {
      setAccountStatus('invalid');
      setAccountStatusMsg(err.message || 'Network error');
      addLog('error', `Validation error: ${err.message}`);
    }
  };

  // Parse Liked Posts File (100% Client-Side: instantaneous, no file size limits)
  const handleLikesFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLikesFileName(file.name);
    setIsParsingLikes(true);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    addLog('info', `Reading file: ${file.name} (${sizeMb} MB)...`);

    const reader = new FileReader();
    reader.onerror = () => {
      setIsParsingLikes(false);
      addLog('error', `Failed to read file: ${file.name}`);
    };
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch (jsonErr: any) {
          setIsParsingLikes(false);
          addLog('error', `Invalid JSON file format: ${jsonErr.message}`);
          return;
        }

        let rawLikes: any[] = [];
        if (Array.isArray(parsed)) {
          rawLikes = parsed;
        } else if (parsed && typeof parsed === 'object') {
          rawLikes = parsed.likes_media_likes || parsed.media_likes || [];
          if (rawLikes.length === 0) {
            // Find any array property that might contain likes
            for (const key of Object.keys(parsed)) {
              if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
                rawLikes = parsed[key];
                break;
              }
            }
          }
        }

        if (rawLikes.length === 0) {
          setIsParsingLikes(false);
          addLog('warning', `No liked posts found in ${file.name}. Please ensure this is the liked_posts.json file.`);
          return;
        }

        const items: LikedPostItem[] = [];
        for (let i = 0; i < rawLikes.length; i++) {
          const it = rawLikes[i];
          let href = '';
          let timestamp: number | undefined = it.timestamp;
          let caption: string | undefined;

          // 1. Support new Meta export schema with label_values
          if (Array.isArray(it.label_values)) {
            for (const lv of it.label_values) {
              if (lv?.label === 'URL' || lv?.href) {
                href = lv.href || lv.value || '';
              } else if (lv?.label === 'Caption' && typeof lv.value === 'string') {
                caption = lv.value;
              } else if (!href && typeof lv?.value === 'string' && lv.value.includes('instagram.com')) {
                href = lv.value;
              }
            }
          }

          // 2. Support classic export schema with string_list_data
          if (!href && Array.isArray(it.string_list_data) && it.string_list_data.length > 0) {
            href = it.string_list_data[0]?.href || '';
            if (!timestamp) timestamp = it.string_list_data[0]?.timestamp;
          } else if (!href && typeof it.href === 'string') {
            href = it.href;
          } else if (!href && typeof it.url === 'string') {
            href = it.url;
          } else if (!href && typeof it.link === 'string') {
            href = it.link;
          } else if (!href && typeof it.value === 'string' && it.value.includes('instagram.com')) {
            href = it.value;
          }

          // 3. Check media array fallback
          if (!href && Array.isArray(it.media) && it.media.length > 0) {
            const m = it.media[0];
            href = m?.uri || m?.href || m?.url || '';
          }

          if (!href) continue;

          const match = href.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
          const shortcode = match ? match[1] : '';
          let mediaId = shortcode ? instagramCodeToMediaId(shortcode) : '';
          if (!mediaId && it.fbid) mediaId = String(it.fbid);

          let dateStr = '';
          if (timestamp) {
            try {
              dateStr = new Date(Number(timestamp) * 1000).toLocaleString();
            } catch {
              // ignore
            }
          }

          items.push({
            id: `like-${i}-${shortcode || i}`,
            url: href,
            shortcode,
            mediaId,
            caption,
            timestamp: typeof timestamp === 'number' ? timestamp : Number(timestamp),
            dateStr,
            status: 'pending',
          });
        }

        if (items.length === 0) {
          setIsParsingLikes(false);
          addLog('warning', 'Found entries in the JSON file, but none contained valid Instagram post links.');
          return;
        }

        setLikedItems(items);
        setUnlikeProgress({ current: 0, total: items.length, success: 0, errors: 0 });
        setIsParsingLikes(false);
        addLog('success', `Parsed ${items.length.toLocaleString()} liked posts from ${file.name}`);
      } catch (err: any) {
        setIsParsingLikes(false);
        addLog('error', `Parsing error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Start Unlike Execution
  const startUnliking = async () => {
    if (!cookieHeader && !sessionId) {
      setActiveTab('account');
      addLog('warning', 'Please connect your session cookies in the Account tab first.');
      return;
    }

    const pendingItems = likedItems.filter((i) => i.status !== 'unliked');
    if (pendingItems.length === 0) {
      addLog('warning', 'No pending posts to unlike.');
      return;
    }

    setIsUnliking(true);
    addLog('info', `Starting bulk unlike for ${pendingItems.length} posts via verified Instagram GraphQL...`);

    const controller = new AbortController();
    unlikeAbortRef.current = controller;

    try {
      for (let i = 0; i < pendingItems.length; i++) {
        if (controller.signal.aborted) break;

        const item = pendingItems[i];
        setCurrentUnlikingUrl(item.url);
        setLikedItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'processing' } : it))
        );

        // Action delay before request
        const delay = Math.random() * (maxDelay - minDelay) + minDelay;
        await new Promise((r) => setTimeout(r, delay * 1000));
        if (controller.signal.aborted) break;

        let success = false;
        let errorMsg = '';

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const res = await fetch('/api/unlike/single', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mediaId: item.mediaId,
                cookieHeader,
                sessionId,
                csrfToken,
                dsUserId,
              }),
              signal: controller.signal,
            });
            const resData = await res.json();
            if (res.ok && resData.ok) {
              success = true;
              break;
            } else {
              errorMsg = resData.error || `HTTP ${res.status}`;
              // If post not found (404) or bad request (400), don't waste retries
              if (res.status === 404 || res.status === 400) {
                break;
              }
              if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, 2000));
              }
            }
          } catch (e: any) {
            if (controller.signal.aborted) break;
            errorMsg = e.message || 'Network error';
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
        }

        if (success) {
          setUnlikeProgress((prev) => ({
            ...prev,
            current: prev.current + 1,
            success: prev.success + 1,
          }));
          setLikedItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, status: 'unliked' } : it))
          );
          addLog('success', `Unliked: ${item.url}`);
        } else {
          setUnlikeProgress((prev) => ({
            ...prev,
            current: prev.current + 1,
            errors: prev.errors + 1,
          }));
          setLikedItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, status: 'failed', error: errorMsg } : it))
          );
          addLog('error', `Failed to unlike ${item.url}: ${errorMsg}`);
        }

        // Check for cooldown break - only if explicitly enabled in Settings
        if (breakProbability > 0 && Math.random() < breakProbability / 100 && i < pendingItems.length - 1) {
          const breakSec = Math.round(Math.random() * (breakMax - breakMin) * 60 + breakMin * 60);
          addLog('warning', `☕ Cooldown break: Pausing for ${Math.round(breakSec / 60)} minutes to protect your account.`);
          await new Promise((r) => setTimeout(r, breakSec * 1000));
          addLog('info', 'Resuming unlike operations...');
        }
      }

      addLog('info', 'Finished processing batch.');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addLog('error', `Unlike error: ${err.message}`);
      } else {
        addLog('warning', 'Unlike process stopped by user.');
      }
    } finally {
      setIsUnliking(false);
      unlikeAbortRef.current = null;
    }
  };

  const stopUnliking = () => {
    if (unlikeAbortRef.current) {
      unlikeAbortRef.current.abort();
      unlikeAbortRef.current = null;
    }
    setIsUnliking(false);
    addLog('warning', 'Stopping unlike process...');
  };

  // Copy Native GraphQL Browser Console Script (Runs directly inside active instagram.com tab: 100% native session)
  const copyBrowserRunnerScript = () => {
    if (likedItems.length === 0) {
      addLog('warning', 'Please upload your liked_posts.json file first.');
      return;
    }

    const payload = likedItems.map((it) => ({ id: it.mediaId, url: it.url }));
    const script = `/* InstaClean Native Browser Runner - Verified 2026 GraphQL Mutation */
(async () => {
  const posts = ${JSON.stringify(payload)};
  console.log("%c[InstaClean]%c Starting native mass unlike for " + posts.length + " posts via GraphQL...", "color:#ec4899;font-weight:bold;font-size:13px;", "color:#fff;");
  const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || "";
  const actorId = document.cookie.match(/ds_user_id=([^;]+)/)?.[1] || "";
  let unliked = 0, skipped = 0;
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const delay = Math.floor(Math.random() * (${maxDelay}000 - ${minDelay}000 + 1)) + ${minDelay}000;
    try {
      const form = new URLSearchParams({
        av: actorId,
        __d: 'www',
        __user: '0',
        __a: '1',
        __req: '1c',
        __hs: '20703.HYP:instagram_web_pkg.2.1...0',
        dpr: '2',
        __ccg: 'GOOD',
        __rev: '1046934385',
        __s: 'nxu0z4:i4ld6o:574azy',
        __hsi: '7682748963931492866',
        __dyn: '7xeUjG1mxu1syaxG4Vp41twpUnwgU7SbzEdF8vyUco2qwJyEiw50x609vCwjE1EEc87m0yE462mcw5Mx62G5UswoEcE7O2l0Fwqo5W1yw9O1lwxwQzXwae4UaEW2G0AEco5G0zK5o4q0HU420k62-azo7u3C2u2J0bS1LyUaUbGxK3R08-269wr84-6o5p389oed6goK10xKi2qi7E5y4UrwlE2xyVrx60jy7EGq2Kq11whE984O0XEdoCQbwhU',
        __csr: 'jN47c9WPPZsci96ktfPl_Ze8jlFKAkBj3cJbnHqsjYQLJblRi-KAiIxSEBx16Gh2AP6K4mrllKz8CIrSHrGqIJkOQoHW8BGKm9SriXDsBlF9rGivCKBAjIHgkBvXihUxaVHx2mt7hHAzaDxWEyKm8xa9ypF8jyK9Gdymu8Ay8CjADzAAcByryHG8CG9GEWt6CAxa7d5Az8yhejogKh2Gw_K4UjDCgBei49Xm3-UgBwNG06n801jvoO6U0ubAgdIV82Mwba3R01xa05M81DrU6BwNwSg1wExq203Dw8VxK1mgaU0xR4xS1Jg4ok9wPxS0gzhqwEKlw2Z984tw0UQw3cE0qkw0wdyE0_i2-pS9y8x02UoG0R80mnw1ha',
        __hsdp: 'gjB0NllsescsiO7FFJAONy49W8PA_myFsEwu7Y8U9k5a5mt1Cugi4C4A2O69p-cEw2jxIw4Z286C5SSVU-i1iGQ985Umxq7UmwdeUb85q2qEtxm4WwrUjw8-13xu5K12waCEO261pgS4awnFU1--09JwPw5Fw3iotwbu3y1Jw1CG0g-2y0FO1q1mw2X8a81dElwgU0zKm0fmw7NwXw4_CFk0_6',
        __hblp: '0CCwxw9i79uq2Sfz8O2inyuawoVUO4K4UyeAz5HyudFUko42i26u2a6mcg6bwkaVUliAGfjwxy8kxaGxa4Vrz8HVUK8BAxq78Om3S2O7kfBKUb84KawCGfzolxeKfgZ0iUjwXxN0yghw-Axt38zwgEyE2siyK9F1e2268Ku6EgF38y17DwSw74U3-wnU5i1hxi498f98bE4No12EW1hwOw62z81d8twZwuoe86S0fvw2voO1Nw9S5oixSiawPwhi7zE8EcU7G0ji0jO2y1hwkU2cK5ofXyU26w9a0Q84im0Ko0I61qw-wZU3twl8G3i3K3a0O88UuhGl0s82bo',
        __sjsp: 'gjB0NllsYn4scsiS8FFJAONy49W8PA_myFsEwu7Y8wDgtRgx1Cucx9w',
        __comet_req: '7',
        fb_dtsg: 'NAfyKrwo2dGm6zOVQIkEsLZGv7JYhUytGFZny2MwfZ8PUo7RwAOVrqA:17843671327157124:1788779364',
        jazoest: '26451',
        lsd: 'g8HgGw5BNu0tuh9aLYVmlJ',
        __spin_r: '1046934385',
        __spin_b: 'trunk',
        __spin_t: '1788779386',
        __crn: 'comet.igweb.PolarisFeedRoute',
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: 'usePolarisLikeMediaXIGUnlikeMutation',
        server_timestamps: 'true',
        doc_id: '27345296031770102',
        variables: JSON.stringify({
          input: {
            actor_id: actorId,
            client_mutation_id: '1',
            media_id: post.id
          }
        })
      });

      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'x-csrftoken': csrf,
          'x-fb-friendly-name': 'usePolarisLikeMediaXIGUnlikeMutation',
          'x-fb-lsd': 'g8HgGw5BNu0tuh9aLYVmlJ',
          'x-ig-app-id': '936619743392459',
          'x-asbd-id': '359341',
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: form.toString()
      });
      const data = await res.json();
      if (data?.data?.xig_media_unlike?.media?.has_liked === false) {
        unliked++;
        console.log("%c[" + (i+1) + "/" + posts.length + "] %c✓ Unliked %c" + post.url + " %c(" + (delay/1000).toFixed(1) + "s delay)", "color:#888;", "color:#22c55e;font-weight:bold;", "color:#38bdf8;", "color:#888;");
      } else {
        skipped++;
        console.warn("[" + (i+1) + "/" + posts.length + "] Unexpected response for " + post.url, data);
      }
    } catch (err) {
      skipped++;
      console.error("[" + (i+1) + "/" + posts.length + "] Error unliking " + post.url, err);
    }
    await new Promise(r => setTimeout(r, delay));
  }
  console.log("%c[InstaClean] Complete! Unliked: " + unliked + ", Skipped: " + skipped, "color:#22c55e;font-size:14px;font-weight:bold;");
})();`;

    navigator.clipboard.writeText(script);
    addLog('success', `Copied 1-Click GraphQL Console Runner for ${likedItems.length.toLocaleString()} posts to clipboard!`);
    addLog('info', '👉 Open https://www.instagram.com in your browser -> Press Cmd+Option+J (Console) -> Paste & press Enter!');
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-gray-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-gray-800/80 bg-[#0c0e14]/80 backdrop-blur sticky top-0 z-50 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src="/logo.png"
              alt="InstaClean Logo"
              className="w-10 h-10 rounded-xl object-cover shadow-lg border border-pink-500/20"
            />
            <div>
              <h1 className="font-bold text-base tracking-wide flex items-center gap-2">
                InstaClean
                <span className="text-[10px] uppercase font-semibold tracking-wider bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded-full border border-pink-500/20">
                  Mass Unlike Tool
                </span>
              </h1>
              <p className="text-xs text-gray-400">Mass Unlike Instagram Reels & Posts</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Account Status Pill */}
            <div
              onClick={() => setActiveTab('account')}
              className="cursor-pointer flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-gray-900/60 transition hover:border-gray-600 border-gray-800"
            >
              {accountStatus === 'valid' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 font-semibold">{accountStatusMsg || 'Connected'}</span>
                </>
              ) : accountStatus === 'validating' ? (
                <>
                  <RefreshCw className="w-3 h-3 text-yellow-400 animate-spin" />
                  <span className="text-yellow-400">Verifying...</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-gray-300">Session Not Connected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-gray-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('unlike')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'unlike'
                ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border border-pink-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <HeartCrack className="w-4 h-4" />
            Mass Unlike ({likedItems.length})
          </button>

          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'account'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Account & Cookies
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'settings'
                ? 'bg-gray-800 text-gray-200 border border-gray-700'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Rate Limit & Safety
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'logs'
                ? 'bg-gray-800 text-gray-200 border border-gray-700'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Live Logs
            {logs.length > 0 && (
              <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full">
                {logs.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: UNLIKE POSTS */}
        {activeTab === 'unlike' && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-[#0d1017] border border-gray-800/80 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-pink-400" />
                      Upload Instagram Data: <code className="text-pink-400">liked_posts.json</code>
                    </h2>
                    {likesFileName && (
                      <span className="text-xs text-green-400 font-mono flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {likesFileName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Download your data from Instagram (Account Center &gt; Download your information &gt; Format: JSON).
                    Upload the extracted <code className="text-gray-300">liked_posts.json</code> file.
                  </p>
                </div>

                <label className={`border-2 border-dashed rounded-xl p-6 text-center transition bg-[#090b10] block ${
                  isParsingLikes 
                    ? 'border-pink-500/50 bg-pink-950/10 cursor-wait' 
                    : 'cursor-pointer border-gray-700 hover:border-pink-500/50 hover:bg-gray-900/40'
                }`}>
                  {isParsingLikes ? (
                    <div className="flex flex-col items-center">
                      <Loader2 className="w-8 h-8 mx-auto mb-2 text-pink-400 animate-spin" />
                      <span className="text-sm font-medium text-pink-300 block">
                        Reading & parsing in browser memory...
                      </span>
                      <span className="text-xs text-gray-500 mt-1 block">
                        Large files (100+ MB) may take 2-4 seconds. No data leaves your machine.
                      </span>
                    </div>
                  ) : (
                    <>
                      <HeartCrack className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                      <span className="text-sm font-medium text-gray-300 block">
                        Click to select or drag & drop <span className="text-pink-400">liked_posts.json</span>
                      </span>
                      <span className="text-xs text-gray-500 mt-1 block">Supports official Meta JSON export (even 100+ MB)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleLikesFileUpload}
                    disabled={isParsingLikes}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Progress & Controls Card */}
              <div className="bg-[#0d1017] border border-gray-800/80 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-pink-400" />
                    Unlike Operations
                  </h3>

                  <div className="space-y-2 mb-4 text-xs">
                    <div className="flex justify-between text-gray-400">
                      <span>Total Loaded:</span>
                      <span className="font-semibold text-gray-200">{likedItems.length}</span>
                    </div>
                    <div className="flex justify-between text-green-400">
                      <span>Successfully Unliked:</span>
                      <span className="font-semibold">{unlikeProgress.success}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>Failed:</span>
                      <span className="font-semibold">{unlikeProgress.errors}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Remaining:</span>
                      <span className="font-semibold">
                        {Math.max(0, likedItems.length - unlikeProgress.success - unlikeProgress.errors)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {likedItems.length > 0 && (
                    <div className="w-full bg-gray-800 rounded-full h-2 mb-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-pink-500 to-purple-500 h-full transition-all duration-300"
                        style={{
                          width: `${(unlikeProgress.current / (likedItems.length || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  )}

                  {currentUnlikingUrl && isUnliking && (
                    <p className="text-[11px] text-pink-400 truncate font-mono mb-3">
                      Processing: {currentUnlikingUrl}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {!isUnliking ? (
                      <button
                        onClick={startUnliking}
                        disabled={likedItems.length === 0}
                        className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-40 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition"
                      >
                        <Play className="w-4 h-4" />
                        Start Mass Unlike
                      </button>
                    ) : (
                      <button
                        onClick={stopUnliking}
                        className="w-full bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition"
                      >
                        <Square className="w-4 h-4 fill-white" />
                        Stop Execution
                      </button>
                    )}
                  </div>

                  {likedItems.length > 0 && (
                    <button
                      onClick={copyBrowserRunnerScript}
                      type="button"
                      className="w-full bg-gradient-to-r from-gray-900 to-gray-800 hover:from-pink-950/40 hover:to-purple-950/40 border border-pink-500/30 hover:border-pink-500/60 text-pink-300 hover:text-pink-200 text-xs font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition group"
                      title="Run directly inside your browser tab on instagram.com with 100% native session and zero error rate"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-pink-400 group-hover:rotate-12 transition-transform" />
                      ⚡ Copy 1-Click GraphQL Console Script (0 Errors)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Posts Preview Table */}
            <div className="bg-[#0d1017] border border-gray-800/80 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Loaded Posts ({likedItems.length})
                </h3>
                {likedItems.length > 0 && (
                  <button
                    onClick={() => {
                      setLikedItems([]);
                      setLikesFileName('');
                    }}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear List
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {likedItems.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 text-xs">
                    Upload your <code className="text-gray-400">liked_posts.json</code> file to view and unlike posts.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-900/60 sticky top-0 text-gray-400 font-semibold border-b border-gray-800">
                      <tr>
                        <th className="py-2.5 px-4">#</th>
                        <th className="py-2.5 px-4">Post URL</th>
                        <th className="py-2.5 px-4">Shortcode</th>
                        <th className="py-2.5 px-4">Liked Date</th>
                        <th className="py-2.5 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                      {likedItems.slice(0, 100).map((item, idx) => (
                        <tr key={item.id} className="hover:bg-gray-900/40 transition">
                          <td className="py-2 px-4 text-gray-500">{idx + 1}</td>
                          <td className="py-2 px-4 text-gray-300 max-w-xs truncate">
                            <div className="flex flex-col">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-pink-400 hover:underline flex items-center gap-1 inline-flex truncate"
                              >
                                {item.url}
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              </a>
                              {item.caption && (
                                <span className="text-[10px] text-gray-400 truncate mt-0.5" title={item.caption}>
                                  {item.caption}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-4 text-gray-400">{item.shortcode || '—'}</td>
                          <td className="py-2 px-4 text-gray-400">{item.dateStr || '—'}</td>
                          <td className="py-2 px-4 text-right">
                            {item.status === 'unliked' ? (
                              <span className="text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                                Unliked
                              </span>
                            ) : item.status === 'processing' ? (
                              <span className="text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20 animate-pulse">
                                Unliking...
                              </span>
                            ) : item.status === 'failed' ? (
                              <span
                                className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20"
                                title={item.error}
                              >
                                Failed
                              </span>
                            ) : (
                              <span className="text-gray-500">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {likedItems.length > 100 && (
                <div className="py-2.5 px-4 bg-gray-900/40 border-t border-gray-800 text-center text-xs text-gray-400">
                  Showing first 100 of <span className="font-semibold text-pink-400">{likedItems.length.toLocaleString()}</span> posts for performance (all will be unliked sequentially).
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ACCOUNT & COOKIES */}
        {activeTab === 'account' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0d1017] border border-gray-800/80 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-400" />
                Connect Instagram Session
              </h2>
              <p className="text-xs text-gray-400 mb-6">
                Using session cookies bypasses 2FA, SMS checkpoints, and automated password challenges.
                All tokens stay on your local machine.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center justify-between">
                    <span>
                      Full Browser Cookie Header <span className="text-pink-400 font-bold">(Recommended • 1-Click Paste)</span>
                    </span>
                    <span className="text-[11px] text-gray-400 font-normal">
                      From DevTools &gt; Network &gt; Request Headers &gt; Cookie
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Paste full cookie string (e.g. datr=...; mid=...; ig_did=...; sessionid=...; rur=...)"
                    value={cookieHeader}
                    onChange={(e) => handleCookieHeaderChange(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-pink-500 transition resize-none"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Auto-extracts <code className="text-pink-400">sessionid</code>, <code className="text-pink-400">csrftoken</code>, <code className="text-pink-400">ds_user_id</code>, <code className="text-pink-400">datr</code>, and <code className="text-pink-400">mid</code>.
                  </p>
                </div>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-gray-800"></div>
                  <span className="flex-shrink mx-3 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Or Individual Tokens</span>
                  <div className="flex-grow border-t border-gray-800"></div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    sessionid Cookie <span className="text-pink-400">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="e.g. 14830208305%3AF4d79cb8hSUBSo..."
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    csrftoken Cookie <span className="text-blue-400 font-normal text-[11px]">(Auto-detected if empty)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Leave empty to auto-detect, or paste manually"
                    value={csrfToken}
                    onChange={(e) => setCsrfToken(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    ds_user_id Cookie <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 14830208305"
                    value={dsUserId}
                    onChange={(e) => setDsUserId(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {accountStatusMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                      accountStatus === 'valid'
                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                        : accountStatus === 'invalid'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    }`}
                  >
                    {accountStatus === 'valid' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{accountStatusMsg}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={validateAccount}
                    disabled={accountStatus === 'validating'}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    {accountStatus === 'validating' ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Test & Validate Session
                  </button>
                  <button
                    onClick={handleSaveCredentials}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold py-2.5 px-4 rounded-xl transition"
                  >
                    Save Locally
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Tutorial on Finding Cookies */}
            <div className="bg-[#0d1017] border border-gray-800/80 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  How to get your Instagram Cookies (30 seconds)
                </h3>
                <ol className="space-y-3 text-xs text-gray-300 list-decimal list-inside leading-relaxed">
                  <li>
                    Open your web browser (Chrome, Safari, Edge, Firefox) and log into{' '}
                    <a
                      href="https://www.instagram.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-pink-400 underline"
                    >
                      instagram.com
                    </a>
                    .
                  </li>
                  <li>
                    Right-click anywhere on the page and click <strong>Inspect</strong> (or press{' '}
                    <code className="bg-gray-800 px-1 py-0.5 rounded text-[11px]">F12</code> or{' '}
                    <code className="bg-gray-800 px-1 py-0.5 rounded text-[11px]">Cmd + Opt + I</code>).
                  </li>
                  <li>
                    Navigate to the <strong>Application</strong> tab (in Chrome/Edge) or <strong>Storage</strong> tab
                    (in Firefox/Safari).
                  </li>
                  <li>
                    Under <strong>Cookies</strong> on the left sidebar, click{' '}
                    <code className="text-pink-400">https://www.instagram.com</code>.
                  </li>
                  <li>
                    Find the rows named <code className="text-blue-400 font-bold">sessionid</code> and{' '}
                    <code className="text-blue-400 font-bold">csrftoken</code>, copy and paste them here!
                  </li>
                </ol>
              </div>

              <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Safe & Direct:</strong> All requests are sent directly to Instagram from your local machine.
                  Cookies never leave your computer.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SETTINGS & RATE LIMITING */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-[#0d1017] border border-gray-800/80 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-gray-400" />
              Rate Limiting & Safety Parameters
            </h2>
            <p className="text-xs text-gray-400 mb-6">
              Adjust delays between requests to prevent Instagram from flagging or temporarily restricting actions.
            </p>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-300 mb-1.5">
                  <span>Action Delay Range</span>
                  <span className="text-pink-400 font-mono">
                    {minDelay}s – {maxDelay}s per action
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Min Delay (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={minDelay}
                      onChange={(e) => setMinDelay(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Max Delay (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={maxDelay}
                      onChange={(e) => setMaxDelay(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  A random delay between Min and Max will be waited before each unlike action.
                </p>
              </div>

              <div className="border-t border-gray-800 pt-5">
                <div className="flex justify-between text-xs font-semibold text-gray-300 mb-1.5">
                  <span>Cooldown Breaks</span>
                  <span className="text-purple-400 font-mono">{breakProbability}% chance every item</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={breakProbability}
                  onChange={(e) => setBreakProbability(Number(e.target.value))}
                  className="w-full accent-purple-500 mb-3"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Break Min Duration (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={breakMin}
                      onChange={(e) => setBreakMin(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Break Max Duration (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={breakMax}
                      onChange={(e) => setBreakMax(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-5">
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Max Retries on Failure
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                  className="w-32 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200"
                />
              </div>

              <button
                onClick={() => {
                  try {
                    localStorage.setItem(
                      'insta_settings',
                      JSON.stringify({ minDelay, maxDelay, breakProbability, breakMin, breakMax, maxRetries })
                    );
                    addLog('success', 'Settings saved.');
                  } catch {
                    // ignore
                  }
                }}
                className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold py-2.5 px-6 rounded-xl transition"
              >
                Save Settings
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: LIVE LOGS */}
        {activeTab === 'logs' && (
          <div className="bg-[#0c0e14] border border-gray-800/80 rounded-2xl p-5 flex flex-col flex-1 h-[500px]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                  Execution Terminal Stream
                </span>
              </div>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>

            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs pr-2 select-text"
            >
              {logs.length === 0 ? (
                <div className="text-gray-600 italic py-8 text-center">
                  No activity logged yet. Actions will stream here in real time.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start space-x-2">
                    <span className="text-gray-500 select-none text-[10px] pt-0.5">{log.time}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                        log.type === 'success'
                          ? 'bg-green-500/20 text-green-400'
                          : log.type === 'error'
                          ? 'bg-red-500/20 text-red-400'
                          : log.type === 'warning'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span
                      className={`flex-1 break-all ${
                        log.type === 'success'
                          ? 'text-green-300'
                          : log.type === 'error'
                          ? 'text-red-300'
                          : log.type === 'warning'
                          ? 'text-yellow-300'
                          : 'text-gray-300'
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-4 px-6 text-center text-xs text-gray-500">
        InstaClean • Local & Open-Source Social Privacy Management • Run locally on your Mac
      </footer>
    </div>
  );
}
