#!/usr/bin/env python3
"""
Load common commands using the improved loader.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.parser.improved_loader import ImprovedManPageLoader
from pathlib import Path
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Common commands to load
COMMON_COMMANDS = [
    'ls', 'cd', 'pwd', 'grep', 'find', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv',
    'touch', 'chmod', 'chown', 'ps', 'top', 'kill', 'vim', 'nano', 'less', 'more',
    'head', 'tail', 'sed', 'awk', 'cut', 'sort', 'uniq', 'wc', 'diff', 'tar',
    'gzip', 'gunzip', 'zip', 'unzip', 'ssh', 'scp', 'wget', 'curl', 'git',
    'docker', 'python', 'pip', 'npm', 'node', 'make', 'gcc', 'apt', 'yum',
    'systemctl', 'journalctl', 'df', 'du', 'free', 'htop', 'netstat', 'ping',
    'traceroute', 'ifconfig', 'ip', 'route', 'iptables', 'man', 'which', 'whereis',
    'whoami', 'id', 'su', 'sudo', 'passwd', 'useradd', 'usermod', 'groupadd',
    'cron', 'crontab', 'at', 'jobs', 'bg', 'fg', 'screen', 'tmux', 'history',
    'alias', 'export', 'source', 'bash', 'sh', 'zsh', 'fish', 'date', 'cal',
    'bc', 'expr', 'test', 'true', 'false', 'sleep', 'wait', 'exit', 'logout'
]

if __name__ == "__main__":
    loader = ImprovedManPageLoader()
    
    print(f"Loading {len(COMMON_COMMANDS)} common commands...")
    
    processed = 0
    errors = 0
    
    for cmd in COMMON_COMMANDS:
        # Try to find the man page
        found = False
        for section in ['1', '8', '2', '5']:  # Common sections
            man_paths = [
                f"/usr/share/man/man{section}/{cmd}.{section}",
                f"/usr/share/man/man{section}/{cmd}.{section}.gz",
                f"/usr/local/share/man/man{section}/{cmd}.{section}",
                f"/usr/local/share/man/man{section}/{cmd}.{section}.gz",
            ]
            
            for path in man_paths:
                if os.path.exists(path):
                    result = loader.process_man_page(Path(path), section)
                    if result:
                        print(f"✓ Loaded {cmd} from section {section}")
                        processed += 1
                        found = True
                        break
                    else:
                        errors += 1
                        
            if found:
                break
        
        if not found:
            print(f"✗ Could not find man page for {cmd}")
    
    print(f"\nComplete! Processed: {processed}, Errors: {errors}, Not found: {len(COMMON_COMMANDS) - processed - errors}")