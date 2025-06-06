#!/usr/bin/env python3
"""
Clean up section names that have groff formatting artifacts.
"""

import re
import logging
from src.db.session import get_db
from src.models.document import Section

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def clean_section_name(name):
    """Clean groff formatting from section names."""
    # Remove everything after NAME/SYNOPSIS/DESCRIPTION etc
    cleaned = name.split('\n')[0].strip()
    
    # Remove .SH and quotes
    cleaned = re.sub(r'^\.SH\s*"?', '', cleaned)
    cleaned = re.sub(r'"?\s*$', '', cleaned)
    
    # Standard section names
    standard_names = {
        'NAME', 'SYNOPSIS', 'DESCRIPTION', 'OPTIONS', 'EXAMPLES',
        'SEE ALSO', 'AUTHOR', 'AUTHORS', 'BUGS', 'COPYRIGHT',
        'ENVIRONMENT', 'FILES', 'HISTORY', 'NOTES', 'RETURN VALUE',
        'EXIT STATUS', 'DIAGNOSTICS', 'STANDARDS', 'AVAILABILITY'
    }
    
    # If it's a standard name, use it
    for std_name in standard_names:
        if cleaned.upper().startswith(std_name):
            return std_name
    
    return cleaned

def cleanup_sections():
    """Clean up all section names."""
    updated = 0
    
    with next(get_db()) as db:
        sections = db.query(Section).all()
        
        logger.info(f"Found {len(sections)} sections to check")
        
        for section in sections:
            old_name = section.name
            new_name = clean_section_name(old_name)
            
            if old_name != new_name:
                section.name = new_name
                updated += 1
                logger.info(f"Updated: '{old_name}' -> '{new_name}'")
        
        db.commit()
        
    logger.info(f"\nCleaned up {updated} section names")

if __name__ == "__main__":
    cleanup_sections()