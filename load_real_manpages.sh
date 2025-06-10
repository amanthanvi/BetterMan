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

# Function to export a man page
export_manpage() {
    local cmd=$1
    local section=${2:-""}
    
    # Build man command with optional section
    local man_cmd="man"
    if [[ -n "$section" ]]; then
        man_cmd="man $section"
    fi
    
    # Try to find the man page file
    MAN_PATH=$($man_cmd -w "$cmd" 2>/dev/null || true)
    
    if [[ -n "$MAN_PATH" && -f "$MAN_PATH" ]]; then
        # Determine output filename
        if [[ -n "$section" ]]; then
            DEST_FILE="$TEMP_DIR/${cmd}.${section}.man"
        else
            DEST_FILE="$TEMP_DIR/${cmd}.man"
        fi
        
        # Handle compressed files
        if [[ "$MAN_PATH" == *.gz ]]; then
            gunzip -c "$MAN_PATH" > "$DEST_FILE" 2>/dev/null || return 1
        elif [[ "$MAN_PATH" == *.bz2 ]]; then
            bunzip2 -c "$MAN_PATH" > "$DEST_FILE" 2>/dev/null || return 1
        elif [[ "$MAN_PATH" == *.xz ]]; then
            xzcat "$MAN_PATH" > "$DEST_FILE" 2>/dev/null || return 1
        else
            cp "$MAN_PATH" "$DEST_FILE" 2>/dev/null || return 1
        fi
        
        if [[ -f "$DEST_FILE" && -s "$DEST_FILE" ]]; then
            return 0
        else
            rm -f "$DEST_FILE"
            return 1
        fi
    else
        # Try to get formatted man page as fallback
        local fallback_file
        if [[ -n "$section" ]]; then
            fallback_file="$TEMP_DIR/${cmd}.${section}.txt"
        else
            fallback_file="$TEMP_DIR/${cmd}.txt"
        fi
        
        if $man_cmd "$cmd" > "$fallback_file" 2>/dev/null; then
            if [[ -s "$fallback_file" ]]; then
                return 0
            else
                rm -f "$fallback_file"
                return 1
            fi
        fi
    fi
    return 1
}

# Export regular commands
for cmd in "${COMMANDS[@]}"; do
    if export_manpage "$cmd"; then
        echo "✓ Exported: $cmd"
        ((EXPORTED++))
    else
        echo "✗ Not found: $cmd"
        ((FAILED++))
    fi
done

# Also export some important library functions (section 3)
LIBRARY_FUNCS=("printf" "malloc" "free" "open" "close" "read" "write" "socket" "pthread_create")
echo ""
echo "Exporting library functions..."
for func in "${LIBRARY_FUNCS[@]}"; do
    if export_manpage "$func" "3"; then
        echo "✓ Exported: $func(3)"
        ((EXPORTED++))
    fi
done

# Export some config files (section 5)
CONFIG_FILES=("passwd" "fstab" "hosts" "resolv.conf" "sudoers" "crontab")
echo ""
echo "Exporting configuration files..."
for conf in "${CONFIG_FILES[@]}"; do
    if export_manpage "$conf" "5"; then
        echo "✓ Exported: $conf(5)"
        ((EXPORTED++))
    fi
done

echo ""
echo "Export complete: $EXPORTED successful, $FAILED failed"

# Copy to Docker container
echo ""
echo "Copying man pages to container..."
# Create directory in container
docker exec betterman-backend-1 mkdir -p /app/data/real_manpages
# Copy files
docker cp $TEMP_DIR/. betterman-backend-1:/app/data/real_manpages/

# Load into database
echo ""
echo "Loading man pages into database..."
docker exec betterman-backend-1 python -m src.parser.load_real_manpages /app/data/real_manpages

# Cleanup - commented out for debugging
# rm -rf $TEMP_DIR
echo "Temporary files kept at: $TEMP_DIR"

echo ""
echo "✅ Real man pages loaded successfully!"
echo ""
echo "You can now:"
echo "1. Visit http://localhost:5173 to see the man pages"
echo "2. Search for commands like 'ls', 'grep', 'git', etc."
echo "3. The pages should display without groff formatting artifacts"