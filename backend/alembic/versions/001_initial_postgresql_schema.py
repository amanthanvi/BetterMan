"""Initial PostgreSQL schema with full-text search

Revision ID: 001
Revises: 
Create Date: 2025-01-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create extensions (gen_random_uuid() is built-in since PostgreSQL 13)
    # op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')  # Not needed with gen_random_uuid()
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    op.execute('CREATE EXTENSION IF NOT EXISTS btree_gin')
    
    # Create categories table
    op.create_table('categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('path', sa.String(length=500), nullable=True),
        sa.Column('level', sa.Integer(), nullable=True, default=0),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('color', sa.String(length=7), nullable=True),
        sa.Column('order', sa.Integer(), nullable=True, default=0),
        sa.Column('command_count', sa.Integer(), nullable=True, default=0),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['parent_id'], ['categories.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.UniqueConstraint('slug')
    )
    op.create_index('idx_category_parent', 'categories', ['parent_id'], unique=False)
    op.create_index('idx_category_path', 'categories', ['path'], unique=False)
    op.create_index('idx_category_slug', 'categories', ['slug'], unique=False)
    
    # Create man_pages table
    op.create_table('man_pages',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('section', sa.String(length=10), nullable=False),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('synopsis', sa.Text(), nullable=True),
        sa.Column('content', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('search_vector', postgresql.TSVECTOR(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('related_commands', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('meta_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('is_common', sa.Boolean(), nullable=True, default=False),
        sa.Column('view_count', sa.Integer(), nullable=True, default=0),
        sa.Column('last_accessed', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('cache_priority', sa.Integer(), nullable=True, default=0),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint('view_count >= 0', name='check_view_count_positive'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', 'section', name='uq_man_page_name_section')
    )
    op.create_index('idx_man_page_category', 'man_pages', ['category'], unique=False)
    op.create_index('idx_man_page_common', 'man_pages', ['is_common'], unique=False)
    op.create_index('idx_man_page_created', 'man_pages', ['created_at'], unique=False)
    op.create_index('idx_man_page_name_section', 'man_pages', ['name', 'section'], unique=False)
    op.create_index('idx_man_page_popularity', 'man_pages', ['view_count', 'last_accessed'], unique=False)
    op.create_index('idx_man_page_search_vector', 'man_pages', ['search_vector'], unique=False, postgresql_using='gin')
    
    # Create search_history table
    op.create_table('search_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('query', sa.String(length=500), nullable=False),
        sa.Column('normalized_query', sa.String(length=500), nullable=True),
        sa.Column('search_type', sa.String(length=50), nullable=True),
        sa.Column('results_count', sa.Integer(), nullable=True, default=0),
        sa.Column('clicked_result_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('result_position', sa.Integer(), nullable=True),
        sa.Column('session_id', sa.String(length=100), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('ip_hash', sa.String(length=64), nullable=True),
        sa.Column('search_duration_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['clicked_result_id'], ['man_pages.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_search_history_created', 'search_history', ['created_at'], unique=False)
    op.create_index('idx_search_history_query', 'search_history', ['query'], unique=False)
    op.create_index('idx_search_history_session', 'search_history', ['session_id'], unique=False)
    
    # Create cache_metadata table
    op.create_table('cache_metadata',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('cache_key', sa.String(length=500), nullable=False),
        sa.Column('cache_type', sa.String(length=50), nullable=False),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('compressed_size_bytes', sa.Integer(), nullable=True),
        sa.Column('hit_count', sa.Integer(), nullable=True, default=0),
        sa.Column('miss_count', sa.Integer(), nullable=True, default=0),
        sa.Column('avg_response_time_ms', sa.Float(), nullable=True),
        sa.Column('ttl_seconds', sa.Integer(), nullable=True),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_accessed', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('cache_key')
    )
    op.create_index('idx_cache_metadata_expires', 'cache_metadata', ['expires_at'], unique=False)
    op.create_index('idx_cache_metadata_key', 'cache_metadata', ['cache_key'], unique=False)
    op.create_index('idx_cache_metadata_type', 'cache_metadata', ['cache_type'], unique=False)
    
    # Create popular_commands table
    op.create_table('popular_commands',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('man_page_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('period', sa.String(length=20), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('view_count', sa.Integer(), nullable=True, default=0),
        sa.Column('unique_sessions', sa.Integer(), nullable=True, default=0),
        sa.Column('calculated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['man_page_id'], ['man_pages.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('man_page_id', 'period', name='uq_popular_command_page_period')
    )
    op.create_index('idx_popular_command_expires', 'popular_commands', ['expires_at'], unique=False)
    op.create_index('idx_popular_command_period_rank', 'popular_commands', ['period', 'rank'], unique=False)
    
    # Create user_preferences table
    op.create_table('user_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', sa.String(length=100), nullable=False),
        sa.Column('preferences', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('frequent_commands', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('default_sections', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('excluded_categories', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('theme', sa.String(length=20), nullable=True, default='light'),
        sa.Column('compact_view', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('last_active', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index('idx_user_preference_active', 'user_preferences', ['last_active'], unique=False)
    op.create_index('idx_user_preference_user', 'user_preferences', ['user_id'], unique=False)
    
    # Create full-text search function and trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION update_search_vector() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector := 
                setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(NEW.title, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C') ||
                setweight(to_tsvector('english', coalesce(NEW.synopsis, '')), 'D');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    op.execute("""
        CREATE TRIGGER update_man_page_search_vector
        BEFORE INSERT OR UPDATE OF name, title, description, synopsis
        ON man_pages
        FOR EACH ROW
        EXECUTE FUNCTION update_search_vector();
    """)
    
    # Create search function
    op.execute("""
        CREATE OR REPLACE FUNCTION search_man_pages(
            search_query text,
            limit_results int DEFAULT 20
        ) RETURNS TABLE(
            id uuid,
            name text,
            section text,
            title text,
            description text,
            rank real
        ) AS $$
        BEGIN
            RETURN QUERY
            SELECT 
                mp.id,
                mp.name::text,
                mp.section::text,
                mp.title,
                mp.description,
                ts_rank(mp.search_vector, plainto_tsquery('english', search_query)) AS rank
            FROM man_pages mp
            WHERE mp.search_vector @@ plainto_tsquery('english', search_query)
            ORDER BY rank DESC, mp.view_count DESC
            LIMIT limit_results;
        END;
        $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    # Drop functions and triggers
    op.execute('DROP FUNCTION IF EXISTS search_man_pages CASCADE')
    op.execute('DROP TRIGGER IF EXISTS update_man_page_search_vector ON man_pages')
    op.execute('DROP FUNCTION IF EXISTS update_search_vector CASCADE')
    
    # Drop tables
    op.drop_table('user_preferences')
    op.drop_table('popular_commands')
    op.drop_table('cache_metadata')
    op.drop_table('search_history')
    op.drop_table('man_pages')
    op.drop_table('categories')