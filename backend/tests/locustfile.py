"""
Load testing with Locust for BetterMan API
"""
from locust import HttpUser, task, between
import random
import string


class BetterManUser(HttpUser):
    """Simulates a user of the BetterMan application"""
    
    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks
    
    def on_start(self):
        """Called when a user starts"""
        # Register and login
        username = ''.join(random.choices(string.ascii_lowercase, k=10))
        password = "TestPass123!"
        
        # Register
        self.client.post("/api/auth/register", json={
            "username": username,
            "email": f"{username}@test.com",
            "password": password
        })
        
        # Login
        response = self.client.post("/api/auth/login", json={
            "username": username,
            "password": password
        })
        
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.headers = {}
    
    @task(10)
    def search_documents(self):
        """Search for documents - most common operation"""
        queries = ["ls", "grep", "find", "man", "git", "docker", "python", "node", "vim", "ssh"]
        query = random.choice(queries)
        
        with self.client.get(
            f"/api/search?q={query}",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                results = response.json()
                if not results.get("results"):
                    response.failure("No search results returned")
            else:
                response.failure(f"Search failed: {response.status_code}")
    
    @task(5)
    def instant_search(self):
        """Simulate instant search as user types"""
        base_queries = ["git", "docker", "python", "grep"]
        base = random.choice(base_queries)
        
        # Simulate typing
        for i in range(1, len(base) + 1):
            partial = base[:i]
            self.client.get(
                f"/api/search/instant?q={partial}",
                headers=self.headers,
                name="/api/search/instant?q=[query]"
            )
    
    @task(8)
    def view_document(self):
        """View a specific document"""
        commands = ["ls", "grep", "find", "awk", "sed", "git", "docker", "curl", "wget", "ssh"]
        command = random.choice(commands)
        
        with self.client.get(
            f"/api/documents/{command}",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 404:
                response.success()  # Document not found is acceptable
    
    @task(3)
    def fuzzy_search(self):
        """Test fuzzy search"""
        # Intentional typos
        typos = ["grpe", "dokcer", "pyton", "gti", "fnd"]
        query = random.choice(typos)
        
        self.client.get(
            f"/api/search/fuzzy?q={query}",
            headers=self.headers
        )
    
    @task(2)
    def list_documents(self):
        """List documents with pagination"""
        page = random.randint(1, 10)
        limit = random.choice([10, 20, 50])
        
        self.client.get(
            f"/api/documents?page={page}&limit={limit}",
            headers=self.headers
        )
    
    @task(2)
    def get_popular_documents(self):
        """Get popular documents"""
        self.client.get("/api/analytics/popular", headers=self.headers)
    
    @task(1)
    def advanced_search(self):
        """Perform advanced search"""
        self.client.post(
            "/api/search/advanced",
            headers=self.headers,
            json={
                "query": random.choice(["file", "process", "network"]),
                "sections": [1, 8],
                "sort_by": random.choice(["relevance", "name", "section"])
            }
        )
    
    @task(1)
    def user_profile(self):
        """Get user profile"""
        if self.headers:
            self.client.get("/api/user/profile", headers=self.headers)
    
    @task(1)
    def health_check(self):
        """Health check endpoint"""
        self.client.get("/api/health")


class AdminUser(HttpUser):
    """Simulates an admin user with different behavior"""
    
    wait_time = between(2, 5)
    
    def on_start(self):
        """Admin login"""
        # Assume admin user exists
        response = self.client.post("/api/auth/login", json={
            "username": "admin",
            "password": "AdminPass123!"
        })
        
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.headers = {}
    
    @task(5)
    def view_analytics(self):
        """View analytics dashboards"""
        endpoints = [
            "/api/analytics/popular",
            "/api/analytics/trends",
            "/api/analytics/users/active",
            "/api/analytics/performance"
        ]
        
        endpoint = random.choice(endpoints)
        self.client.get(endpoint, headers=self.headers)
    
    @task(3)
    def manage_documents(self):
        """Document management operations"""
        # Get document list
        self.client.get("/api/documents?limit=100", headers=self.headers)
    
    @task(2)
    def system_health(self):
        """Check system health"""
        self.client.get("/api/health/detailed", headers=self.headers)
    
    @task(1)
    def create_document(self):
        """Create a new document"""
        self.client.post(
            "/api/documents",
            headers=self.headers,
            json={
                "command": f"test{random.randint(1000, 9999)}",
                "section": 1,
                "description": "Test command",
                "content": "Test content " * 100
            }
        )


class MobileUser(HttpUser):
    """Simulates mobile app user with different patterns"""
    
    wait_time = between(2, 8)  # Mobile users interact less frequently
    
    def on_start(self):
        """Mobile user login"""
        self.client.headers["User-Agent"] = "BetterMan-Mobile/1.0"
        
        # Simple auth
        response = self.client.post("/api/auth/login", json={
            "username": "mobile_user",
            "password": "MobilePass123!"
        })
        
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "User-Agent": "BetterMan-Mobile/1.0"
            }
    
    @task(15)
    def quick_search(self):
        """Quick search - primary mobile use case"""
        # Shorter queries typical on mobile
        queries = ["ls", "cd", "cp", "mv", "rm", "ps", "top", "df", "du"]
        self.client.get(
            f"/api/search?q={random.choice(queries)}&limit=5",
            headers=self.headers
        )
    
    @task(10)
    def view_document_mobile(self):
        """View document optimized for mobile"""
        commands = ["ls", "cd", "grep", "find", "ps"]
        self.client.get(
            f"/api/documents/{random.choice(commands)}?format=mobile",
            headers=self.headers
        )
    
    @task(3)
    def get_favorites(self):
        """Get user's favorite documents"""
        self.client.get("/api/user/favorites", headers=self.headers)
    
    @task(1)
    def add_favorite(self):
        """Add document to favorites"""
        self.client.post(
            "/api/user/favorites",
            headers=self.headers,
            json={"document_id": random.randint(1, 100)}
        )


class WebSocketUser(HttpUser):
    """Tests WebSocket connections for terminal feature"""
    
    wait_time = between(5, 10)
    
    @task
    def create_terminal_session(self):
        """Create and interact with terminal session"""
        # Note: Locust doesn't natively support WebSockets
        # This simulates the HTTP endpoints around WebSocket usage
        
        # Create session
        response = self.client.post(
            "/api/terminal/session",
            json={"command": random.choice(["ls", "pwd", "echo hello"])}
        )
        
        if response.status_code == 200:
            session_id = response.json()["session_id"]
            
            # Simulate checking session status
            self.client.get(f"/api/terminal/session/{session_id}/status")
            
            # Simulate session activity
            import time
            time.sleep(random.uniform(2, 5))
            
            # Close session
            self.client.delete(f"/api/terminal/session/{session_id}")


# Stress test scenario mixing different user types
class StressTestUser(HttpUser):
    """Mixed behavior for stress testing"""
    
    tasks = {
        BetterManUser: 70,  # 70% regular users
        AdminUser: 5,       # 5% admin users
        MobileUser: 25      # 25% mobile users
    }
    
    wait_time = between(0.5, 2)  # More aggressive for stress testing