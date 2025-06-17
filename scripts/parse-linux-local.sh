#!/bin/bash

# Parse man pages using Ubuntu Linux locally via Docker
# This simulates the CI/CD environment for testing

set -e

echo "🐧 Starting Linux man page parser in Docker..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Build a custom Docker image with all necessary tools
echo "📦 Building Docker image with Linux man pages..."

cat > /tmp/Dockerfile.manparser << 'EOF'
FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 20.x
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Install man pages and documentation
RUN apt-get update && apt-get install -y \
    man-db \
    manpages \
    manpages-dev \
    manpages-posix \
    manpages-posix-dev \
    info \
    texinfo \
    bash-doc \
    coreutils \
    util-linux \
    procps \
    iproute2 \
    net-tools \
    iputils-ping \
    dnsutils \
    curl \
    wget \
    git \
    vim \
    nano \
    tmux \
    screen \
    openssh-client \
    rsync \
    gzip \
    bzip2 \
    xz-utils \
    tar \
    zip \
    unzip \
    findutils \
    grep \
    sed \
    gawk \
    diffutils \
    patch \
    less \
    make \
    gcc \
    python3 \
    docker.io \
    jq \
    htop \
    tree \
    lsof \
    strace \
    tcpdump \
    nmap \
    postgresql-client \
    mysql-client \
    redis-tools \
    nginx \
    apache2-utils && \
    mandb

# Install tsx globally
RUN npm install -g tsx

WORKDIR /app
EOF

docker build -t betterman-parser -f /tmp/Dockerfile.manparser .

echo ""
echo "🚀 Running parser in Docker container..."
echo ""

# Run the parser in Docker
docker run --rm \
    -v "$(pwd)":/app \
    -e CI=true \
    betterman-parser \
    bash -c "npm ci && tsx scripts/parse-man-pages-ci.ts"

echo ""
echo "✅ Linux man pages parsed successfully!"
echo ""
echo "📁 Output location: data/parsed-man-pages-linux/"
echo ""
echo "To migrate these to the application format, run:"
echo "   tsx scripts/migrate-linux-man-pages.ts"
echo ""

# Cleanup
rm -f /tmp/Dockerfile.manparser