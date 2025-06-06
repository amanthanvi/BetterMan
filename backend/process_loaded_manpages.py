#!/usr/bin/env python3
"""
Process loaded man pages to create proper section relationships.
"""

import json
import logging
from src.db.session import get_db
from src.models.document import Document, Section, Subsection, RelatedDocument

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def process_documents():
    """Process documents that have JSON content but no sections."""
    processed = 0
    errors = 0
    
    with next(get_db()) as db:
        # Find documents with JSON content but no sections
        documents = db.query(Document).filter(
            Document.content.isnot(None),
            Document.tags.like('%real%')
        ).all()
        
        logger.info(f"Found {len(documents)} documents to process")
        
        for doc in documents:
            try:
                # Skip if already has sections
                if doc.sections and len(doc.sections) > 0:
                    logger.info(f"Skipping {doc.name} - already has sections")
                    continue
                
                # Parse JSON content
                try:
                    parsed_data = json.loads(doc.content)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON in {doc.name}")
                    errors += 1
                    continue
                
                # Create sections
                section_order = 0
                for section_data in parsed_data.get('sections', []):
                    section = Section(
                        document_id=doc.id,
                        name=section_data['name'],
                        content=section_data['content'],
                        order=section_order
                    )
                    db.add(section)
                    section_order += 1
                    
                    # Create subsections if any
                    if 'subsections' in section_data:
                        subsection_order = 0
                        for subsection_data in section_data['subsections']:
                            # Need to flush to get section.id
                            db.flush()
                            subsection = Subsection(
                                section_id=section.id,
                                name=subsection_data['name'],
                                content=subsection_data['content'],
                                order=subsection_order
                            )
                            db.add(subsection)
                            subsection_order += 1
                
                # Create related documents
                for related_name in parsed_data.get('related', []):
                    related = RelatedDocument(
                        document_id=doc.id,
                        related_name=related_name
                    )
                    db.add(related)
                
                # Update document metadata
                doc.title = parsed_data.get('title', doc.name)
                doc.summary = f"Linux manual page for {doc.name}"
                
                processed += 1
                logger.info(f"✓ Processed {doc.name} with {section_order} sections")
                
            except Exception as e:
                logger.error(f"✗ Error processing {doc.name}: {e}")
                errors += 1
                db.rollback()
                continue
        
        # Commit all changes
        db.commit()
        
    logger.info(f"\n{'='*60}")
    logger.info(f"Processing complete!")
    logger.info(f"  Documents processed: {processed}")
    logger.info(f"  Errors: {errors}")
    logger.info(f"{'='*60}")

if __name__ == "__main__":
    process_documents()