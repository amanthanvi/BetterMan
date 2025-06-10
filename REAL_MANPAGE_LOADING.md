# Real Man Page Loading System

This document describes the comprehensive system for loading real man pages from the Linux system into BetterMan.

## Overview

The BetterMan platform now includes a sophisticated system for discovering, parsing, and loading real man pages directly from your Linux system. This system handles:

- Automatic discovery of all man page locations
- Support for all compression formats (.gz, .bz2, .xz, .Z, .lzma, .zst)
- Parsing of both groff/troff source and formatted output
- Multi-threaded processing with progress tracking
- Memory management and error recovery
- Comprehensive categorization and prioritization

## Quick Start

### 1. Quick Load (Recommended for First Use)

Load the most common commands quickly:

```bash
cd backend
./load_real_manpages.sh
# Select option 1 (Quick load)
```

This loads ~500 essential commands categorized by:
- Essential commands (ls, cd, mkdir, etc.)
- Text processing (grep, sed, awk, etc.)
- File operations (find, tar, rsync, etc.)
- System utilities (ps, top, systemctl, etc.)
- Network tools (curl, ssh, ping, etc.)
- Development tools (git, make, docker, etc.)

### 2. Comprehensive Load

Load ALL man pages from your system:

```bash
cd backend
./load_real_manpages.sh
# Select option 2 (Comprehensive load)
```

**Warning**: This can take 30-60 minutes and will load thousands of man pages.

### 3. Load Specific Sections

Load only specific manual sections:

```bash
cd backend
./load_real_manpages.sh
# Select option 3
# Enter sections like: 1 2 3
```

Manual sections:
- 1: User commands
- 2: System calls
- 3: Library functions
- 4: Special files
- 5: File formats
- 6: Games
- 7: Miscellaneous
- 8: System administration

## Architecture

### Components

1. **ManPageLoader** (`src/parser/man_loader.py`)
   - Discovers man page locations
   - Handles file reading and decompression
   - Falls back to `man` command when needed

2. **ComprehensiveManPageDiscovery** (`src/parser/comprehensive_discovery.py`)
   - Scans entire filesystem for man pages
   - Categorizes and prioritizes pages
   - Handles deduplication

3. **ComprehensiveBatchLoader** (`src/parser/comprehensive_loader.py`)
   - Manages batch processing
   - Handles memory limits
   - Provides progress tracking
   - Supports resumable sessions

4. **EnhancedGroffParser** (`src/parser/enhanced_groff_parser.py`)
   - Parses groff/troff source format
   - Handles man and mdoc macros
   - Cleans formatting codes

5. **LinuxManParser** (`src/parser/linux_parser.py`)
   - Parses formatted man page output
   - Converts to structured format
   - Generates HTML/Markdown

### Loading Process

1. **Discovery Phase**
   - Scans standard paths (/usr/share/man, etc.)
   - Checks MANPATH environment variable
   - Discovers package-specific locations
   - Validates and filters paths

2. **Processing Phase**
   - Groups pages by priority (1-8)
   - Processes in batches (default: 100)
   - Parses groff source when available
   - Falls back to formatted output
   - Stores structured data in database

3. **Optimization Phase**
   - Caches parsed content
   - Creates search indexes
   - Updates access statistics

## Database Schema

Man pages are stored in the `documents` table with:

```python
{
    "name": "command_name",
    "title": "Full title from man page",
    "section": 1,  # Manual section number
    "summary": "Brief description",
    "content": {  # JSON structured content
        "sections": {...},
        "description": "...",
        "options": [...],
        "examples": [...]
    },
    "raw_content": "Original groff source",
    "category": "user-commands",
    "tags": "essential,priority-1",
    "is_common": true,
    "cache_priority": 9
}
```

## Advanced Usage

### Custom Categories

Edit `COMMANDS_BY_CATEGORY` in `quick_load_manpages.py` to add custom command groups:

```python
COMMANDS_BY_CATEGORY = {
    "my_tools": ["tool1", "tool2", "tool3"],
    # ... existing categories
}
```

### Priority Levels

Pages are loaded by priority (1=highest, 8=lowest):

1. Core system commands (ls, cd, grep)
2. Essential utilities (≤6 chars in sections 1,8)
3. System calls and library functions
4. Common utilities and file formats
5. Development tools
6. GUI/Desktop environment
7. Optional/local packages
8. Games and miscellaneous

### Resume Failed Loads

If loading is interrupted:

```bash
./load_real_manpages.sh
# Select option 5 (Resume)
# Enter the session ID from logs
```

### Dry Run

Preview what would be loaded without making changes:

```bash
./load_real_manpages.sh
# Select option 4 (Dry run)
```

## Performance Tuning

### Memory Management

Adjust memory limits in `load_comprehensive_manpages.py`:

```python
self.batch_loader = ComprehensiveBatchLoader(
    batch_size=100,        # Pages per batch
    max_workers=8,         # Parallel threads
    memory_limit_mb=2048,  # Memory limit
)
```

### Batch Size

Smaller batches use less memory but take longer:
- Small systems: batch_size=50
- Large systems: batch_size=200

### Parallel Processing

Adjust based on CPU cores:
- 2-4 cores: max_workers=4
- 8+ cores: max_workers=8-16

## Troubleshooting

### Common Issues

1. **"No man pages found"**
   - Check if man pages are installed: `which man`
   - Install man-db: `sudo apt install man-db`

2. **"Permission denied"**
   - Some paths may require read permissions
   - Run with appropriate permissions

3. **"Memory limit exceeded"**
   - Reduce batch_size
   - Increase memory_limit_mb
   - Use quick load instead

4. **"Parsing failed"**
   - Some man pages may have non-standard formatting
   - Check logs for specific errors
   - These are usually skipped automatically

### Logs

Detailed logs are saved to:
- `comprehensive_loading.log` - Full loading process
- `loading_checkpoint.json` - Progress checkpoints

### Database Verification

Check loaded man pages:

```bash
cd backend
python -c "
from src.db.session import SessionLocal
from src.models.document import Document
db = SessionLocal()
print(f'Total man pages: {db.query(Document).count()}')
print(f'Sections: {db.query(Document.section).distinct().count()}')
db.close()
"
```

## Development

### Adding New Parsers

To support additional formats:

1. Create parser in `src/parser/`
2. Implement `parse()` method
3. Register in `ComprehensiveBatchLoader`

### Custom Discovery

Extend `ComprehensiveManPageDiscovery`:

```python
class MyDiscovery(ComprehensiveManPageDiscovery):
    def _find_custom_paths(self):
        # Add custom discovery logic
        return custom_paths
```

### Testing

Run the test suite:

```bash
cd backend
python test_real_loading.py
```

## Security

The system includes security measures:

- Command name validation
- File size limits (10MB default)
- Path traversal prevention
- Content sanitization
- Safe subprocess execution

## Future Enhancements

Planned improvements:

1. Incremental updates (only new/changed pages)
2. Man page versioning
3. Cross-references resolution
4. Multi-language support
5. Export to various formats
6. Man page generation from other sources