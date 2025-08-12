"""
Add loading sessions table for tracking man page loading progress.
"""

from sqlalchemy import Column, String, Integer, DateTime, JSON, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


def upgrade(op):
    """Add loading_sessions table."""
    
    # Create loading_sessions table
    op.create_table(
        'loading_sessions',
        Column('id', Integer, primary_key=True),
        Column('session_id', String(100), unique=True, nullable=False),
        Column('start_time', DateTime, nullable=False),
        Column('end_time', DateTime, nullable=True),
        Column('status', String(50), nullable=False),  # initializing, discovering, processing, completed, failed, cancelled
        Column('total_pages', Integer, default=0),
        Column('pages_processed', Integer, default=0),
        Column('pages_success', Integer, default=0),
        Column('pages_error', Integer, default=0),
        Column('pages_skipped', Integer, default=0),
        Column('current_section', String(10), nullable=True),
        Column('sections_completed', JSON, nullable=True),  # List of completed sections
        Column('error_log', JSON, nullable=True),  # List of errors
        Column('config', JSON, nullable=True),  # Session configuration
        Column('checkpoints', JSON, nullable=True),  # Recovery checkpoints
        Column('created_at', DateTime, default=datetime.utcnow),
        Column('updated_at', DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
    )
    
    # Add indexes for efficient querying
    op.create_index('idx_loading_sessions_session_id', 'loading_sessions', ['session_id'])
    op.create_index('idx_loading_sessions_status', 'loading_sessions', ['status'])
    op.create_index('idx_loading_sessions_start_time', 'loading_sessions', ['start_time'])
    
    # Add comprehensive metadata columns to documents table
    op.add_column('documents', Column('meta_info', JSON, nullable=True))
    op.add_column('documents', Column('priority', Integer, nullable=True))
    op.add_column('documents', Column('file_path', String(500), nullable=True))
    op.add_column('documents', Column('file_size', Integer, nullable=True))
    op.add_column('documents', Column('package_hint', String(100), nullable=True))
    
    # Add indexes for new columns
    op.create_index('idx_documents_priority', 'documents', ['priority'])
    op.create_index('idx_documents_package_hint', 'documents', ['package_hint'])
    
    # Create man_page_stats table for analytics
    op.create_table(
        'man_page_stats',
        Column('id', Integer, primary_key=True),
        Column('date', DateTime, nullable=False),
        Column('total_pages', Integer, default=0),
        Column('sections_count', JSON, nullable=True),  # Count by section
        Column('categories_count', JSON, nullable=True),  # Count by category
        Column('priorities_count', JSON, nullable=True),  # Count by priority
        Column('total_size_mb', Float, nullable=True),
        Column('average_size_kb', Float, nullable=True),
        Column('created_at', DateTime, default=datetime.utcnow),
    )
    
    op.create_index('idx_man_page_stats_date', 'man_page_stats', ['date'])


def downgrade(op):
    """Remove loading sessions and related tables."""
    
    # Drop man_page_stats table
    op.drop_index('idx_man_page_stats_date', 'man_page_stats')
    op.drop_table('man_page_stats')
    
    # Remove columns from documents table
    op.drop_index('idx_documents_priority', 'documents')
    op.drop_index('idx_documents_package_hint', 'documents')
    op.drop_column('documents', 'meta_info')
    op.drop_column('documents', 'priority')
    op.drop_column('documents', 'file_path')
    op.drop_column('documents', 'file_size')
    op.drop_column('documents', 'package_hint')
    
    # Drop loading_sessions table
    op.drop_index('idx_loading_sessions_session_id', 'loading_sessions')
    op.drop_index('idx_loading_sessions_status', 'loading_sessions')
    op.drop_index('idx_loading_sessions_start_time', 'loading_sessions')
    op.drop_table('loading_sessions')