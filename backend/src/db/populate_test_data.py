"""
Script to populate the database with test man page data.
"""

import os
import sys
from pathlib import Path

# Add the parent directory to Python path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session
from src.db.session import engine, get_db
from src.models.document import Document, Section, Subsection, Base
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test data for common commands
TEST_COMMANDS = [
    {
        "name": "ls",
        "title": "ls - list directory contents",
        "section": 1,
        "summary": "List information about the FILEs (the current directory by default)",
        "raw_content": """LS(1)                            User Commands                           LS(1)

NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List  information  about  the FILEs (the current directory by default).
       Sort entries alphabetically if none of -cftuvSUX nor --sort  is  specified.

       Mandatory  arguments  to  long  options are mandatory for short options
       too.

       -a, --all
              do not ignore entries starting with .

       -A, --almost-all
              do not list implied . and ..

       -l     use a long listing format

       -h, --human-readable
              with -l and -s, print sizes like 1K 234M 2G etc.

EXAMPLES
       ls -la
              List all files in long format

       ls -lh /usr/bin
              List files in /usr/bin with human-readable sizes

SEE ALSO
       dir(1), vdir(1), dircolors(1), stat(1)
""",
        "is_common": True,
        "access_count": 100,
        "cache_status": "permanent",
        "cache_priority": 10
    },
    {
        "name": "cd",
        "title": "cd - change directory",
        "section": 1,
        "summary": "Change the shell working directory",
        "raw_content": """CD(1)                            User Commands                           CD(1)

NAME
       cd - change directory

SYNOPSIS
       cd [directory]

DESCRIPTION
       Change the current directory to directory. If no argument is given, 
       the value of the HOME shell variable is the default.

EXAMPLES
       cd /home/user
              Change to /home/user directory

       cd ..
              Change to parent directory

       cd
              Change to home directory

SEE ALSO
       pwd(1), pushd(1), popd(1)
""",
        "is_common": True,
        "access_count": 95,
        "cache_status": "permanent",
        "cache_priority": 10
    },
    {
        "name": "grep",
        "title": "grep - print lines matching a pattern",
        "section": 1,
        "summary": "Search for PATTERN in each FILE or standard input",
        "raw_content": """GREP(1)                          User Commands                         GREP(1)

NAME
       grep, egrep, fgrep - print lines matching a pattern

SYNOPSIS
       grep [OPTIONS] PATTERN [FILE...]
       grep [OPTIONS] [-e PATTERN | -f FILE] [FILE...]

DESCRIPTION
       grep  searches  the  named input FILEs for lines containing a match to
       the given PATTERN.  If no files are specified, or if the file "-"  is
       given, grep searches standard input.

OPTIONS
       -i, --ignore-case
              Ignore case distinctions in both the PATTERN and the input files.

       -v, --invert-match
              Invert the sense of matching, to select non-matching lines.

       -n, --line-number
              Prefix each line of output with the 1-based line number.

       -r, --recursive
              Read all files under each directory, recursively.

EXAMPLES
       grep -i "error" logfile.txt
              Search for "error" case-insensitively

       grep -rn "TODO" src/
              Recursively search for "TODO" with line numbers

SEE ALSO
       sed(1), awk(1), find(1)
""",
        "is_common": True,
        "access_count": 85,
        "cache_status": "permanent",
        "cache_priority": 9
    }
]


def populate_test_data():
    """Populate database with test man page data."""
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # Get database session
    db = next(get_db())
    
    try:
        # Check if data already exists
        existing_count = db.query(Document).count()
        if existing_count > 0:
            logger.info(f"Database already contains {existing_count} documents")
            return
        
        # Insert test documents
        for cmd_data in TEST_COMMANDS:
            # Create document
            document = Document(
                name=cmd_data["name"],
                title=cmd_data["title"],
                section=cmd_data["section"],
                summary=cmd_data["summary"],
                raw_content=cmd_data["raw_content"],
                is_common=cmd_data["is_common"],
                access_count=cmd_data["access_count"],
                cache_status=cmd_data["cache_status"],
                cache_priority=cmd_data["cache_priority"]
            )
            db.add(document)
            db.flush()  # Get the document ID
            
            # Parse content to create sections
            lines = cmd_data["raw_content"].split('\n')
            current_section = None
            section_content = []
            section_order = 0
            
            for line in lines:
                # Check if this is a section header (all caps)
                if line and line.isupper() and not line.startswith(' '):
                    # Save previous section if exists
                    if current_section and section_content:
                        section = Section(
                            document_id=document.id,
                            name=current_section,
                            content='\n'.join(section_content).strip(),
                            order=section_order
                        )
                        db.add(section)
                        section_order += 1
                    
                    # Start new section
                    current_section = line.strip()
                    section_content = []
                else:
                    section_content.append(line)
            
            # Save last section
            if current_section and section_content:
                section = Section(
                    document_id=document.id,
                    name=current_section,
                    content='\n'.join(section_content).strip(),
                    order=section_order
                )
                db.add(section)
        
        # Commit all changes
        db.commit()
        logger.info(f"Successfully populated database with {len(TEST_COMMANDS)} test documents")
        
        # Verify data was inserted
        count = db.query(Document).count()
        logger.info(f"Database now contains {count} documents")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error populating test data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    populate_test_data()