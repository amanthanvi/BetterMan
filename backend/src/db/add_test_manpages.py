#!/usr/bin/env python3
"""
Script to add more test man pages with proper formatting.
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

# Additional test data for common commands
ADDITIONAL_TEST_COMMANDS = [
    {
        "name": "cat",
        "title": "cat - concatenate files and print on the standard output",
        "section": 1,
        "summary": "Concatenate FILE(s) to standard output",
        "raw_content": """CAT(1)                           User Commands                          CAT(1)

NAME
       cat - concatenate files and print on the standard output

SYNOPSIS
       cat [OPTION]... [FILE]...

DESCRIPTION
       Concatenate FILE(s) to standard output.

       With no FILE, or when FILE is -, read standard input.

       -A, --show-all
              equivalent to -vET

       -b, --number-nonblank
              number nonempty output lines, overrides -n

       -e     equivalent to -vE

       -E, --show-ends
              display $ at end of each line

       -n, --number
              number all output lines

       -s, --squeeze-blank
              suppress repeated empty output lines

       -t     equivalent to -vT

       -T, --show-tabs
              display TAB characters as ^I

       -u     (ignored)

       -v, --show-nonprinting
              use ^ and M- notation, except for LFD and TAB

       --help display this help and exit

       --version
              output version information and exit

EXAMPLES
       cat f - g
              Output f's contents, then standard input, then g's contents.

       cat    Copy standard input to standard output.

AUTHOR
       Written by Torbjorn Granlund and Richard M. Stallman.

SEE ALSO
       tac(1), nl(1), od(1), base32(1), base64(1)
""",
        "is_common": True,
        "access_count": 50,
        "cache_status": "permanent",
        "cache_priority": 8
    },
    {
        "name": "echo",
        "title": "echo - display a line of text",
        "section": 1,
        "summary": "Display a line of text",
        "raw_content": """ECHO(1)                          User Commands                         ECHO(1)

NAME
       echo - display a line of text

SYNOPSIS
       echo [SHORT-OPTION]... [STRING]...
       echo LONG-OPTION

DESCRIPTION
       Echo the STRING(s) to standard output.

       -n     do not output the trailing newline

       -e     enable interpretation of backslash escapes

       -E     disable interpretation of backslash escapes (default)

       --help display this help and exit

       --version
              output version information and exit

       If -e is in effect, the following sequences are recognized:

       \\\\     backslash

       \\a     alert (BEL)

       \\b     backspace

       \\c     produce no further output

       \\e     escape

       \\f     form feed

       \\n     new line

       \\r     carriage return

       \\t     horizontal tab

       \\v     vertical tab

EXAMPLES
       echo Hello World
              Print "Hello World" to standard output

       echo -n "No newline"
              Print without trailing newline

       echo -e "Line 1\\nLine 2"
              Print two lines using escape sequence

SEE ALSO
       printf(1)
""",
        "is_common": True,
        "access_count": 45,
        "cache_status": "permanent",
        "cache_priority": 8
    },
    {
        "name": "pwd",
        "title": "pwd - print name of current/working directory",
        "section": 1,
        "summary": "Print the full filename of the current working directory",
        "raw_content": """PWD(1)                           User Commands                          PWD(1)

NAME
       pwd - print name of current/working directory

SYNOPSIS
       pwd [OPTION]...

DESCRIPTION
       Print the full filename of the current working directory.

       -L, --logical
              use PWD from environment, even if it contains symlinks

       -P, --physical
              avoid all symlinks

       --help display this help and exit

       --version
              output version information and exit

       If no option is specified, -P is assumed.

       NOTE: your shell may have its own version of pwd, which usually supersedes
       the version described here.  Please refer to your shell's documentation
       for details about the options it supports.

EXAMPLES
       pwd
              Print the current working directory

       pwd -P
              Print the physical current working directory (resolving symlinks)

SEE ALSO
       cd(1), readlink(1)
""",
        "is_common": True,
        "access_count": 40,
        "cache_status": "permanent",
        "cache_priority": 8
    },
    {
        "name": "mkdir",
        "title": "mkdir - make directories",
        "section": 1,
        "summary": "Create the DIRECTORY(ies), if they do not already exist",
        "raw_content": """MKDIR(1)                         User Commands                        MKDIR(1)

NAME
       mkdir - make directories

SYNOPSIS
       mkdir [OPTION]... DIRECTORY...

DESCRIPTION
       Create the DIRECTORY(ies), if they do not already exist.

       Mandatory arguments to long options are mandatory for short options too.

       -m, --mode=MODE
              set file mode (as in chmod), not a=rwx - umask

       -p, --parents
              no error if existing, make parent directories as needed

       -v, --verbose
              print a message for each created directory

       -Z     set SELinux security context of each created directory to the
              default type

       --context[=CTX]
              like -Z, or if CTX is specified then set the SELinux or SMACK
              security context to CTX

       --help display this help and exit

       --version
              output version information and exit

EXAMPLES
       mkdir mydir
              Create directory 'mydir' in current directory

       mkdir -p /path/to/nested/dir
              Create nested directories, including parents

       mkdir -m 755 public_dir
              Create directory with specific permissions

SEE ALSO
       rmdir(1), chmod(1)
""",
        "is_common": True,
        "access_count": 35,
        "cache_status": "permanent",
        "cache_priority": 7
    },
    {
        "name": "rm",
        "title": "rm - remove files or directories",
        "section": 1,
        "summary": "Remove (unlink) the FILE(s)",
        "raw_content": """RM(1)                            User Commands                           RM(1)

NAME
       rm - remove files or directories

SYNOPSIS
       rm [OPTION]... [FILE]...

DESCRIPTION
       This manual page documents the GNU version of rm.  rm removes each specified
       file.  By default, it does not remove directories.

       If the -I or --interactive=once option is given, and there are more than three
       files or the -r, -R, or --recursive are given, then rm prompts the user for
       whether to proceed with the entire operation.  If the response is not affirma‐
       tive, the entire command is aborted.

       Otherwise, if a file is unwritable, standard input is a terminal, and the -f or
       --force option is not given, or the -i or --interactive=always option is given,
       rm prompts the user for whether to remove the file.  If the response is not
       affirmative, the file is skipped.

OPTIONS
       Remove (unlink) the FILE(s).

       -f, --force
              ignore nonexistent files and arguments, never prompt

       -i     prompt before every removal

       -I     prompt once before removing more than three files, or when removing
              recursively; less intrusive than -i, while still giving protection
              against most mistakes

       --interactive[=WHEN]
              prompt according to WHEN: never, once (-I), or always (-i); without
              WHEN, prompt always

       -r, -R, --recursive
              remove directories and their contents recursively

       -d, --dir
              remove empty directories

       -v, --verbose
              explain what is being done

       --help display this help and exit

       --version
              output version information and exit

EXAMPLES
       rm file.txt
              Remove file.txt

       rm -rf directory/
              Recursively remove directory and all its contents (use with caution!)

       rm -i important.txt
              Prompt before removing important.txt

SEE ALSO
       unlink(1), rmdir(1), shred(1)
""",
        "is_common": True,
        "access_count": 30,
        "cache_status": "permanent",
        "cache_priority": 7
    }
]


def add_test_manpages():
    """Add more test man pages to the database."""
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # Get database session
    db = next(get_db())
    
    try:
        # Get existing documents
        existing_names = {doc.name for doc in db.query(Document.name).all()}
        logger.info(f"Found {len(existing_names)} existing documents in database")
        
        added_count = 0
        
        for cmd_data in ADDITIONAL_TEST_COMMANDS:
            if cmd_data["name"] in existing_names:
                logger.info(f"Skipping {cmd_data['name']} - already exists")
                continue
            
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
                if line and line.strip() and line.strip().isupper() and not line.startswith(' '):
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
            
            added_count += 1
            logger.info(f"Added {cmd_data['name']} to database")
        
        # Commit all changes
        db.commit()
        
        # Final statistics
        total_docs = db.query(Document).count()
        logger.info(f"\nLoading complete!")
        logger.info(f"Added {added_count} new documents")
        logger.info(f"Total documents in database: {total_docs}")
        
        # Show all documents
        logger.info("\nAll documents in database:")
        all_docs = db.query(Document).order_by(Document.name).all()
        for doc in all_docs:
            logger.info(f"  - {doc.name}.{doc.section}: {doc.title}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding test data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    add_test_manpages()