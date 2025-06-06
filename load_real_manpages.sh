#!/bin/bash
# Load real man pages from the host system into BetterMan

echo "Loading real man pages from host system..."

# Create a temporary directory for man pages
TEMP_DIR="/tmp/real_manpages_export"
rm -rf $TEMP_DIR
mkdir -p $TEMP_DIR

# Core commands to load
COMMANDS=(
    # File operations
    "ls" "cd" "cp" "mv" "rm" "mkdir" "rmdir" "pwd" "cat" "touch"
    "chmod" "chown" "ln" "find" "locate" "which" "file" "stat"
    
    # Text processing
    "grep" "sed" "awk" "cut" "sort" "uniq" "wc" "head" "tail" "less" "more"
    "vim" "nano" "diff" "patch"
    
    # System info
    "ps" "top" "htop" "kill" "jobs" "df" "du" "mount" "umount" "free"
    "uname" "hostname" "uptime" "who" "w" "id" "date"
    
    # Network
    "ping" "curl" "wget" "ssh" "scp" "rsync" "netstat" "ss" "ip" "ifconfig"
    "dig" "nslookup" "host" "traceroute"
    
    # Development
    "git" "make" "gcc" "python" "python3" "pip" "npm" "docker" "docker-compose"
    "tar" "gzip" "zip" "unzip"
    
    # Package management
    "apt" "apt-get" "dpkg" "snap" "systemctl" "journalctl" "service"
)

# Export man pages from host
echo "Exporting man pages from host system..."
EXPORTED=0
FAILED=0

for cmd in "${COMMANDS[@]}"; do
    # Try to find the man page file
    MAN_PATH=$(man -w "$cmd" 2>/dev/null || true)
    
    if [[ -n "$MAN_PATH" && -f "$MAN_PATH" ]]; then
        DEST_FILE="$TEMP_DIR/${cmd}.man"
        
        # Handle compressed files
        if [[ "$MAN_PATH" == *.gz ]]; then
            gunzip -c "$MAN_PATH" > "$DEST_FILE" 2>/dev/null || continue
        elif [[ "$MAN_PATH" == *.bz2 ]]; then
            bunzip2 -c "$MAN_PATH" > "$DEST_FILE" 2>/dev/null || continue
        else
            cp "$MAN_PATH" "$DEST_FILE" 2>/dev/null || continue
        fi
        
        if [[ -f "$DEST_FILE" && -s "$DEST_FILE" ]]; then
            echo "✓ Exported: $cmd"
            ((EXPORTED++))
        else
            echo "✗ Failed to export: $cmd (empty file)"
            rm -f "$DEST_FILE"
            ((FAILED++))
        fi
    else
        # Try to get formatted man page as fallback
        if man "$cmd" > "$TEMP_DIR/${cmd}.txt" 2>/dev/null; then
            echo "✓ Exported (formatted): $cmd"
            ((EXPORTED++))
        else
            echo "✗ Not found: $cmd"
            ((FAILED++))
        fi
    fi
done

echo ""
echo "Export complete: $EXPORTED successful, $FAILED failed"

# Copy to Docker container
echo ""
echo "Copying man pages to container..."
docker cp $TEMP_DIR betterman-backend-1:/tmp/real_manpages

# Load into database
echo ""
echo "Loading man pages into database..."
docker-compose exec backend python -c "
import os
import json
import logging
from pathlib import Path
from src.db.session import get_db
from src.models.document import Document
from src.parser.linux_parser import LinuxManParser
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

parser = LinuxManParser()
loaded = 0
updated = 0
errors = 0

with next(get_db()) as db:
    manpage_dir = Path('/tmp/real_manpages')
    if not manpage_dir.exists():
        logger.error('Man page directory not found')
        exit(1)
    
    for filepath in manpage_dir.iterdir():
        if not filepath.is_file():
            continue
            
        # Extract command name
        if filepath.suffix == '.man':
            command = filepath.stem
            is_raw = True
        elif filepath.suffix == '.txt':
            command = filepath.stem
            is_raw = False
        else:
            continue
        
        try:
            # Read content
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            if not content.strip():
                logger.warning(f'Empty file: {command}')
                continue
            
            # Parse the man page
            if is_raw:
                # Raw groff content
                parsed = parser.parse_man_page(content)
            else:
                # Pre-formatted content - create basic structure
                parsed = {
                    'title': command.upper(),
                    'section': '1',
                    'sections': [
                        {
                            'name': 'DESCRIPTION',
                            'content': content
                        }
                    ],
                    'related': []
                }
            
            # Check if document exists
            existing = db.query(Document).filter(
                Document.name == command
            ).first()
            
            if existing:
                # Update existing
                existing.content = json.dumps(parsed)
                existing.raw_content = content[:1000000]  # Limit size
                existing.title = parsed.get('title', command)
                existing.updated_at = datetime.utcnow()
                updated += 1
                logger.info(f'Updated: {command}')
            else:
                # Create new
                doc = Document(
                    name=command,
                    section=parsed.get('section', '1'),
                    title=parsed.get('title', command),
                    content=json.dumps(parsed),
                    raw_content=content[:1000000],
                    category='user-commands' if parsed.get('section', '1') == '1' else 'other',
                    tags='real,system',
                    meta_info={
                        'source': 'system',
                        'loaded_at': datetime.utcnow().isoformat()
                    }
                )
                db.add(doc)
                loaded += 1
                logger.info(f'Loaded: {command}')
                
        except Exception as e:
            logger.error(f'Error processing {command}: {e}')
            errors += 1
            continue
    
    db.commit()
    
print(f'')
print(f'Loading complete!')
print(f'  New documents: {loaded}')
print(f'  Updated documents: {updated}')
print(f'  Errors: {errors}')
print(f'  Total in database: {db.query(Document).count()}')
"

# Cleanup
rm -rf $TEMP_DIR

echo ""
echo "✅ Real man pages loaded successfully!"
echo ""
echo "You can now:"
echo "1. Visit http://localhost:5173 to see the man pages"
echo "2. Search for commands like 'ls', 'grep', 'git', etc."
echo "3. The pages should display without groff formatting artifacts"