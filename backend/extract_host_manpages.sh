#!/bin/bash
# Extract man pages from host system and save them for loading into database

MANPAGE_DIR="extracted_manpages"
mkdir -p "$MANPAGE_DIR"

# List of commands to extract
COMMANDS=(
    # Core file operations
    "ls:1" "cp:1" "mv:1" "rm:1" "mkdir:1" "rmdir:1" "touch:1"
    "ln:1" "readlink:1" "basename:1" "dirname:1" "realpath:1"
    
    # File viewing and editing
    "cat:1" "less:1" "more:1" "head:1" "tail:1" "tee:1"
    "nano:1" "vi:1" "vim:1" "ed:1" "emacs:1"
    
    # Text processing
    "grep:1" "sed:1" "awk:1" "cut:1" "sort:1" "uniq:1"
    "tr:1" "wc:1" "fold:1" "paste:1" "join:1" "comm:1"
    "diff:1" "patch:1" "cmp:1" "colrm:1" "column:1"
    
    # File info and search
    "find:1" "locate:1" "which:1" "whereis:1" "file:1"
    "stat:1" "du:1" "df:1" "lsof:8" "fuser:1"
    
    # Archives and compression
    "tar:1" "gzip:1" "gunzip:1" "zip:1" "unzip:1"
    "bzip2:1" "bunzip2:1" "xz:1" "7z:1" "rar:1"
    
    # Process management
    "ps:1" "top:1" "htop:1" "kill:1" "killall:1" "pkill:1"
    "pgrep:1" "jobs:1" "bg:1" "fg:1" "nohup:1" "nice:1"
    "renice:1" "time:1" "timeout:1" "watch:1"
    
    # System info
    "uname:1" "hostname:1" "hostnamectl:1" "uptime:1" "date:1"
    "cal:1" "who:1" "whoami:1" "id:1" "groups:1" "users:1"
    "finger:1" "last:1" "lastlog:1" "w:1"
    
    # Network tools
    "ping:8" "traceroute:8" "netstat:8" "ss:8" "ip:8"
    "ifconfig:8" "route:8" "arp:8" "dig:1" "host:1"
    "nslookup:1" "wget:1" "curl:1" "ssh:1" "scp:1"
    "rsync:1" "ftp:1" "sftp:1" "telnet:1" "nc:1"
    
    # Package management
    "apt:8" "apt-get:8" "apt-cache:8" "dpkg:1" "snap:1"
    "flatpak:1" "pip:1" "pip3:1" "npm:1" "yarn:1"
    
    # Development tools
    "git:1" "make:1" "gcc:1" "g++:1" "clang:1" "cmake:1"
    "python:1" "python3:1" "node:1" "ruby:1" "perl:1"
    "go:1" "rustc:1" "cargo:1" "javac:1" "java:1"
    
    # System administration
    "sudo:8" "su:1" "passwd:1" "useradd:8" "userdel:8"
    "usermod:8" "groupadd:8" "groupdel:8" "groupmod:8"
    "chown:1" "chgrp:1" "chmod:1" "umask:1" "visudo:8"
    
    # System services
    "systemctl:1" "service:8" "journalctl:1" "dmesg:1"
    "mount:8" "umount:8" "fdisk:8" "parted:8" "mkfs:8"
    "fsck:8" "blkid:8" "lsblk:8" "findmnt:8"
    
    # Shell and scripting
    "bash:1" "sh:1" "zsh:1" "fish:1" "dash:1"
    "source:1" "export:1" "alias:1" "history:1" "fc:1"
    "test:1" "expr:1" "let:1" "eval:1" "exec:1"
    
    # Environment and variables
    "env:1" "printenv:1" "set:1" "unset:1" "export:1"
    "locale:1" "getconf:1" "ldconfig:8" "ldd:1"
    
    # Performance monitoring
    "vmstat:8" "iostat:1" "mpstat:1" "sar:1" "free:1"
    "iotop:8" "nethogs:8" "iftop:8" "tcpdump:8" "strace:1"
    "ltrace:1" "perf:1" "dstat:1" "glances:1"
    
    # Security tools
    "gpg:1" "openssl:1" "ssh-keygen:1" "ssh-add:1"
    "ssh-agent:1" "sshpass:1" "fail2ban:1" "ufw:8"
    "iptables:8" "firewall-cmd:1" "selinux:8"
    
    # Misc utilities
    "xargs:1" "tty:1" "clear:1" "reset:1" "script:1"
    "screen:1" "tmux:1" "nohup:1" "disown:1" "wait:1"
    "sleep:1" "yes:1" "seq:1" "shuf:1" "factor:1"
    "bc:1" "dc:1" "units:1" "ascii:1" "rev:1"
)

echo "Extracting man pages from host system..."

for cmd_section in "${COMMANDS[@]}"; do
    IFS=':' read -r cmd section <<< "$cmd_section"
    
    echo "Extracting $cmd($section)..."
    
    # Get formatted version
    man $section $cmd 2>/dev/null > "$MANPAGE_DIR/${cmd}.${section}.formatted" || echo "  Failed: $cmd"
    
    # Get plain text version
    man $section $cmd 2>/dev/null | col -b > "$MANPAGE_DIR/${cmd}.${section}.plain" || echo "  Failed: $cmd"
done

echo "Done. Man pages extracted to $MANPAGE_DIR/"