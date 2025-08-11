#!/usr/bin/env python3
"""
Test script for the new man pages API endpoints.
Can be run against local or Railway deployment.
"""

import requests
import json
import sys
from typing import Dict, Any
from datetime import datetime

# Configuration
# For local testing: http://localhost:8000
# For Railway: Update with your Railway backend URL
BASE_URL = "http://localhost:8000"  # Update this with your Railway URL

# ANSI color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'


def test_endpoint(method: str, path: str, description: str, **kwargs) -> Dict[str, Any]:
    """Test a single endpoint and return the result."""
    url = f"{BASE_URL}{path}"
    print(f"\n{BLUE}Testing: {description}{RESET}")
    print(f"  URL: {method} {url}")
    
    try:
        response = requests.request(method, url, **kwargs)
        status = response.status_code
        
        if 200 <= status < 300:
            print(f"  {GREEN}✓ Status: {status}{RESET}")
            data = response.json() if response.text else {}
            
            # Print summary based on endpoint type
            if "results" in data:
                print(f"  Results: {len(data.get('results', []))} items")
                print(f"  Total: {data.get('total', 'N/A')}")
            elif "commands" in data:
                print(f"  Commands: {len(data.get('commands', []))} items")
            elif isinstance(data, list):
                print(f"  Items: {len(data)}")
                if data and "name" in data[0]:
                    names = [item.get("name", "N/A") for item in data[:3]]
                    print(f"  Sample: {', '.join(names)}...")
            elif "name" in data:
                print(f"  Command: {data.get('name')}({data.get('section', 'N/A')})")
                
            return {"success": True, "data": data, "status": status}
        else:
            print(f"  {RED}✗ Status: {status}{RESET}")
            print(f"  Error: {response.text[:200]}")
            return {"success": False, "status": status, "error": response.text}
            
    except requests.exceptions.ConnectionError:
        print(f"  {RED}✗ Connection failed{RESET}")
        print(f"  Make sure the server is running at {BASE_URL}")
        return {"success": False, "error": "Connection failed"}
    except Exception as e:
        print(f"  {RED}✗ Error: {e}{RESET}")
        return {"success": False, "error": str(e)}


def run_tests():
    """Run all API endpoint tests."""
    print(f"{YELLOW}{'='*60}{RESET}")
    print(f"{YELLOW}BetterMan API Test Suite{RESET}")
    print(f"{YELLOW}Testing against: {BASE_URL}{RESET}")
    print(f"{YELLOW}Time: {datetime.now().isoformat()}{RESET}")
    print(f"{YELLOW}{'='*60}{RESET}")
    
    results = []
    
    # Test health endpoint
    results.append(test_endpoint(
        "GET", "/api/man/health",
        "Man Pages Health Check"
    ))
    
    # Test search endpoint
    results.append(test_endpoint(
        "GET", "/api/man/search",
        "Search for 'CREATE' commands",
        params={"q": "CREATE", "limit": 5}
    ))
    
    # Test search with filters
    results.append(test_endpoint(
        "GET", "/api/man/search",
        "Search in text_processing category",
        params={"q": "text", "category": "text_processing", "limit": 5}
    ))
    
    # Test list commands
    results.append(test_endpoint(
        "GET", "/api/man/commands",
        "List all commands (paginated)",
        params={"limit": 10}
    ))
    
    # Test list common commands
    results.append(test_endpoint(
        "GET", "/api/man/commands",
        "List common commands only",
        params={"is_common": True, "limit": 10}
    ))
    
    # Test categories
    results.append(test_endpoint(
        "GET", "/api/man/categories",
        "Get all categories with statistics"
    ))
    
    # Test popular commands
    results.append(test_endpoint(
        "GET", "/api/man/popular",
        "Get weekly popular commands",
        params={"period": "weekly", "limit": 5}
    ))
    
    results.append(test_endpoint(
        "GET", "/api/man/popular",
        "Get all-time popular commands",
        params={"period": "all_time", "limit": 5}
    ))
    
    # Test specific command (if we know one exists)
    # First, let's get a command from the list to test with
    list_result = test_endpoint(
        "GET", "/api/man/commands",
        "Get a command to test with",
        params={"limit": 1}
    )
    
    if list_result["success"] and list_result["data"].get("commands"):
        cmd = list_result["data"]["commands"][0]
        name = cmd.get("name", "psql")
        section = cmd.get("section", "1")
        
        # Test get specific command
        results.append(test_endpoint(
            "GET", f"/api/man/commands/{name}/{section}",
            f"Get specific command: {name}({section})"
        ))
        
        # Test related commands
        results.append(test_endpoint(
            "GET", f"/api/man/related/{name}",
            f"Get commands related to {name}",
            params={"limit": 5}
        ))
    
    # Print summary
    print(f"\n{YELLOW}{'='*60}{RESET}")
    print(f"{YELLOW}Test Summary{RESET}")
    print(f"{YELLOW}{'='*60}{RESET}")
    
    total = len(results)
    passed = sum(1 for r in results if r.get("success"))
    failed = total - passed
    
    print(f"Total tests: {total}")
    print(f"{GREEN}Passed: {passed}{RESET}")
    if failed > 0:
        print(f"{RED}Failed: {failed}{RESET}")
    
    success_rate = (passed / total * 100) if total > 0 else 0
    color = GREEN if success_rate >= 80 else YELLOW if success_rate >= 50 else RED
    print(f"{color}Success rate: {success_rate:.1f}%{RESET}")
    
    return passed == total


if __name__ == "__main__":
    # Check if a URL was provided as argument
    if len(sys.argv) > 1:
        BASE_URL = sys.argv[1].rstrip('/')
        print(f"Using provided URL: {BASE_URL}")
    
    success = run_tests()
    sys.exit(0 if success else 1)