#!/bin/bash
# Quick script to load man pages with various options

set -e

# Default values
PRIORITY_MIN=1
PRIORITY_MAX=8
BATCH_SIZE=100
SECTIONS=""
DRY_RUN=""
RESUME=""

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -p, --priority-min NUM    Minimum priority (1-8, default: 1)"
    echo "  -P, --priority-max NUM    Maximum priority (1-8, default: 8)"
    echo "  -s, --sections SECTIONS   Comma-separated sections (e.g., 1,2,3,8)"
    echo "  -b, --batch-size NUM      Batch size (default: 100)"
    echo "  -d, --dry-run            Show what would be loaded"
    echo "  -r, --resume SESSION_ID   Resume from session"
    echo "  -c, --core-only          Load only core commands (priority 1-2)"
    echo "  -h, --help               Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 --core-only           # Load only essential commands"
    echo "  $0 --sections 1,8        # Load only sections 1 and 8"
    echo "  $0 --dry-run             # Show what would be loaded"
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--priority-min)
            PRIORITY_MIN="$2"
            shift 2
            ;;
        -P|--priority-max)
            PRIORITY_MAX="$2"
            shift 2
            ;;
        -s|--sections)
            SECTIONS="--sections $2"
            shift 2
            ;;
        -b|--batch-size)
            BATCH_SIZE="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        -r|--resume)
            RESUME="--resume $2"
            shift 2
            ;;
        -c|--core-only)
            PRIORITY_MIN=1
            PRIORITY_MAX=2
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Build command
CMD="docker-compose run --rm man-loader python -m src.management.comprehensive_cli load"
CMD="$CMD --priority-min=$PRIORITY_MIN --priority-max=$PRIORITY_MAX"
CMD="$CMD --batch-size=$BATCH_SIZE"

if [ -n "$SECTIONS" ]; then
    CMD="$CMD $SECTIONS"
fi

if [ -n "$DRY_RUN" ]; then
    CMD="$CMD $DRY_RUN"
fi

if [ -n "$RESUME" ]; then
    CMD="$CMD $RESUME"
fi

# Show what will be executed
echo "Executing: $CMD"
echo ""

# Execute
exec $CMD