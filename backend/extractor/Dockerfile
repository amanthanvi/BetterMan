# backend/Dockerfile.extractor
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

# 1) CRITICAL: Remove Docker's documentation exclusion BEFORE ANY INSTALLS
#    Docker's Ubuntu images exclude man pages by default via dpkg config
RUN set -eux; \
    rm -f /etc/dpkg/dpkg.cfg.d/01_nodoc || true; \
    rm -f /etc/dpkg/dpkg.cfg.d/docker-* || true; \
    rm -f /etc/dpkg/dpkg.cfg.d/excludes || true; \
    echo 'path-include=/usr/share/man/*' > /etc/dpkg/dpkg.cfg.d/99-restore-man; \
    echo 'path-include=/usr/share/doc/*' >> /etc/dpkg/dpkg.cfg.d/99-restore-man; \
    echo 'path-include=/usr/share/groff/*' >> /etc/dpkg/dpkg.cfg.d/99-restore-man; \
    echo 'path-include=/usr/share/info/*' >> /etc/dpkg/dpkg.cfg.d/99-restore-man; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv ca-certificates postgresql-client \
        man-db groff-base less locales \
        manpages manpages-dev manpages-posix manpages-posix-dev; \
    locale-gen en_US.UTF-8; \
    update-locale LANG=en_US.UTF-8

# 2) Run unminimize to restore all documentation (this is the KEY step)
#    This script restores man pages that were stripped from the minimal image
RUN set -eux; \
    yes | unminimize || true; \
    apt-get update; \
    apt-get install -y man-db manpages manpages-dev manpages-posix manpages-posix-dev

# 3) CRITICAL: Reinstall core packages WITH --reinstall so their man pages are fetched
#    These packages exist in base image but were installed without man pages
RUN set -eux; \
    apt-get update; \
    apt-get install -y --reinstall \
        coreutils findutils grep sed gawk \
        util-linux procps iproute2 net-tools \
        tar gzip bzip2 xz-utils zip unzip \
        curl wget git git-man openssh-client \
        vim nano less rsync \
        which file diffutils bsdmainutils; \
    mandb --create || mandb -q; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for better caching
COPY requirements-extractor.txt /tmp/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /tmp/requirements.txt && \
    pip3 install --break-system-packages --no-cache-dir python-dotenv

# Copy application code
COPY . /app/

# 4) CRITICAL BUILD VERIFICATION: Fail the build if man pages aren't present
RUN set -eux; \
    echo "=== Verifying Man Pages Installation ==="; \
    # Check that man pages actually have content (not minimized messages)
    test_output=$(man ls 2>/dev/null | head -20); \
    if echo "$test_output" | grep -q "This system has been minimized"; then \
        echo "ERROR: System is still minimized! Man pages not properly restored."; \
        echo "Attempting to run unminimize again..."; \
        yes | unminimize; \
        mandb --create; \
    fi; \
    # Verify critical commands have real man pages
    for cmd in ls grep curl git tar ps cat mkdir cp mv rm find sed awk; do \
        man_path=$(man -w "$cmd" 2>/dev/null || echo ""); \
        if [ -z "$man_path" ] || echo "$man_path" | grep -q "minimized"; then \
            echo "✗ $cmd: MISSING or MINIMIZED - BUILD FAILED"; \
            exit 1; \
        else \
            # Verify the man page has actual content
            content=$(man "$cmd" 2>/dev/null | head -50); \
            if echo "$content" | grep -q "minimized"; then \
                echo "✗ $cmd: Still shows minimized message"; \
                exit 1; \
            fi; \
            echo "✓ $cmd: $man_path ($(echo "$content" | wc -l) lines)"; \
        fi; \
    done; \
    total=$(find /usr/share/man -type f \( -name "*.gz" -o -name "*.xz" -o -name "*.bz2" -o -name "*.[1-8]" \) | wc -l); \
    echo "Total man pages found: $total"; \
    if [ "$total" -lt 1000 ]; then \
        echo "ERROR: Only $total man pages found, expected 1500+"; \
        exit 1; \
    fi; \
    echo "SUCCESS: Found $total man pages with actual content!"

# Ensure man works in non-interactive cron environments
ENV MANPAGER=cat \
    PAGER=cat \
    TERM=xterm \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    MANWIDTH=1000 \
    MAN_DISABLE_SECCOMP=1

# Run the extractor
CMD ["python3", "/app/app/workers/railway_extractor.py"]