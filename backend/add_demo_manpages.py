#!/usr/bin/env python3
"""
Add demo man pages to showcase enhanced parsing features.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.db.session import get_db_context
from src.models.document import Document, Section, Subsection
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Demo man pages with proper sections
DEMO_PAGES = [
    {
        'name': 'ls',
        'section': '1',
        'title': 'ls - list directory contents',
        'summary': 'List information about the FILEs (the current directory by default)',
        'sections': [
            {
                'name': 'NAME',
                'content': 'ls - list directory contents'
            },
            {
                'name': 'SYNOPSIS',
                'content': 'ls [OPTION]... [FILE]...'
            },
            {
                'name': 'DESCRIPTION',
                'content': '''List information about the FILEs (the current directory by default).
Sort entries alphabetically if none of -cftuvSUX nor --sort is specified.

Mandatory arguments to long options are mandatory for short options too.''',
                'subsections': [
                    {
                        'name': 'Display Options',
                        'content': '''-a, --all
    do not ignore entries starting with .

-l
    use a long listing format

-h, --human-readable
    with -l and -s, print sizes like 1K 234M 2G etc.'''
                    },
                    {
                        'name': 'Sorting Options',
                        'content': '''-t
    sort by time, newest first

-S
    sort by file size, largest first

-r, --reverse
    reverse order while sorting'''
                    }
                ]
            },
            {
                'name': 'EXAMPLES',
                'content': '''ls -la
    List all files in long format

ls -lh /usr/bin
    List /usr/bin with human-readable sizes

ls -lt
    List files sorted by modification time'''
            },
            {
                'name': 'SEE ALSO',
                'content': 'dir(1), vdir(1), dircolors(1), stat(1)'
            }
        ]
    },
    {
        'name': 'grep',
        'section': '1',
        'title': 'grep - print lines that match patterns',
        'summary': 'grep searches for PATTERNS in each FILE',
        'sections': [
            {
                'name': 'NAME',
                'content': 'grep, egrep, fgrep - print lines that match patterns'
            },
            {
                'name': 'SYNOPSIS',
                'content': '''grep [OPTION]... PATTERNS [FILE]...
grep [OPTION]... -e PATTERNS ... [FILE]...
grep [OPTION]... -f PATTERN_FILE ... [FILE]...'''
            },
            {
                'name': 'DESCRIPTION',
                'content': '''grep searches for PATTERNS in each FILE. PATTERNS is one or more patterns separated by newline characters, and grep prints each line that matches a pattern.

A FILE of "-" stands for standard input. If no FILE is given, recursive searches examine the working directory, and nonrecursive searches read standard input.''',
                'subsections': [
                    {
                        'name': 'Pattern Selection',
                        'content': '''-E, --extended-regexp
    Interpret PATTERNS as extended regular expressions

-F, --fixed-strings
    Interpret PATTERNS as fixed strings

-i, --ignore-case
    Ignore case distinctions'''
                    },
                    {
                        'name': 'Output Control',
                        'content': '''-n, --line-number
    Prefix each line with the line number

-H, --with-filename
    Print the file name for each match

-v, --invert-match
    Invert the sense of matching'''
                    }
                ]
            },
            {
                'name': 'EXAMPLES',
                'content': '''grep "error" /var/log/syslog
    Search for "error" in syslog

grep -r "TODO" .
    Recursively search for "TODO" in current directory

grep -E "^[0-9]+$" file.txt
    Find lines containing only numbers'''
            },
            {
                'name': 'REGULAR EXPRESSIONS',
                'content': '''Basic regular expressions:
.   Match any single character
*   Match zero or more of the preceding
^   Match beginning of line
$   Match end of line
[]  Character class'''
            },
            {
                'name': 'SEE ALSO',
                'content': 'egrep(1), fgrep(1), sed(1), awk(1)'
            }
        ]
    },
    {
        'name': 'git',
        'section': '1',
        'title': 'git - the fast distributed version control system',
        'summary': 'Git is a fast, scalable, distributed revision control system',
        'sections': [
            {
                'name': 'NAME',
                'content': 'git - the stupid content tracker'
            },
            {
                'name': 'SYNOPSIS',
                'content': '''git [--version] [--help] [-C <path>] [-c <name>=<value>]
    [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]
    <command> [<args>]'''
            },
            {
                'name': 'DESCRIPTION',
                'content': '''Git is a fast, scalable, distributed revision control system with an unusually rich command set that provides both high-level operations and full access to internals.''',
                'subsections': [
                    {
                        'name': 'Common Commands',
                        'content': '''git init
    Create an empty Git repository

git clone <url>
    Clone a repository into a new directory

git add <files>
    Add file contents to the index

git commit -m "message"
    Record changes to the repository'''
                    },
                    {
                        'name': 'Branching Commands',
                        'content': '''git branch
    List, create, or delete branches

git checkout <branch>
    Switch branches or restore files

git merge <branch>
    Join two or more development histories'''
                    }
                ]
            },
            {
                'name': 'EXAMPLES',
                'content': '''git init
    Initialize a new repository

git clone https://github.com/user/repo.git
    Clone a remote repository

git add . && git commit -m "Initial commit"
    Stage all changes and commit

git log --oneline --graph
    View commit history as a graph'''
            },
            {
                'name': 'CONFIGURATION',
                'content': '''git config --global user.name "Your Name"
git config --global user.email "you@example.com"'''
            },
            {
                'name': 'SEE ALSO',
                'content': 'gittutorial(7), giteveryday(7), gitglossary(7)'
            }
        ]
    }
]

def add_demo_pages():
    """Add demo man pages to the database."""
    with get_db_context() as db:
        added = 0
        skipped = 0
        
        for page_data in DEMO_PAGES:
            # Check if already exists
            existing = db.query(Document).filter_by(
                name=page_data['name'],
                section=page_data['section']
            ).first()
            
            if existing:
                logger.info(f"Skipping {page_data['name']} - already exists")
                skipped += 1
                continue
            
            # Create document
            doc = Document(
                name=page_data['name'],
                section=page_data['section'],
                title=page_data['title'],
                summary=page_data['summary'],
                content='',  # Will be populated from sections
                raw_content='[Demo content]',
                cache_status='demo',
                is_common=True,  # Mark as common for easy access
                access_count=0,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            db.add(doc)
            db.flush()
            
            # Add sections
            for i, section_data in enumerate(page_data['sections']):
                section = Section(
                    document_id=doc.id,
                    name=section_data['name'],
                    content=section_data['content'],
                    order=i
                )
                db.add(section)
                db.flush()
                
                # Add subsections if any
                if 'subsections' in section_data:
                    for j, subsection_data in enumerate(section_data['subsections']):
                        subsection = Subsection(
                            section_id=section.id,
                            name=subsection_data['name'],
                            content=subsection_data['content'],
                            order=j
                        )
                        db.add(subsection)
            
            db.commit()
            logger.info(f"✅ Added demo page: {page_data['name']}")
            added += 1
        
        logger.info(f"Complete! Added: {added}, Skipped: {skipped}")
        return added, skipped

if __name__ == "__main__":
    add_demo_pages()