"""Man page fetcher for retrieving man pages from the system."""

import subprocess
import os
from typing import Optional, List, Dict, Tuple
import re


def get_available_man_pages() -> List[Dict[str, str]]:
    """
    Get a list of available man pages on the system.

    Returns:
        List of dictionaries containing man page information.
    """
    # This implementation is Linux/Unix specific
    try:
        # Get the man paths
        man_paths = []
        man_path_output = subprocess.run(
            ["manpath"], capture_output=True, text=True, check=True
        ).stdout.strip()
        man_paths = man_path_output.split(":")

        # Find all man pages
        man_pages = []
        for path in man_paths:
            if not os.path.exists(path):
                continue

            for section_dir in os.listdir(path):
                section_match = re.match(r"man(\d+)", section_dir)
                if not section_match:
                    continue

                section = section_match.group(1)
                section_path = os.path.join(path, section_dir)

                if not os.path.isdir(section_path):
                    continue

                for filename in os.listdir(section_path):
                    # Handle compressed files (.gz, .bz2, etc.)
                    man_name = filename
                    for ext in [".gz", ".bz2", ".xz", ".lzma", ".Z"]:
                        if man_name.endswith(ext):
                            man_name = man_name[: -len(ext)]
                            break

                    # Handle section suffix (.1, .2, etc.)
                    man_name = re.sub(r"\.\d+$", "", man_name)

                    man_pages.append(
                        {
                            "name": man_name,
                            "section": section,
                            "path": os.path.join(section_path, filename),
                        }
                    )

        return man_pages
    except Exception as e:
        print(f"Error getting available man pages: {e}")
        return []


def fetch_man_page_content(
    name: str, section: Optional[str] = None
) -> Tuple[str, Dict]:
    """
    Fetch a man page's raw content.

    Args:
        name: The name of the man page to fetch.
        section: Optional section number.

    Returns:
        Tuple containing the raw content and metadata.
    """
    try:
        cmd = ["man"]
        if section:
            cmd.extend([section, name])
        else:
            cmd.append(name)

        # Add flags to get raw output without formatting
        cmd.extend(["-R", "-P", "cat"])

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            return "", {"error": result.stderr}

        return result.stdout, {"name": name, "section": section}
    except Exception as e:
        return "", {"error": str(e)}
