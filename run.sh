#!/usr/bin/env bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

clear

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          Instagram Mass Unlike Tool Launcher             ║"
echo "║              Web Dashboard & Python CLI                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${BOLD}Select how you want to run the tool:${NC}"
echo -e "  ${GREEN}1)${NC} ${BOLD}Launch Web Dashboard${NC} (Next.js - http://localhost:3001)"
echo -e "  ${BLUE}2)${NC} ${BOLD}Run Python CLI Tool${NC} (Terminal Interactive Menu)"
echo -e "  ${YELLOW}3)${NC} Install / Update Dependencies"
echo -e "  ${RED}0)${NC} Exit"
echo

read -p "Enter your choice [1-3, 0]: " choice

case $choice in
    1)
        echo
        echo -e "${GREEN}[*] Starting Next.js Web Dashboard...${NC}"
        echo -e "${YELLOW}Open your browser at: ${CYAN}http://localhost:3001${NC}"
        echo -e "${YELLOW}Press Ctrl+C anytime to stop the server.${NC}"
        echo
        npx next dev -p 3001
        ;;
    2)
        echo
        echo -e "${BLUE}[*] Launching Python CLI Tool...${NC}"
        python3 instagram_tool.py
        ;;
    3)
        echo
        echo -e "${YELLOW}[*] Checking & Installing dependencies...${NC}"
        npm install
        echo -e "${GREEN}[✓] Setup completed! Run ./run.sh again to start.${NC}"
        ;;
    0)
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}[!] Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac