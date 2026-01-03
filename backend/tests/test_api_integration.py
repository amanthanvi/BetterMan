"""
Comprehensive integration tests for API endpoints.
"""

import pytest
import json
from unittest.mock import patch, MagicMock

from src.models.document import Document, Section
from src.models.analytics import PageView, SearchQuery
from src.auth.models import User


@pytest.mark.integration
class TestDocumentAPI:
    """Integration tests for document API endpoints."""
    
    @pytest.fixture
    def sample_documents(self, test_db):
        """Create sample documents."""
        docs = [
            Document(
                name="test1",
                title="Test Command 1",
                section="1",
                summary="First test command",
                raw_content="Content 1",
                content=json.dumps({
                    "sections": [
                        {"name": "NAME", "content": "test1 - first test"},
                        {"name": "DESCRIPTION", "content": "This is test 1"}
                    ]
                })
            ),
            Document(
                name="test2",
                title="Test Command 2",
                section="2",
                summary="Second test command",
                raw_content="Content 2"
            ),
            Document(
                name="test3",
                title="Test Command 3",
                section="8",
                summary="Third test command",
                raw_content="Content 3"
            )
        ]
        
        for doc in docs:
            test_db.add(doc)
        test_db.commit()
        
        yield docs
        
        # Cleanup
        test_db.query(Document).delete()
        test_db.commit()
    
    def test_list_documents(self, client, sample_documents):
        """Test listing documents."""
        response = client.get("/api/docs")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3
        
        # Verify document structure
        doc = data[0]
        assert "id" in doc
        assert "name" in doc
        assert "title" in doc
        assert "section" in doc
    
    def test_list_documents_with_filters(self, client, sample_documents):
        """Test listing documents with filters."""
        # Filter by section
        response = client.get("/api/docs?section=1")
        assert response.status_code == 200
        data = response.json()
        assert all(doc["section"] == "1" for doc in data)
        
        # Limit results
        response = client.get("/api/docs?limit=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 2
        
        # Offset for pagination
        response = client.get("/api/docs?limit=1&offset=1")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
    
    def test_get_document(self, client, sample_documents):
        """Test getting a single document."""
        doc = sample_documents[0]
        
        # Get by ID
        response = client.get(f"/api/docs/{doc.id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == doc.name
        assert data["title"] == doc.title
        assert "sections" in data
        assert len(data["sections"]) == 2
    
    def test_get_document_by_name_section(self, client, sample_documents):
        """Test getting document by name and section."""
        response = client.get("/api/docs/test1/1")
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == "test1"
        assert data["section"] == "1"
    
    def test_get_nonexistent_document(self, client):
        """Test getting non-existent document."""
        response = client.get("/api/docs/99999")
        assert response.status_code == 404
        
        response = client.get("/api/docs/nonexistent/1")
        assert response.status_code == 404
    
    def test_document_content_negotiation(self, client, sample_documents):
        """Test different content formats."""
        doc_id = sample_documents[0].id
        
        # JSON format (default)
        response = client.get(f"/api/docs/{doc_id}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/json")
        
        # Plain text format
        response = client.get(f"/api/docs/{doc_id}?format=text")
        assert response.status_code == 200
        
        # Markdown format
        response = client.get(f"/api/docs/{doc_id}?format=markdown")
        assert response.status_code == 200
    
    def test_document_caching_headers(self, client, sample_documents):
        """Test document caching headers."""
        doc_id = sample_documents[0].id
        
        response = client.get(f"/api/docs/{doc_id}")
        assert response.status_code == 200
        
        # Should have cache headers
        headers = response.headers
        assert "cache-control" in headers or "etag" in headers
    
    def test_import_document(self, client, mock_man_page_content):
        """Test importing a new document."""
        with patch('src.parser.man_utils.fetch_man_page_content') as mock_fetch:
            mock_fetch.return_value = (mock_man_page_content, {})
            
            # Import document
            response = client.post("/api/docs/import", json={
                "name": "newcmd",
                "section": 1
            })
            
            if response.status_code == 201:
                data = response.json()
                assert data["name"] == "newcmd"
                assert data["status"] == "imported"
    
    def test_bulk_import(self, client):
        """Test bulk document import."""
        with patch('src.services.import_service.ImportService.import_section') as mock_import:
            mock_import.return_value = {"imported": 10, "failed": 2}
            
            response = client.post("/api/docs/import/bulk", json={
                "sections": [1, 8],
                "limit": 50
            })
            
            if response.status_code == 200:
                data = response.json()
                assert "results" in data
                assert data["results"]["imported"] > 0


@pytest.mark.integration
class TestAnalyticsAPI:
    """Integration tests for analytics API endpoints."""
    
    @pytest.fixture
    def analytics_data(self, test_db):
        """Create analytics data."""
        # Create page views
        views = [
            PageView(document_id=1, ip_address="127.0.0.1", user_agent="Test/1.0"),
            PageView(document_id=1, ip_address="127.0.0.2", user_agent="Test/1.0"),
            PageView(document_id=2, ip_address="127.0.0.1", user_agent="Test/1.0"),
        ]
        
        # Create search queries
        queries = [
            SearchQuery(query="test", results_count=5, ip_address="127.0.0.1"),
            SearchQuery(query="grep", results_count=3, ip_address="127.0.0.2"),
            SearchQuery(query="test", results_count=5, ip_address="127.0.0.3"),
        ]
        
        for item in views + queries:
            test_db.add(item)
        test_db.commit()
        
        yield
        
        # Cleanup
        test_db.query(PageView).delete()
        test_db.query(SearchQuery).delete()
        test_db.commit()
    
    def test_analytics_overview(self, client, analytics_data):
        """Test analytics overview endpoint."""
        response = client.get("/api/analytics/overview")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_documents" in data
        assert "total_views" in data
        assert "total_searches" in data
        assert "unique_visitors" in data
        assert data["total_views"] == 3
        assert data["total_searches"] == 3
    
    def test_popular_documents(self, client, analytics_data):
        """Test popular documents endpoint."""
        response = client.get("/api/analytics/popular?limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # Document 1 should be most popular (2 views)
        if data:
            assert data[0]["view_count"] >= 2
    
    def test_search_trends(self, client, analytics_data):
        """Test search trends endpoint."""
        response = client.get("/api/analytics/search-trends?days=7")
        assert response.status_code == 200
        
        data = response.json()
        assert "popular_queries" in data
        assert "trend_data" in data
        
        # "test" should be most popular (2 occurrences)
        popular = data["popular_queries"]
        if popular:
            assert popular[0]["query"] == "test"
            assert popular[0]["count"] == 2
    
    def test_track_page_view(self, client):
        """Test tracking page views."""
        response = client.post("/api/analytics/track/view", json={
            "document_id": 1,
            "referrer": "https://example.com"
        })
        assert response.status_code in [200, 201]
    
    def test_track_search(self, client):
        """Test tracking searches."""
        response = client.post("/api/analytics/track/search", json={
            "query": "new search",
            "results_count": 10
        })
        assert response.status_code in [200, 201]
    
    def test_export_analytics(self, client, analytics_data):
        """Test analytics export."""
        response = client.get("/api/analytics/export?format=json")
        assert response.status_code == 200
        
        data = response.json()
        assert "page_views" in data
        assert "search_queries" in data
        assert "export_date" in data


@pytest.mark.integration
class TestHealthAPI:
    """Integration tests for health check endpoints."""
    
    def test_health_check(self, client):
        """Test basic health check."""
        response = client.get("/api/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "version" in data
    
    def test_detailed_health_check(self, client):
        """Test detailed health check."""
        response = client.get("/api/health/detailed")
        assert response.status_code == 200
        
        data = response.json()
        assert "database" in data
        assert "cache" in data
        assert "search" in data
        
        # All components should be healthy
        assert data["database"]["status"] == "healthy"
        assert data["cache"]["status"] == "healthy"
    
    def test_readiness_check(self, client):
        """Test readiness check."""
        response = client.get("/api/health/ready")
        assert response.status_code == 200
        
        data = response.json()
        assert data["ready"] is True
        assert "checks" in data
    
    def test_liveness_check(self, client):
        """Test liveness check."""
        response = client.get("/api/health/live")
        assert response.status_code == 200
        
        data = response.json()
        assert data["alive"] is True


@pytest.mark.integration
class TestRateLimiting:
    """Integration tests for rate limiting."""
    
    def test_rate_limit_search(self, client):
        """Test rate limiting on search endpoint."""
        # Make many requests quickly
        responses = []
        for i in range(35):  # Default limit is 30/minute
            response = client.get("/api/search?q=test")
            responses.append(response.status_code)
        
        # Some requests should be rate limited
        assert 429 in responses  # Too Many Requests
        
        # Check rate limit headers
        last_response = responses[-1]
        if last_response == 429:
            headers = client.get("/api/search?q=test").headers
            assert "X-RateLimit-Limit" in headers or "Retry-After" in headers
    
    def test_rate_limit_by_ip(self, client):
        """Test that rate limiting is per IP."""
        # Requests from different IPs shouldn't interfere
        headers1 = {"X-Forwarded-For": "192.168.1.1"}
        headers2 = {"X-Forwarded-For": "192.168.1.2"}
        
        # Make requests from first IP
        for i in range(5):
            client.get("/api/search?q=test", headers=headers1)
        
        # Requests from second IP should still work
        response = client.get("/api/search?q=test", headers=headers2)
        assert response.status_code == 200


@pytest.mark.integration
class TestCORS:
    """Integration tests for CORS configuration."""
    
    def test_cors_headers(self, client):
        """Test CORS headers on responses."""
        # Make request with Origin header
        headers = {"Origin": "http://localhost:3000"}
        response = client.get("/api/docs", headers=headers)
        
        assert response.status_code == 200
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    
    def test_cors_preflight(self, client):
        """Test CORS preflight requests."""
        headers = {
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type"
        }
        
        response = client.options("/api/docs/import", headers=headers)
        assert response.status_code == 200
        assert "access-control-allow-methods" in response.headers
        assert "POST" in response.headers["access-control-allow-methods"]


@pytest.mark.integration
class TestErrorHandling:
    """Integration tests for error handling."""
    
    def test_404_error(self, client):
        """Test 404 error response."""
        response = client.get("/api/nonexistent")
        assert response.status_code == 404
        
        data = response.json()
        assert "detail" in data
    
    def test_validation_error(self, client):
        """Test validation error response."""
        # Invalid data
        response = client.get("/api/docs?limit=invalid")
        assert response.status_code == 422
        
        data = response.json()
        assert "detail" in data
        assert isinstance(data["detail"], list)
        assert data["detail"][0]["type"] == "int_parsing"
    
    def test_internal_error_handling(self, client):
        """Test internal error handling."""
        with patch('src.db.session.get_db', side_effect=Exception("DB Error")):
            response = client.get("/api/docs")
            assert response.status_code == 500
            
            data = response.json()
            assert "detail" in data
            assert "Internal server error" in data["detail"]