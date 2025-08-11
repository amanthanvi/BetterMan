# Man Page Extraction Pipeline

A robust extraction pipeline for extracting Linux man pages from Ubuntu 24.04 and storing them in PostgreSQL with full-text search support.

## Features

- **Comprehensive Extraction**: Extracts man pages from Ubuntu 24.04 packages
- **Structured Parsing**: Uses groff to parse man pages into structured data
- **Smart Categorization**: Automatically categorizes commands (file ops, network, process, etc.)
- **PostgreSQL FTS**: Generates search vectors for full-text search
- **Incremental Updates**: Only updates changed pages based on content hash
- **Error Handling**: Retry logic with exponential backoff
- **Railway Integration**: Ready for deployment as Railway cron job

## Architecture

```
Ubuntu 24.04 Container
    ↓
Man Page Discovery
    ↓
Groff Parser
    ↓
Content Extraction
    ↓
Categorization
    ↓
PostgreSQL Storage
    ↓
FTS Vector Generation
```

## Categories

Commands are automatically categorized into:

- **file_operations**: File and directory management (ls, cp, mv, etc.)
- **text_processing**: Text manipulation (grep, sed, awk, etc.)
- **network**: Network utilities (ping, curl, ssh, etc.)
- **process_management**: Process control (ps, top, kill, etc.)
- **system_info**: System information (uname, df, free, etc.)
- **development**: Development tools (git, gcc, docker, etc.)
- **archive**: Archive utilities (tar, zip, gzip, etc.)
- **user_management**: User/group management (useradd, passwd, etc.)
- **package_management**: Package managers (apt, dpkg, snap, etc.)
- **shell**: Shell and scripting (bash, sh, echo, etc.)

## Extracted Packages

The pipeline extracts man pages from these Ubuntu packages:

- Core: man-db, manpages, manpages-dev, manpages-posix
- Utilities: coreutils, util-linux, procps
- Network: net-tools, iproute2, curl, wget
- Development: build-essential, git, docker.io, kubectl
- System: systemd, bash, grep, sed, awk

## Usage

### Local Testing

```bash
# Run tests
python backend/tests/test_extractor.py

# Run extraction locally
python backend/src/management/extract_man_pages.py

# Run with Docker Compose
docker-compose -f docker-compose.extractor.yml up
```

### Railway Deployment

1. **As a Cron Job**:
   - Deploy using `railway-cron.json` configuration
   - Runs daily at 3 AM UTC
   - Incremental updates only

2. **Manual Trigger**:
   ```bash
   railway run python app/workers/railway_extractor.py
   ```

3. **Integrated with Scheduler**:
   - Automatically runs if scheduler is enabled
   - See `src/jobs/scheduler.py`

### Environment Variables

Required:
- `DATABASE_URL` or `DATABASE_PUBLIC_URL`: PostgreSQL connection string

Optional:
- `REDIS_URL`: Redis connection for caching
- `EXTRACTION_MODE`: "incremental" (default) or "full"

## Database Schema

The extractor populates the `man_pages` table:

```sql
CREATE TABLE man_pages (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    section VARCHAR(10) NOT NULL,
    title TEXT,
    description TEXT,
    synopsis TEXT,
    content JSONB NOT NULL,  -- Structured content
    search_vector TSVECTOR,  -- FTS vector
    category VARCHAR(100),
    related_commands TEXT[],
    meta_data JSONB,         -- Extraction metadata
    is_common BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    cache_priority INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(name, section)
);
```

### Content Structure

The `content` JSONB field contains:

```json
{
  "sections": [
    {"name": "NAME", "content": "..."},
    {"name": "SYNOPSIS", "content": "..."}
  ],
  "options": [
    {"flag": "-a", "description": "..."}
  ],
  "examples": [
    {"command": "ls -la", "description": "..."}
  ],
  "see_also": ["dir", "vdir"],
  "raw": "Full man page text..."
}
```

## Performance

- Batch processing: 50 pages per batch
- Parallel parsing when possible
- Content hash for change detection
- Incremental updates minimize processing
- FTS indexes for fast searching

## Monitoring

The extractor logs:
- Total pages discovered
- Success/failure/skip counts
- Category distribution
- Processing duration
- Extraction metadata stored in `cache_metadata` table

## Error Handling

- Retry failed extractions up to 3 times
- Exponential backoff between retries
- Graceful handling of missing packages
- Detailed error logging
- Transaction rollback on failures

## Development

### Adding New Categories

Edit `ManPageCategory.CATEGORIES` in `extractor.py`:

```python
'new_category': {
    'keywords': ['cmd1', 'cmd2'],
    'description': 'Category description',
    'icon': '🔧',
    'color': '#123456'
}
```

### Adding New Packages

Update `get_installed_packages()` method:

```python
packages = [
    # ... existing packages
    'new-package-name'
]
```

### Custom Parsing

Override `extract_sections()` for special parsing needs.

## Troubleshooting

### Common Issues

1. **Missing man pages**: Install required packages first
2. **Database connection**: Check DATABASE_URL environment
3. **Permission errors**: Ensure write access to database
4. **Memory issues**: Reduce batch size in extractor

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=DEBUG
python app/workers/railway_extractor.py
```

## Future Enhancements

- [ ] Support for other Linux distributions
- [ ] Multi-language man pages
- [ ] Real-time extraction on demand
- [ ] Machine learning for better categorization
- [ ] Cross-reference analysis
- [ ] Command usage examples from GitHub