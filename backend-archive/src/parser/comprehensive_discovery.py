"""
Comprehensive man page discovery system.
Discovers ALL available man pages across the entire Linux system.
"""

import os
import re
import subprocess
import glob
from typing import Dict, List, Set, Optional, Tuple
from pathlib import Path
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import hashlib
from datetime import datetime

from .security_validator import ManPageSecurityValidator

logger = logging.getLogger(__name__)


class ComprehensiveManPageDiscovery:
    """Discover ALL available man pages across the entire system."""

    def __init__(self, max_workers: int = 8):
        self.max_workers = max_workers
        self.validator = ManPageSecurityValidator()
        self.all_man_paths = []
        self.discovered_pages = {}
        self.discovery_stats = {
            "start_time": None,
            "end_time": None,
            "paths_scanned": 0,
            "sections_found": set(),
            "total_files": 0,
            "valid_pages": 0,
            "skipped_files": 0,
            "errors": 0,
        }

    def discover_all_man_paths(self) -> List[str]:
        """Discover all possible man page locations comprehensively."""
        logger.info("Starting comprehensive man path discovery...")

        standard_paths = [
            "/usr/share/man",
            "/usr/local/share/man",
            "/usr/local/man",
            "/opt/local/share/man",
            "/usr/X11R6/man",
            "/usr/pkg/man",
            "/usr/contrib/man",
            "/usr/share/gcc-data/*/man",
            "/usr/lib/perl5/man",
            "/usr/share/postgresql/*/man",
            "/usr/share/vim/*/doc",
        ]

        # Get paths from manpath command
        manpath_paths = self._get_manpath_directories()

        # Find additional man directories dynamically
        dynamic_paths = self._find_man_directories_comprehensive()

        # Get package-specific paths
        package_paths = self._get_package_man_paths()

        # Combine all paths
        all_potential_paths = set(
            standard_paths + manpath_paths + dynamic_paths + package_paths
        )

        # Validate and filter paths
        validated_paths = []
        for path in all_potential_paths:
            if self._validate_man_directory(path):
                validated_paths.append(path)
                logger.debug(f"Valid man directory: {path}")

        self.all_man_paths = sorted(validated_paths)
        logger.info(f"Discovered {len(self.all_man_paths)} valid man directories")

        return self.all_man_paths

    def _get_manpath_directories(self) -> List[str]:
        """Get directories from manpath command."""
        paths = []
        try:
            # Try different manpath commands
            for cmd in ["manpath", "man --path", "manpath -g"]:
                try:
                    result = subprocess.run(
                        cmd.split(), capture_output=True, text=True, timeout=10
                    )
                    if result.returncode == 0 and result.stdout.strip():
                        paths.extend(result.stdout.strip().split(":"))
                        break
                except Exception:
                    continue
        except Exception as e:
            logger.warning(f"Could not get manpath: {e}")

        return [p for p in paths if p and os.path.exists(p)]

    def _find_man_directories_comprehensive(self) -> List[str]:
        """Comprehensively find man directories across the system."""
        man_dirs = []

        # Search patterns for finding man directories
        search_patterns = [
            "/usr/*/man",
            "/usr/share/*/man",
            "/usr/local/*/man",
            "/opt/*/man",
            "/opt/*/share/man",
            "/var/*/man",
            "/usr/lib/*/man",
            "/usr/lib64/*/man",
            "/usr/lib/*/share/man",
            "/snap/*/current/usr/share/man",
            "/flatpak/*/files/share/man",
        ]

        for pattern in search_patterns:
            try:
                matches = glob.glob(pattern, recursive=False)
                man_dirs.extend(matches)
            except Exception as e:
                logger.debug(f"Error with pattern {pattern}: {e}")

        # Also do a targeted search in key directories
        targeted_roots = ["/usr", "/opt", "/usr/local"]
        for root in targeted_roots:
            if os.path.exists(root):
                man_dirs.extend(self._find_man_dirs_in_path(root, max_depth=4))

        return list(set(man_dirs))

    def _find_man_dirs_in_path(self, root_path: str, max_depth: int = 4) -> List[str]:
        """Find man directories within a path up to max_depth."""
        man_dirs = []

        try:
            for dirpath, dirnames, filenames in os.walk(root_path):
                # Calculate current depth
                depth = dirpath[len(root_path) :].count(os.sep)

                if depth >= max_depth:
                    dirnames[:] = []  # Don't go deeper
                    continue

                # Look for 'man' directories
                if "man" in dirnames:
                    man_path = os.path.join(dirpath, "man")
                    if self._looks_like_man_directory(man_path):
                        man_dirs.append(man_path)

                # Optimize: skip certain directories
                dirnames[:] = [
                    d
                    for d in dirnames
                    if d
                    not in {
                        ".git",
                        "__pycache__",
                        "node_modules",
                        ".cache",
                        "proc",
                        "sys",
                        "dev",
                        "tmp",
                        "var/tmp",
                    }
                ]

        except Exception as e:
            logger.debug(f"Error scanning {root_path}: {e}")

        return man_dirs

    def _get_package_man_paths(self) -> List[str]:
        """Get man paths from installed packages."""
        package_paths = []

        # Try to get from package managers
        if os.path.exists("/usr/bin/dpkg"):
            package_paths.extend(self._get_dpkg_man_paths())
        elif os.path.exists("/usr/bin/rpm"):
            package_paths.extend(self._get_rpm_man_paths())

        # Common package-specific locations
        package_specific = [
            "/usr/share/texmf/doc/man",
            "/usr/share/sgml/docbook/*/doc/man",
            "/usr/share/doc/*/man",
            "/usr/local/texlive/*/texmf-dist/doc/man",
        ]

        for pattern in package_specific:
            try:
                package_paths.extend(glob.glob(pattern))
            except Exception:
                pass

        return package_paths

    def _get_dpkg_man_paths(self) -> List[str]:
        """Get man paths from dpkg database."""
        paths = set()
        try:
            # List files from all packages and filter man directories
            result = subprocess.run(
                ["dpkg", "-L"], capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    if "/man/" in line and os.path.isdir(line):
                        # Extract the man directory
                        parts = line.split("/man/")
                        if len(parts) >= 2:
                            man_dir = parts[0] + "/man"
                            if os.path.exists(man_dir):
                                paths.add(man_dir)
        except Exception as e:
            logger.debug(f"Could not query dpkg: {e}")

        return list(paths)

    def _get_rpm_man_paths(self) -> List[str]:
        """Get man paths from rpm database."""
        paths = set()
        try:
            result = subprocess.run(
                ["rpm", "-qal"], capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    if "/man/" in line and "/man" in line:
                        parts = line.split("/man/")
                        if len(parts) >= 2:
                            man_dir = parts[0] + "/man"
                            if os.path.exists(man_dir) and os.path.isdir(man_dir):
                                paths.add(man_dir)
        except Exception as e:
            logger.debug(f"Could not query rpm: {e}")

        return list(paths)

    def _looks_like_man_directory(self, path: str) -> bool:
        """Quick check if a directory looks like a man directory."""
        try:
            if not os.path.isdir(path):
                return False

            entries = os.listdir(path)
            # Look for man section directories
            for entry in entries:
                if re.match(r"^man[0-9nl]", entry):
                    return True

            return False
        except Exception:
            return False

    def _validate_man_directory(self, path: str) -> bool:
        """Thoroughly validate a man directory."""
        try:
            if not os.path.exists(path) or not os.path.isdir(path):
                return False

            if not os.access(path, os.R_OK | os.X_OK):
                return False

            # Must contain at least one man section
            has_sections = False
            for entry in os.listdir(path):
                if re.match(r"^man[0-9nl]", entry):
                    subdir = os.path.join(path, entry)
                    if os.path.isdir(subdir) and os.access(subdir, os.R_OK):
                        has_sections = True
                        break

            return has_sections

        except Exception:
            return False

    def discover_all_sections(self) -> Dict[str, Set[str]]:
        """Discover all available man page sections."""
        if not self.all_man_paths:
            self.discover_all_man_paths()

        all_sections = {}

        for man_path in self.all_man_paths:
            try:
                sections = self._get_sections_from_path(man_path)
                for section in sections:
                    if section not in all_sections:
                        all_sections[section] = set()
                    all_sections[section].add(man_path)
                    self.discovery_stats["sections_found"].add(section)
            except Exception as e:
                logger.error(f"Error processing {man_path}: {e}")
                self.discovery_stats["errors"] += 1

        logger.info(f"Found sections: {sorted(all_sections.keys())}")
        return all_sections

    def _get_sections_from_path(self, man_path: str) -> List[str]:
        """Get all sections available in a man path."""
        sections = []

        try:
            for item in os.listdir(man_path):
                # Match various section patterns
                match = re.match(r"^man([0-9nlp]+[a-z]*)$", item)
                if match:
                    section = match.group(1)
                    section_path = os.path.join(man_path, item)
                    if os.path.isdir(section_path):
                        sections.append(section)

        except Exception as e:
            logger.error(f"Error reading {man_path}: {e}")

        return sections

    def discover_all_pages(self, progress_callback=None) -> Dict[str, List[Dict]]:
        """
        Discover ALL man pages across all sections and paths.

        Args:
            progress_callback: Optional callback for progress updates

        Returns:
            Dictionary mapping sections to lists of page info
        """
        self.discovery_stats["start_time"] = datetime.now()

        if not self.all_man_paths:
            self.discover_all_man_paths()

        all_sections = self.discover_all_sections()
        all_pages = {}

        total_paths = sum(len(paths) for paths in all_sections.values())
        processed_paths = 0

        # Process each section
        for section, paths in all_sections.items():
            logger.info(f"Processing section {section} across {len(paths)} paths")
            section_pages = []

            # Use thread pool for parallel processing
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                future_to_path = {}

                for path in paths:
                    section_path = os.path.join(path, f"man{section}")
                    if os.path.exists(section_path):
                        future = executor.submit(
                            self._scan_section_directory, section_path, section, path
                        )
                        future_to_path[future] = (section_path, path)

                # Process results as they complete
                for future in as_completed(future_to_path):
                    section_path, base_path = future_to_path[future]
                    try:
                        pages = future.result()
                        section_pages.extend(pages)
                        self.discovery_stats["paths_scanned"] += 1
                    except Exception as e:
                        logger.error(f"Error scanning {section_path}: {e}")
                        self.discovery_stats["errors"] += 1

                    processed_paths += 1
                    if progress_callback:
                        progress_callback(processed_paths, total_paths)

            # Deduplicate pages in this section
            if section_pages:
                deduplicated = self._deduplicate_section_pages(section_pages)
                all_pages[section] = deduplicated
                logger.info(f"Section {section}: {len(deduplicated)} unique pages")

        # Final statistics
        self.discovery_stats["end_time"] = datetime.now()
        self.discovery_stats["valid_pages"] = sum(
            len(pages) for pages in all_pages.values()
        )

        total_pages = self.discovery_stats["valid_pages"]
        duration = (
            self.discovery_stats["end_time"] - self.discovery_stats["start_time"]
        ).total_seconds()

        logger.info(f"Discovery complete: {total_pages:,} pages in {duration:.1f}s")
        logger.info(
            f"Statistics: {json.dumps(self.discovery_stats, default=str, indent=2)}"
        )

        return all_pages

    def _scan_section_directory(
        self, section_path: str, section: str, base_path: str
    ) -> List[Dict]:
        """Scan a section directory for man pages."""
        pages = []

        try:
            for filename in sorted(os.listdir(section_path)):
                self.discovery_stats["total_files"] += 1

                page_info = self._extract_comprehensive_page_info(
                    filename, section_path, section, base_path
                )

                if page_info:
                    # Additional validation
                    is_safe, reason = self.validator.is_safe_to_process(page_info)
                    if is_safe:
                        pages.append(page_info)
                    else:
                        logger.debug(f"Skipping {filename}: {reason}")
                        self.discovery_stats["skipped_files"] += 1
                else:
                    self.discovery_stats["skipped_files"] += 1

        except Exception as e:
            logger.error(f"Error scanning {section_path}: {e}")
            self.discovery_stats["errors"] += 1

        return pages

    def _extract_comprehensive_page_info(
        self, filename: str, section_path: str, section: str, base_path: str
    ) -> Optional[Dict]:
        """Extract comprehensive information about a man page file."""
        # Handle various compression formats
        base_name = filename
        compression = None

        compression_exts = [".gz", ".bz2", ".xz", ".Z", ".lzma", ".zst"]
        for ext in compression_exts:
            if filename.endswith(ext):
                base_name = filename[: -len(ext)]
                compression = ext[1:]
                break

        # Extract command name and subsection
        # Handle formats like: command.1, command.3pm, command.1.gz
        parts = base_name.split(".")

        if len(parts) >= 2:
            # Remove the section suffix if it matches
            if parts[-1] == section or parts[-1].startswith(section):
                command_name = ".".join(parts[:-1])
            else:
                command_name = base_name
        else:
            command_name = base_name

        # Validate command name
        is_valid, error = self.validator.validate_command_name(
            command_name, strict=False
        )
        if not is_valid:
            return None

        file_path = os.path.join(section_path, filename)

        try:
            stat = os.stat(file_path)
            file_size = stat.st_size

            # Skip extremely large files
            if file_size > 10 * 1024 * 1024:
                logger.warning(f"Skipping large file: {file_path} ({file_size} bytes)")
                return None

            # Skip empty files
            if file_size == 0:
                return None

            # Determine category and priority
            category = self._determine_category(command_name, section, base_path)
            priority = self._calculate_priority(
                command_name, section, category, base_path
            )

            # Generate a unique identifier
            page_id = hashlib.sha256(
                f"{command_name}:{section}:{base_path}".encode()
            ).hexdigest()[:12]

            return {
                "id": page_id,
                "command": command_name,
                "section": section,
                "filename": filename,
                "path": file_path,
                "base_path": base_path,
                "compression": compression,
                "size": file_size,
                "category": category,
                "priority": priority,
                "modified_time": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "package_hint": self._guess_package(command_name, base_path),
            }

        except Exception as e:
            logger.debug(f"Error processing {file_path}: {e}")
            return None

    def _determine_category(self, command: str, section: str, base_path: str) -> str:
        """Determine the category of a man page."""
        # Base categories by section
        section_categories = {
            "1": "user-commands",
            "2": "system-calls",
            "3": "library-functions",
            "4": "special-files",
            "5": "file-formats",
            "6": "games",
            "7": "miscellaneous",
            "8": "system-admin",
            "n": "tcl-commands",
            "l": "local-docs",
        }

        # Get base category
        base_section = section[0] if section else "1"
        base_category = section_categories.get(base_section, "other")

        # Refine based on path
        path_lower = base_path.lower()

        if "x11" in path_lower or "x11r6" in path_lower:
            return f"{base_category}-x11"
        elif "perl" in path_lower:
            return f"{base_category}-perl"
        elif "python" in path_lower:
            return f"{base_category}-python"
        elif "postgresql" in path_lower or "pgsql" in path_lower:
            return f"{base_category}-postgresql"
        elif "mysql" in path_lower or "mariadb" in path_lower:
            return f"{base_category}-mysql"
        elif "apache" in path_lower or "httpd" in path_lower:
            return f"{base_category}-apache"
        elif "nginx" in path_lower:
            return f"{base_category}-nginx"
        elif "kde" in path_lower:
            return f"{base_category}-kde"
        elif "gnome" in path_lower:
            return f"{base_category}-gnome"
        elif "texlive" in path_lower or "texmf" in path_lower:
            return f"{base_category}-tex"
        elif "/opt/" in base_path:
            return f"{base_category}-opt"
        elif "/usr/local/" in base_path:
            return f"{base_category}-local"
        elif "games" in path_lower:
            return "games"

        return base_category

    def _calculate_priority(
        self, command: str, section: str, category: str, base_path: str
    ) -> int:
        """Calculate loading priority (1=highest, 8=lowest)."""
        # Priority 1: Core system commands
        if command in self.validator.CORE_COMMANDS:
            return 1

        # Priority 2: Essential utilities and short commands
        if section in ["1", "8"] and len(command) <= 6:
            return 2

        # Priority 3: Standard library functions and system calls
        if section in ["2", "3"] and "/usr/share/man" in base_path:
            return 3

        # Priority 4: Common utilities and file formats
        if section in ["1", "5"] and category.startswith(
            ("user-commands", "file-formats")
        ):
            return 4

        # Priority 5: Development tools
        if category in [
            "library-functions",
            "library-functions-perl",
            "library-functions-python",
        ]:
            return 5

        # Priority 6: GUI and desktop environment
        if any(cat in category for cat in ["-kde", "-gnome", "-x11"]):
            return 6

        # Priority 7: Optional and local packages
        if any(cat in category for cat in ["-opt", "-local"]):
            return 7

        # Priority 8: Everything else (games, misc, etc.)
        return 8

    def _guess_package(self, command: str, base_path: str) -> Optional[str]:
        """Guess which package a command might belong to."""
        path_lower = base_path.lower()

        if "/usr/local/" in base_path:
            return "local-install"
        elif "/opt/" in base_path:
            # Try to extract package name from path
            parts = base_path.split("/")
            if len(parts) > 2 and parts[1] == "opt":
                return f"opt-{parts[2]}"
        elif "perl" in path_lower:
            return "perl-modules"
        elif "python" in path_lower:
            return "python-modules"
        elif "postgresql" in path_lower:
            return "postgresql"
        elif "mysql" in path_lower:
            return "mysql"
        elif "x11" in path_lower:
            return "x11-utils"
        elif "texlive" in path_lower:
            return "texlive"

        return None

    def _deduplicate_section_pages(self, pages: List[Dict]) -> List[Dict]:
        """Deduplicate pages within a section, keeping the best version."""
        seen = {}

        for page in pages:
            key = page["command"]

            if key not in seen:
                seen[key] = page
            else:
                # Keep the one with higher priority (lower number)
                if page["priority"] < seen[key]["priority"]:
                    seen[key] = page
                # If same priority, use a scoring system to pick the best version
                elif page["priority"] == seen[key]["priority"]:
                    # Calculate scores for both pages
                    current_score = self._calculate_page_score(page)
                    existing_score = self._calculate_page_score(seen[key])

                    # Keep the page with the higher score
                    if current_score > existing_score:
                        seen[key] = page

        return sorted(seen.values(), key=lambda x: (x["priority"], x["command"]))

    def _calculate_page_score(self, page: Dict) -> int:
        """Calculate a score for a page to determine preference when priorities are equal."""
        score = 0

        # Prefer /usr/share/man location (+10 points)
        if "/usr/share/man" in page["base_path"]:
            score += 10

        # Prefer uncompressed or gz compression (+5 points)
        if page.get("compression") in [None, "gz"]:
            score += 5

        # Additional preferences can be added here
        # For example, prefer newer files
        # if "modified_time" in page:
        #     # More recent files get higher scores
        #     score += 1  # Simplified, could use actual time comparison

        return score
