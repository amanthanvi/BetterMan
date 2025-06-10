#!/bin/bash
# Script to load real man pages into the BetterMan database

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${BLUE}==================================================================${NC}"
echo -e "${BLUE}BetterMan - Real Man Page Loader${NC}"
echo -e "${BLUE}==================================================================${NC}"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Virtual environment not found. Creating one...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
echo -e "${GREEN}Activating virtual environment...${NC}"
source venv/bin/activate

# Install/update dependencies
echo -e "${GREEN}Checking dependencies...${NC}"
pip install -q -r requirements.txt

# Show options
echo ""
echo -e "${YELLOW}Select loading option:${NC}"
echo "1) Quick load - Load common commands only (fast)"
echo "2) Comprehensive load - Load ALL man pages (slow, complete)"
echo "3) Load specific sections (1-8)"
echo "4) Dry run - See what would be loaded without changes"
echo "5) Resume previous loading session"
echo ""

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo -e "${GREEN}Starting quick load of common commands...${NC}"
        echo ""
        python src/db/quick_load_manpages.py
        ;;
    2)
        echo -e "${YELLOW}WARNING: This will load ALL man pages from your system.${NC}"
        echo -e "${YELLOW}This can take a long time and use significant resources.${NC}"
        read -p "Continue? (y/N): " confirm
        if [[ $confirm == [yY] ]]; then
            echo -e "${GREEN}Starting comprehensive man page loading...${NC}"
            echo ""
            python src/db/load_comprehensive_manpages.py
        else
            echo -e "${RED}Cancelled.${NC}"
            exit 0
        fi
        ;;
    3)
        echo "Enter sections to load (space-separated, e.g., '1 2 3'):"
        read -p "Sections: " sections
        echo -e "${GREEN}Loading sections: $sections${NC}"
        echo ""
        python src/db/load_comprehensive_manpages.py --sections $sections
        ;;
    4)
        echo -e "${GREEN}Running dry run to discover available man pages...${NC}"
        echo ""
        python src/db/load_comprehensive_manpages.py --dry-run
        ;;
    5)
        echo "Enter the session ID to resume:"
        read -p "Session ID: " session_id
        echo -e "${GREEN}Resuming session: $session_id${NC}"
        echo ""
        python src/db/load_comprehensive_manpages.py --resume "$session_id"
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}Loading complete!${NC}"
echo -e "${GREEN}==================================================================${NC}"

# Show database statistics
echo ""
echo -e "${BLUE}Database Statistics:${NC}"
python -c "
from src.db.session import SessionLocal
from src.models.document import Document
db = SessionLocal()
total = db.query(Document).count()
sections = db.query(Document.section).distinct().count()
print(f'Total documents: {total}')
print(f'Unique sections: {sections}')
db.close()
"

echo ""
echo -e "${YELLOW}You can now start the BetterMan services with:${NC}"
echo "  cd .. && docker-compose up"