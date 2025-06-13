"""
Comprehensive integration tests for search functionality.
"""

import pytest
import time
from unittest.mock import patch, MagicMock
from sqlalchemy import text

from src.models.document import Document, Section
from src.search.search_engine import SearchEngine
from src.search.optimized_search import OptimizedSearchEngine
from src.search.fts_search import FullTextSearchEngine
from src.search.fuzzy_search import FuzzySearchEngine
from src.cache.search_cache import SearchCache, get_search_cache


@pytest.mark.integration
class TestSearchIntegration:
    """Integration tests for search functionality."""
    
    @pytest.fixture(autouse=True)
    def setup_documents(self, test_db):
        """Setup test documents in database."""
        # Create test documents
        documents = [
            Document(
                name="ls",
                title="ls - list directory contents",
                section="1",
                summary="List information about files",
                raw_content="ls command content with list directory",
                is_common=True,
                access_count=100,
                cache_status="permanent"
            ),
            Document(
                name="grep",
                title="grep - print lines matching a pattern",
                section="1",
                summary="Search for patterns in files",
                raw_content="grep searches for patterns using regular expressions",
                is_common=True,
                access_count=150,
                cache_status="permanent"
            ),
            Document(
                name="find",
                title="find - search for files in a directory hierarchy",
                section="1",
                summary="Find files and directories",
                raw_content="find locates files based on criteria",
                is_common=True,
                access_count=80,
                cache_status="permanent"
            ),
            Document(
                name="obscure_cmd",
                title="obscure_cmd - rarely used command",
                section="8",
                summary="An obscure system administration command",
                raw_content="This is a rarely used command for system administration",
                is_common=False,
                access_count=2,
                cache_status="on_demand"
            ),
        ]
        
        for doc in documents:
            test_db.add(doc)
        test_db.commit()
        
        # Add sections
        ls_doc = test_db.query(Document).filter_by(name="ls").first()
        sections = [
            Section(document_id=ls_doc.id, name="NAME", content="ls - list directory contents", order=0),
            Section(document_id=ls_doc.id, name="SYNOPSIS", content="ls [OPTION]... [FILE]...", order=1),
            Section(document_id=ls_doc.id, name="DESCRIPTION", content="List information about the FILEs", order=2),
        ]
        for section in sections:
            test_db.add(section)
        test_db.commit()
        
        yield
        
        # Cleanup
        test_db.query(Section).delete()
        test_db.query(Document).delete()
        test_db.commit()
    
    def test_basic_search(self, test_db):
        """Test basic search functionality."""
        engine = SearchEngine(test_db)
        
        # Test simple search
        results = engine.search("list", page=1, per_page=10)
        
        assert results["total"] >= 1
        assert any(r["id"] == "ls" for r in results["results"])
        assert results["page"] == 1
        assert results["per_page"] == 10
    
    def test_search_with_section_filter(self, test_db):
        """Test search with section filtering."""
        engine = SearchEngine(test_db)
        
        # Search in section 1
        results = engine.search("command", section=1)
        assert all(r["section"] == 1 for r in results["results"])
        
        # Search in section 8
        results = engine.search("command", section=8)
        assert any(r["id"] == "obscure_cmd" for r in results["results"])
    
    def test_search_ranking(self, test_db):
        """Test search result ranking."""
        engine = SearchEngine(test_db)
        
        # Search for "directory"
        results = engine.search("directory")
        
        # ls should rank higher than find due to exact match in title
        ls_rank = next((i for i, r in enumerate(results["results"]) if r["id"] == "ls"), None)
        find_rank = next((i for i, r in enumerate(results["results"]) if r["id"] == "find"), None)
        
        if ls_rank is not None and find_rank is not None:
            assert ls_rank < find_rank  # Lower index = higher rank
    
    def test_empty_search(self, test_db):
        """Test empty search query."""
        engine = SearchEngine(test_db)
        
        results = engine.search("")
        assert results["total"] == 0
        assert results["results"] == []
    
    def test_search_pagination(self, test_db):
        """Test search pagination."""
        engine = SearchEngine(test_db)
        
        # Get first page
        page1 = engine.search("command", page=1, per_page=2)
        assert len(page1["results"]) <= 2
        assert page1["page"] == 1
        
        # Get second page
        page2 = engine.search("command", page=2, per_page=2)
        assert page2["page"] == 2
        
        # Results should be different
        if page1["results"] and page2["results"]:
            assert page1["results"][0]["id"] != page2["results"][0]["id"]
    
    def test_phrase_search(self, test_db):
        """Test phrase search functionality."""
        engine = SearchEngine(test_db)
        
        # Search for exact phrase
        results = engine.search('"list directory"')
        assert results["total"] >= 1
        assert any(r["id"] == "ls" for r in results["results"])
    
    def test_search_special_characters(self, test_db):
        """Test search with special characters (SQL injection prevention)."""
        engine = SearchEngine(test_db)
        
        # These should not cause SQL errors
        dangerous_queries = [
            "'; DROP TABLE documents; --",
            "1' OR '1'='1",
            "\" OR 1=1 --",
            "<script>alert('xss')</script>",
            "'; SELECT * FROM documents; --"
        ]
        
        for query in dangerous_queries:
            results = engine.search(query)
            assert isinstance(results, dict)
            assert "error" not in results  # Should handle gracefully
    
    def test_optimized_search_engine(self, test_db):
        """Test optimized search engine."""
        engine = OptimizedSearchEngine(test_db)
        
        # Basic search
        results = engine.search("grep", limit=10)
        assert results["total"] >= 1
        assert any(r["name"] == "grep" for r in results["results"])
        
        # Test with sections
        results = engine.search("pattern", search_sections=True)
        assert "results" in results
    
    def test_fuzzy_search(self, test_db):
        """Test fuzzy search functionality."""
        engine = FuzzySearchEngine(test_db)
        
        # Test typo tolerance
        results = engine.search_with_fuzzy("grp", fuzzy_threshold=0.7)  # Typo of "grep"
        assert results["total"] >= 1
        assert any("grep" in r["name"].lower() for r in results["results"])
        
        # Test suggestions
        assert "did_you_mean" in results
        if results["did_you_mean"]:
            assert "grep" in results["did_you_mean"]
    
    def test_search_cache_integration(self, test_db):
        """Test search result caching."""
        # Create cache with short TTL for testing
        cache = SearchCache(ttl=2)
        engine = OptimizedSearchEngine(test_db)
        engine.cache = cache
        
        # First search - cache miss
        start_time = time.time()
        results1 = engine.search("list", limit=10)
        first_search_time = time.time() - start_time
        
        # Second search - cache hit
        start_time = time.time()
        results2 = engine.search("list", limit=10)
        cached_search_time = time.time() - start_time
        
        # Cached search should be faster
        assert cached_search_time < first_search_time
        assert results1 == results2
        
        # Wait for cache to expire
        time.sleep(3)
        
        # Third search - cache miss again
        results3 = engine.search("list", limit=10)
        assert results3 == results1  # Results should be same
    
    def test_search_index_document(self, test_db):
        """Test document indexing for search."""
        engine = SearchEngine(test_db)
        
        # Add new document
        new_doc = Document(
            name="new_cmd",
            title="new_cmd - a new command",
            section="1",
            summary="A newly added command",
            raw_content="This is a new command for testing indexing"
        )
        test_db.add(new_doc)
        test_db.commit()
        
        # Index the document
        success = engine.index_document(new_doc.id)
        assert success is True
        
        # Search for it
        results = engine.search("new command")
        assert any(r["id"] == "new_cmd" for r in results["results"])
    
    def test_search_highlight_snippets(self, test_db):
        """Test search result highlighting."""
        engine = SearchEngine(test_db)
        
        results = engine.search("pattern")
        
        # Check for highlights in results
        for result in results["results"]:
            if result["id"] == "grep":
                # Should have match highlights
                assert "matches" in result
                if result["matches"]:
                    assert any("<mark>" in match for match in result["matches"])
    
    def test_search_access_count_update(self, test_db):
        """Test that search updates access counts."""
        engine = OptimizedSearchEngine(test_db)
        
        # Get initial access count
        grep_doc = test_db.query(Document).filter_by(name="grep").first()
        initial_count = grep_doc.access_count
        
        # Perform search
        results = engine.search("grep")
        
        # Force access count update
        engine._update_access_counts([r["id"] for r in results["results"][:5]])
        
        # Check updated count
        test_db.refresh(grep_doc)
        assert grep_doc.access_count > initial_count
    
    def test_full_text_search_engine(self, test_db):
        """Test FTS engine functionality."""
        engine = FullTextSearchEngine(test_db)
        
        # Basic FTS search
        results, total = engine.search("directory", limit=10)
        assert total >= 1
        assert any(r.name == "ls" for r in results)
        
        # Test suggestions
        suggestions = engine.suggest("gr", limit=5)
        assert "grep" in suggestions
    
    def test_search_error_handling(self, test_db):
        """Test search error handling."""
        engine = SearchEngine(test_db)
        
        # Test with invalid parameters
        with patch.object(engine.db, 'execute', side_effect=Exception("DB Error")):
            results = engine.search("test")
            assert results["results"] == []
            assert results["total"] == 0
            assert "error" in results
    
    @pytest.mark.slow
    def test_search_performance(self, test_db):
        """Test search performance with many documents."""
        # Add many documents
        for i in range(100):
            doc = Document(
                name=f"cmd{i}",
                title=f"cmd{i} - command number {i}",
                section="1",
                summary=f"This is command {i} for testing",
                raw_content=f"Content for command {i} with various keywords"
            )
            test_db.add(doc)
        test_db.commit()
        
        engine = OptimizedSearchEngine(test_db)
        
        # Measure search time
        start_time = time.time()
        results = engine.search("command", limit=20)
        search_time = time.time() - start_time
        
        # Should complete within reasonable time
        assert search_time < 1.0  # Less than 1 second
        assert results["total"] >= 100
        assert len(results["results"]) == 20


@pytest.mark.integration
class TestSearchAPI:
    """Integration tests for search API endpoints."""
    
    def test_search_endpoint(self, client, setup_documents):
        """Test /api/search endpoint."""
        response = client.get("/api/search?q=list")
        assert response.status_code == 200
        
        data = response.json()
        assert "results" in data
        assert "total" in data
        assert data["total"] >= 1
    
    def test_search_with_filters(self, client, setup_documents):
        """Test search with section filter."""
        response = client.get("/api/search?q=command&section=1")
        assert response.status_code == 200
        
        data = response.json()
        # All results should be from section 1
        for result in data["results"]:
            assert result["section"] == 1
    
    def test_search_pagination(self, client, setup_documents):
        """Test search pagination via API."""
        # First page
        response1 = client.get("/api/search?q=command&limit=2&offset=0")
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Second page
        response2 = client.get("/api/search?q=command&limit=2&offset=2")
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Should have different results
        if data1["results"] and data2["results"]:
            assert data1["results"][0]["id"] != data2["results"][0]["id"]
    
    def test_fuzzy_search_endpoint(self, client, setup_documents):
        """Test /api/search/fuzzy endpoint."""
        response = client.get("/api/search/fuzzy?q=grp")  # Typo
        assert response.status_code == 200
        
        data = response.json()
        assert "results" in data
        assert "did_you_mean" in data
    
    def test_search_suggestions(self, client, setup_documents):
        """Test /api/search/suggest endpoint."""
        response = client.get("/api/search/suggest?q=gr&limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert "suggestions" in data
        assert "grep" in data["suggestions"]
    
    def test_instant_search(self, client, setup_documents):
        """Test /api/search/instant endpoint."""
        response = client.get("/api/search/instant?q=ls&limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert "results" in data
        assert "suggestions" in data
    
    def test_search_cache_stats(self, client):
        """Test /api/search/cache/stats endpoint."""
        response = client.get("/api/search/cache/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert "cache_stats" in data
        stats = data["cache_stats"]
        assert "cache_hits" in stats
        assert "cache_misses" in stats
        assert "hit_rate" in stats
    
    def test_reindex_endpoint(self, client, setup_documents):
        """Test /api/search/reindex endpoint."""
        response = client.post("/api/search/reindex")
        assert response.status_code == 200
        
        data = response.json()
        assert "indexed_count" in data
        assert data["status"] == "success"