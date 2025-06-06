#!/bin/bash
# Update existing man pages with real content from the host system

echo "Updating man pages with real system content..."

# Create a temporary directory for man pages
TEMP_DIR="/tmp/real_manpages"
rm -rf $TEMP_DIR
mkdir -p $TEMP_DIR

# List of commands to update
COMMANDS=(
    "ls" "grep" "find" "cp" "mv" "rm" "cat" "echo" "sed" "awk"
    "git" "make" "python" "curl" "wget" "ssh" "tar" "gzip"
    "ps" "top" "kill" "df" "du" "chmod" "chown"
)

# Export real man pages from host
for cmd in "${COMMANDS[@]}"; do
    echo "Exporting man page for $cmd..."
    # Try to get the raw groff source
    if man -w "$cmd" 2>/dev/null; then
        MAN_PATH=$(man -w "$cmd" 2>/dev/null)
        if [[ -f "$MAN_PATH" ]]; then
            # Copy the file preserving structure
            DEST_FILE="$TEMP_DIR/${cmd}.man"
            if [[ "$MAN_PATH" == *.gz ]]; then
                gunzip -c "$MAN_PATH" > "$DEST_FILE"
            else
                cp "$MAN_PATH" "$DEST_FILE"
            fi
            echo "  Exported: $cmd -> $DEST_FILE"
        fi
    else
        # Fallback: export formatted man page
        if man "$cmd" > "$TEMP_DIR/${cmd}.txt" 2>/dev/null; then
            echo "  Exported formatted: $cmd"
        fi
    fi
done

# Copy to Docker container
echo "Copying man pages to container..."
docker cp $TEMP_DIR betterman-backend-1:/tmp/real_manpages

# Update the database with real content
echo "Updating database with real man pages..."
docker-compose exec backend python -c "
import os
import json
from src.db.session import get_db
from src.models.document import Document
from src.parser.linux_parser import LinuxManParser
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

parser = LinuxManParser()
updated = 0

with next(get_db()) as db:
    manpage_dir = '/tmp/real_manpages'
    if os.path.exists(manpage_dir):
        for filename in os.listdir(manpage_dir):
            if filename.endswith('.man'):
                command = filename.replace('.man', '')
                filepath = os.path.join(manpage_dir, filename)
                
                with open(filepath, 'r') as f:
                    content = f.read()
                
                # Find and update the document
                doc = db.query(Document).filter(Document.name == command).first()
                if doc and content:
                    try:
                        parsed = parser.parse_man_page(content)
                        doc.raw_content = content[:1000000]
                        doc.content = json.dumps(parsed)
                        doc.title = parsed.get('title', command)
                        updated += 1
                        logger.info(f'Updated {command} with real man page')
                    except Exception as e:
                        logger.error(f'Error parsing {command}: {e}')
    
    db.commit()
    logger.info(f'Updated {updated} man pages with real content')
"

# Cleanup
rm -rf $TEMP_DIR

echo "Update complete! Restart services to see changes."
docker-compose restart backend