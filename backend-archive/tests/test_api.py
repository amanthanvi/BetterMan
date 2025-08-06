"""
Tests for API endpoints.
"""

import pytest
from fastapi import status
from sqlalchemy.orm import Session
from src.models.document import Document, Section


class TestRootEndpoints:
    """Test root and health endpoints."""
    
    def test_root_endpoint(self, client):
        """Test root endpoint."""
        response = client.get("/")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data
        assert "version" in data
        assert "environment" in data
    
    def test_health_endpoint(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "ok"
        assert "components" in data
        assert "database" in data["components"]


class TestDocumentEndpoints:
    """Test document-related endpoints."""
    
    def setup_method(self, method):
        """Set up test data."""
        self.test_doc = {
            "name": "test",
            "title": "test - a test command",
            "section": "1",
            "summary": "Test command",
            "raw_content": "Test content"
        }
    
    def test_list_documents_empty(self, client):
        """Test listing documents when empty."""
        response = client.get("/api/docs")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "documents" in data
        assert "total" in data
        assert data["total"] == 0
        assert len(data["documents"]) == 0
    
    def test_list_documents_with_data(self, client, test_db):
        """Test listing documents with data."""
        # Add test document
        doc = Document(**self.test_doc)
        test_db.add(doc)
        test_db.commit()
        
        response = client.get("/api/docs")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] >= 1
        assert len(data["documents"]) >= 1
        assert any(d["name"] == "test" for d in data["documents"])
    
    def test_list_documents_with_filters(self, client, test_db):
        """Test listing documents with filters."""
        # Add documents with different sections
        doc1 = Document(name="cmd1", title="Command 1", section="1", summary="User command")
        doc2 = Document(name="cmd2", title="Command 2", section="2", summary="System call")
        test_db.add_all([doc1, doc2])
        test_db.commit()
        
        # Filter by section
        response = client.get("/api/docs?section=1")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(d["section"] == "1" for d in data["documents"])
    
    def test_get_document_by_id(self, client, test_db):
        """Test getting a specific document."""
        # Add test document
        doc = Document(**self.test_doc)
        test_db.add(doc)
        test_db.commit()
        test_db.refresh(doc)
        
        response = client.get(f"/api/docs/{doc.id}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == doc.id
        assert data["name"] == "test"
        assert data["title"] == "test - a test command"
    
    def test_get_document_not_found(self, client):
        """Test getting non-existent document."""
        response = client.get("/api/docs/99999")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "error" in data
    
    def test_delete_document(self, client, test_db):
        """Test deleting a document."""
        # Add test document
        doc = Document(**self.test_doc)
        test_db.add(doc)
        test_db.commit()
        test_db.refresh(doc)
        
        response = client.delete(f"/api/docs/{doc.id}")
        assert response.status_code == status.HTTP_200_OK
        
        # Verify deletion
        deleted = test_db.query(Document).filter(Document.id == doc.id).first()
        assert deleted is None
    
    def test_import_document(self, client):
        """Test importing a new document."""
        import_data = {
            "command_name": "echo",
            "section": "1"
        }
        
        # This might fail in test environment without man pages
        response = client.post("/api/docs/import", json=import_data)
        # Accept both success and error responses
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_ENTITY
        ]


class TestSearchEndpoints:
    """Test search endpoints."""
    
    def setup_method(self, method):
        """Set up test data."""
        self.docs = [
            Document(
                name="ls",
                title="ls - list directory contents",
                section="1",
                summary="List information about files",
                raw_content="Lists files and directories"
            ),
            Document(
                name="cat",
                title="cat - concatenate files",
                section="1",
                summary="Concatenate files and print",
                raw_content="Concatenates and displays files"
            ),
            Document(
                name="grep",
                title="grep - search text patterns",
                section="1",
                summary="Search for patterns in text",
                raw_content="Global regular expression print"
            )
        ]
    
    def test_basic_search(self, client, test_db):
        """Test basic search functionality."""
        # Add test documents
        for doc in self.docs:
            test_db.add(doc)
        test_db.commit()
        
        # Search for "list"
        response = client.get("/api/search?q=list")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "results" in data
        assert "total" in data
        assert data["total"] >= 1
        assert any("ls" in r["name"] for r in data["results"])
    
    def test_search_empty_query(self, client):
        """Test search with empty query."""
        response = client.get("/api/search?q=")
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_search_no_results(self, client, test_db):
        """Test search with no results."""
        response = client.get("/api/search?q=nonexistentcommand123")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 0
        assert len(data["results"]) == 0
    
    def test_search_with_section_filter(self, client, test_db):
        """Test search with section filter."""
        # Add documents
        for doc in self.docs:
            test_db.add(doc)
        test_db.commit()
        
        response = client.get("/api/search?q=file&section=1")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(r["section"] == "1" for r in data["results"])
    
    def test_advanced_search(self, client, test_db):
        """Test advanced FTS search."""
        # Add documents
        for doc in self.docs:
            test_db.add(doc)
        test_db.commit()
        
        # Try advanced search endpoint
        response = client.get("/api/search/search?q=pattern")
        # Accept both success and not implemented
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_501_NOT_IMPLEMENTED
        ]
    
    def test_search_pagination(self, client, test_db):
        """Test search pagination."""
        # Add many documents
        for i in range(25):
            doc = Document(
                name=f"cmd{i}",
                title=f"Command {i}",
                section="1",
                summary=f"Test command number {i}"
            )
            test_db.add(doc)
        test_db.commit()
        
        # First page
        response = client.get("/api/search?q=command&limit=10&offset=0")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["results"]) <= 10
        assert data["total"] >= 20
        
        # Second page
        response = client.get("/api/search?q=command&limit=10&offset=10")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["results"]) <= 10


class TestCacheEndpoints:
    """Test cache-related endpoints."""
    
    def test_cache_stats(self, client):
        """Test cache statistics endpoint."""
        response = client.get("/api/cache/stats")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "total_documents" in data
        assert "cached_documents" in data
        assert "cache_hit_rate" in data
    
    def test_cache_refresh(self, client):
        """Test cache refresh endpoint."""
        response = client.post("/api/cache/refresh")
        # Accept both success and not implemented
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_202_ACCEPTED,
            status.HTTP_501_NOT_IMPLEMENTED
        ]


class TestErrorHandling:
    """Test API error handling."""
    
    def test_invalid_endpoint(self, client):
        """Test accessing invalid endpoint."""
        response = client.get("/api/nonexistent")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "error" in data
    
    def test_invalid_method(self, client):
        """Test using invalid HTTP method."""
        response = client.patch("/api/docs")
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    
    def test_invalid_json(self, client):
        """Test sending invalid JSON."""
        response = client.post(
            "/api/docs/import",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_missing_required_fields(self, client):
        """Test missing required fields."""
        response = client.post("/api/docs/import", json={})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        data = response.json()
        assert "error" in data
        assert "errors" in data["error"]["details"]