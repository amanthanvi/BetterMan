#!/usr/bin/env python3
"""
Simple script to load man pages into BetterMan database.
"""

import os
import sys
import argparse
import logging
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

# Set the database URL to the correct path
os.environ["DATABASE_URL"] = (
    f"sqlite:///{Path(__file__).parent.parent}/data/betterman.db"
)

from src.parser.improved_loader import ImprovedManPageLoader
from src.db.session import init_db

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)


def validate_directories(directories):
    """
    Validate and sanitize directory paths to prevent path traversal attacks.

    Args:
        directories: List of directory paths to validate

    Returns:
        List of validated absolute paths

    Raises:
        ValueError: If any directory is invalid or potentially malicious
    """
    if not directories:
        return None

    validated_dirs = []

    # Common man page directories (can be extended based on system requirements)
    allowed_base_dirs = [
        "/usr/share/man",
        "/usr/local/share/man",
        "/usr/man",
        "/usr/local/man",
        "/opt",
        str(Path.home() / ".local" / "share" / "man"),
    ]

    for directory in directories:
        try:
            # Detect potential path traversal attempts
            if ".." in directory or "~" in directory:
                raise ValueError(f"Path traversal attempt detected: {directory}")

            # Convert to Path object and resolve to absolute path
            dir_path = Path(directory).resolve(strict=True)

            # Ensure the resolved path doesn't contain traversal after resolution
            if ".." in str(dir_path):
                raise ValueError(
                    f"Path contains traversal after resolution: {directory}"
                )

            # Check if the path exists and is a directory
            if not dir_path.exists():
                raise ValueError(f"Directory does not exist: {directory}")

            if not dir_path.is_dir():
                raise ValueError(f"Path is not a directory: {directory}")

            # Check if the resolved path is under one of the allowed base directories
            is_allowed = False

            # Check if it's under an allowed base directory
            for base_dir in allowed_base_dirs:
                try:
                    base_path = Path(base_dir).resolve()
                    # Ensure base_path exists before checking relative path
                    if base_path.exists():
                        dir_path.relative_to(base_path)
                        is_allowed = True
                        break
                except ValueError:
                    continue

            # Also check if it's a direct man directory (exact match)
            if not is_allowed:
                # Check for exact matches to common man directories
                man_dir_patterns = [
                    "/usr/share/man",
                    "/usr/local/share/man",
                    "/usr/man",
                    "/usr/local/man",
                ]
                if str(dir_path) in man_dir_patterns:
                    is_allowed = True

            if not is_allowed:
                # Strict validation - reject directories outside allowed locations
                raise ValueError(
                    f"Directory '{dir_path}' is not in allowed man page locations. "
                    f"Allowed base directories are: {', '.join(allowed_base_dirs)}"
                )

            validated_dirs.append(str(dir_path))

        except Exception as e:
            raise ValueError(f"Invalid directory path '{directory}': {str(e)}")

    return validated_dirs


def main():
    parser = argparse.ArgumentParser(
        description="Load man pages into BetterMan database"
    )
    parser.add_argument(
        "--directories", nargs="+", help="Directories to search for man pages"
    )
    parser.add_argument("--sections", nargs="+", help="Sections to load (e.g., 1 2 3)")
    parser.add_argument(
        "--batch-size", type=int, default=50, help="Batch size for processing"
    )
    parser.add_argument(
        "--init-db", action="store_true", help="Initialize database before loading"
    )

    args = parser.parse_args()

    # Validate and sanitize directory paths
    try:
        validated_directories = validate_directories(args.directories)
    except ValueError as e:
        logging.error(f"Directory validation failed: {e}")
        sys.exit(1)

    # Initialize database if requested
    if args.init_db:
        print("Initializing database...")
        init_db()

    # Load man pages
    loader = ImprovedManPageLoader()
    stats = loader.load_man_pages(
        directories=validated_directories,
        sections=args.sections,
        batch_size=args.batch_size,
    )

    print("\nLoading Statistics:")
    print(f"  Total found: {stats['total_found']}")
    print(f"  Processed: {stats['processed']}")
    print(f"  Errors: {stats['errors']}")
    print(f"  Skipped: {stats['skipped']}")


if __name__ == "__main__":
    main()
