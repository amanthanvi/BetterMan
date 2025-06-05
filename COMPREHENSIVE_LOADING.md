# Comprehensive Man Page Loading System

This document describes the production-ready system for loading ALL Linux man pages into BetterMan.

## Overview

The comprehensive loading system is designed to:
- **Discover** all available man pages across the entire Linux system
- **Validate** each page for security and integrity
- **Process** pages in parallel with memory management
- **Load** pages by priority (core commands first)
- **Track** progress with resumable sessions
- **Monitor** system health and performance

## Architecture

### Components

1. **Security Validator** (`security_validator.py`)
   - Validates command names and file paths
   - Prevents path traversal attacks
   - Maintains whitelist/blacklist of commands
   - Sanitizes content before processing

2. **Discovery Engine** (`comprehensive_discovery.py`)
   - Scans all man page directories
   - Supports multiple compression formats (gz, bz2, xz, zst)
   - Categorizes pages by type and priority
   - Handles non-standard locations (/opt, /usr/local, etc.)

3. **Batch Loader** (`comprehensive_loader.py`)
   - Processes pages in configurable batches
   - Manages memory usage with limits
   - Supports parallel processing
   - Provides progress tracking
   - Handles session resumption

4. **Management CLI** (`comprehensive_cli.py`)
   - User-friendly command interface
   - Real-time progress visualization
   - Statistics and reporting
   - Dry-run capability

## Quick Start

### 1. Basic Loading (Core Commands Only)

```bash
# Load only essential system commands (priority 1-2)
./scripts/load_manpages.sh --core-only
```

### 2. Full Loading (All Pages)

```bash
# Run the comprehensive deployment
./scripts/deploy_comprehensive.sh
```

### 3. Custom Loading

```bash
# Load specific sections
docker-compose run --rm man-loader python -m src.management.comprehensive_cli load \
  --sections 1,8 \
  --batch-size 100

# Load by priority range
docker-compose run --rm man-loader python -m src.management.comprehensive_cli load \
  --priority-min 1 \
  --priority-max 4
```

## Priority System

Pages are categorized into 8 priority levels:

1. **Priority 1**: Core system commands (ls, cd, cp, etc.)
2. **Priority 2**: Essential utilities (ps, grep, find, etc.)
3. **Priority 3**: Standard library functions and system calls
4. **Priority 4**: Common utilities and file formats
5. **Priority 5**: Development tools and libraries
6. **Priority 6**: GUI applications and desktop environments
7. **Priority 7**: Optional and local packages
8. **Priority 8**: Miscellaneous and rarely used

## Categories

Man pages are organized into categories:

- `user-commands`: Section 1 - User commands
- `system-calls`: Section 2 - System calls
- `library-functions`: Section 3 - C library functions
- `special-files`: Section 4 - Device files
- `file-formats`: Section 5 - File formats
- `games`: Section 6 - Games
- `miscellaneous`: Section 7 - Misc
- `system-admin`: Section 8 - System administration

Sub-categories include:
- `-x11`: X Window System
- `-perl`, `-python`: Language-specific
- `-postgresql`, `-mysql`: Database-specific
- `-local`: Locally installed
- `-opt`: Optional packages

## Loading Process

### Phase 1: Discovery
```bash
# See what's available without loading
docker-compose run --rm man-loader python -m src.management.comprehensive_cli discover
```

### Phase 2: Dry Run
```bash
# Preview what will be loaded
docker-compose run --rm man-loader python -m src.management.comprehensive_cli load --dry-run
```

### Phase 3: Actual Loading
```bash
# Load with progress tracking
docker-compose run --rm man-loader python -m src.management.comprehensive_cli load --progress
```

## Session Management

### Resume Failed Session
```bash
# List recent sessions
docker-compose run --rm man-loader python -m src.management.comprehensive_cli sessions

# Resume specific session
docker-compose run --rm man-loader python -m src.management.comprehensive_cli load \
  --resume comprehensive_20240115_143022
```

## Monitoring

### Health Check
```bash
curl http://localhost:8000/health
```

### Loading Status
```bash
curl http://localhost:8000/loading-status
```

### Statistics
```bash
# View current statistics
docker-compose run --rm man-loader python -m src.management.comprehensive_cli stats --detailed

# Export statistics
docker-compose run --rm man-loader python -m src.management.comprehensive_cli stats \
  --export /app/data/stats.json
```

## Performance Tuning

### Memory Management
```bash
# Adjust memory limit (MB)
--memory-limit 4096

# Reduce batch size for low memory
--batch-size 50
```

### Parallel Processing
```bash
# Set worker count
--max-workers 16

# Disable parallel processing
--max-workers 1
```

## Troubleshooting

### Common Issues

1. **Out of Memory**
   - Reduce batch size
   - Lower memory limit
   - Disable parallel processing

2. **Slow Loading**
   - Increase batch size
   - Add more workers
   - Load by priority (core first)

3. **Failed Pages**
   - Check error logs in session
   - Reload specific commands
   - Review security validator logs

### Logs

```bash
# View loader logs
docker-compose logs man-loader

# Session logs location
/app/logs/deploy_YYYYMMDD_HHMMSS.log
```

## Production Deployment

### Prerequisites

- Docker and Docker Compose
- At least 4GB RAM
- 10GB+ disk space
- PostgreSQL (for production)

### Deployment Steps

1. **Build Production Images**
   ```bash
   docker-compose -f docker-compose.production.yml build
   ```

2. **Run Migrations**
   ```bash
   docker-compose -f docker-compose.production.yml run --rm backend \
     python -m alembic upgrade head
   ```

3. **Load Man Pages**
   ```bash
   ./scripts/deploy_comprehensive.sh --production
   ```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@db:5432/betterman

# Redis
REDIS_URL=redis://redis:6379/0

# Loading Configuration
MAN_LOADER_BATCH_SIZE=200
MAN_LOADER_MAX_WORKERS=8
MAN_LOADER_MEMORY_LIMIT=4096
```

## Security Considerations

1. **Input Validation**: All file paths and command names are validated
2. **Resource Limits**: Memory and CPU usage are monitored
3. **Sandboxing**: Processing runs in isolated containers
4. **Access Control**: Non-root user for all operations
5. **Content Sanitization**: Raw content is sanitized before storage

## Expected Results

After full loading:
- **15,000-25,000+ man pages** loaded
- **All 8 standard sections** covered
- **Multiple categories** organized
- **Sub-second search** response
- **Comprehensive coverage** of system documentation

## Maintenance

### Update Man Pages
```bash
# Reload specific command
docker-compose run --rm man-loader python -m src.management.comprehensive_cli reload <command>

# Clean duplicates
docker-compose run --rm man-loader python -m src.management.comprehensive_cli cleanup
```

### Export Data
```bash
# Export metadata
docker-compose run --rm man-loader python -m src.management.comprehensive_cli export \
  --format json \
  --output /app/data/manpages.json
```

## Support

For issues or questions:
1. Check logs in `/app/logs/`
2. Review loading session status
3. Consult error messages in the CLI
4. File issues on GitHub