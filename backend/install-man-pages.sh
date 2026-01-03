#!/bin/bash
# Script to install man pages for common Linux commands

set -e

echo "Installing man pages for common Linux commands..."

# Update package list
apt-get update

# Install man-db first
apt-get install -y man-db manpages manpages-dev

# Install coreutils and its man pages
apt-get install -y coreutils coreutils-doc || true

# Install packages with their documentation
PACKAGES=(
    # Core utilities
    "coreutils"
    "util-linux"
    "procps"
    "findutils"
    "diffutils"
    
    # Text processing
    "grep"
    "sed"
    "gawk"
    
    # Network tools
    "net-tools"
    "iproute2"
    "curl"
    "wget"
    "openssh-client"
    
    # Archive tools
    "tar"
    "gzip"
    "bzip2"
    "xz-utils"
    
    # Development tools
    "git"
    "vim"
    "nano"
    
    # Shell
    "bash"
    "dash"
)

# Install each package
for pkg in "${PACKAGES[@]}"; do
    echo "Installing $pkg..."
    apt-get install -y "$pkg" || true
done

# Download and install man pages directly from Debian repositories
echo "Downloading additional man pages..."
cd /tmp

# Download manpages-posix if available
apt-get download manpages-posix manpages-posix-dev 2>/dev/null || true
dpkg -i manpages-posix*.deb 2>/dev/null || true

# Update man database
mandb

# Verify installation
echo "Verifying man pages installation..."
echo "Total man pages found:"
find /usr/share/man -type f -name "*.gz" | wc -l

echo "Sample man pages in section 1:"
ls /usr/share/man/man1/*.1.gz 2>/dev/null | head -10 || echo "No man1 pages found"

echo "Checking for specific commands:"
for cmd in ls grep curl git tar ps; do
    if man -w "$cmd" 2>/dev/null; then
        echo "✓ Found man page for $cmd"
    else
        echo "✗ Missing man page for $cmd"
    fi
done

# Clean up
rm -rf /tmp/*.deb
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "Man pages installation complete!"