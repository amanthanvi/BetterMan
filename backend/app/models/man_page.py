from sqlalchemy import Column, Integer, String, Text, JSON, ARRAY, DateTime, Index
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()

class ManPage(Base):
    __tablename__ = "man_pages"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    section = Column(Integer, nullable=False, index=True)
    title = Column(Text)
    description = Column(Text)
    synopsis = Column(Text)
    content = Column(JSON)
    search_vector = Column(TSVECTOR)
    category = Column(String(100), index=True)
    related_commands = Column(ARRAY(String))
    metadata = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    __table_args__ = (
        Index('idx_name_section', 'name', 'section', unique=True),
        Index('idx_search_vector', 'search_vector', postgresql_using='gin'),
        Index('idx_category', 'category'),
    )
