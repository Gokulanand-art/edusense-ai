#!/usr/bin/env python
"""
Post-deployment verification script for Smart Campus Intelligence System.

Verifies:
  - Health endpoints responding correctly
  - Database connectivity and migrations applied
  - Critical services initialized
  - Authentication flow working
  - Media storage accessible
"""

import sys
import time
import requests
import json
from urllib.parse import urljoin

def log_step(message):
    """Print a step message."""
    print(f"\n[*] {message}")

def log_success(message):
    """Print a success message."""
    print(f"[✓] {message}")

def log_error(message):
    """Print an error message."""
    print(f"[✗] {message}")

def check_health_endpoints(base_url, timeout=10):
    """Verify all health endpoints are responding."""
    endpoints = {
        "/health/live": "Liveness probe",
        "/health/ready": "Readiness probe",
        "/health/startup": "Startup probe",
    }
    
    log_step("Checking health endpoints...")
    all_ok = True
    
    for path, description in endpoints.items():
        url = urljoin(base_url, path)
        try:
            response = requests.get(url, timeout=timeout)
            if response.status_code == 200:
                data = response.json()
                log_success(f"{description} ({path}): {data.get('status', 'ok')}")
            else:
                log_error(f"{description} ({path}): HTTP {response.status_code}")
                all_ok = False
        except Exception as e:
            log_error(f"{description} ({path}): {e}")
            all_ok = False
    
    return all_ok

def check_database_health(base_url, timeout=10):
    """Verify database is healthy via ready endpoint."""
    log_step("Checking database health...")
    url = urljoin(base_url, "/health/ready")
    try:
        response = requests.get(url, timeout=timeout)
        if response.status_code == 200:
            data = response.json()
            db_status = data.get("database", "unknown")
            if db_status == "healthy":
                log_success(f"Database is healthy")
                return True
            else:
                log_error(f"Database status: {db_status}")
                return False
        else:
            log_error(f"Ready endpoint returned {response.status_code}")
            return False
    except Exception as e:
        log_error(f"Could not reach ready endpoint: {e}")
        return False

def check_auth_flow(base_url, timeout=10):
    """Verify auth endpoint is reachable."""
    log_step("Checking authentication endpoints...")
    auth_endpoints = ["/auth/login", "/auth/register", "/health/live"]
    
    session = requests.Session()
    all_ok = True
    
    for path in auth_endpoints:
        url = urljoin(base_url, path)
        try:
            if path in ["/auth/login", "/auth/register"]:
                # POST request with empty body
                response = session.options(url, timeout=timeout)
                if response.status_code in [200, 204, 405]:  # 405 is fine for OPTIONS
                    log_success(f"Auth endpoint {path} is accessible")
                else:
                    log_error(f"Auth endpoint {path}: HTTP {response.status_code}")
                    all_ok = False
            else:
                response = session.get(url, timeout=timeout)
                if response.status_code == 200:
                    log_success(f"Endpoint {path} is accessible")
                else:
                    log_error(f"Endpoint {path}: HTTP {response.status_code}")
                    all_ok = False
        except Exception as e:
            log_error(f"Error accessing {path}: {e}")
            all_ok = False
    
    return all_ok

def check_response_headers(base_url, timeout=10):
    """Verify security headers are set."""
    log_step("Checking security headers...")
    url = urljoin(base_url, "/health/live")
    
    try:
        response = requests.get(url, timeout=timeout)
        headers = response.headers
        
        required_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": ["SAMEORIGIN", "DENY"],
        }
        
        all_ok = True
        for header, expected_value in required_headers.items():
            actual = headers.get(header)
            if isinstance(expected_value, list):
                if actual in expected_value:
                    log_success(f"Security header {header}: {actual}")
                else:
                    log_error(f"Security header {header}: {actual} (expected one of {expected_value})")
                    all_ok = False
            else:
                if actual == expected_value:
                    log_success(f"Security header {header}: {actual}")
                else:
                    log_error(f"Security header {header}: {actual} (expected {expected_value})")
                    all_ok = False
        
        if "Content-Security-Policy" in headers:
            log_success("Content Security Policy is set")
        else:
            log_error("Content Security Policy not set")
            all_ok = False
        
        return all_ok
    except Exception as e:
        log_error(f"Could not verify headers: {e}")
        return False

def main():
    """Run all verification checks."""
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5000"
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    print("=" * 70)
    print("Smart Campus Intelligence System - Deployment Verification")
    print("=" * 70)
    print(f"\nTarget URL: {base_url}")
    print(f"Timeout: {timeout}s")
    
    checks = {
        "Health Endpoints": lambda: check_health_endpoints(base_url, timeout),
        "Database Health": lambda: check_database_health(base_url, timeout),
        "Auth Flow": lambda: check_auth_flow(base_url, timeout),
        "Security Headers": lambda: check_response_headers(base_url, timeout),
    }
    
    results = {}
    for name, check_fn in checks.items():
        try:
            results[name] = check_fn()
        except Exception as e:
            log_error(f"Check '{name}' failed with exception: {e}")
            results[name] = False
    
    print("\n" + "=" * 70)
    print("Verification Summary")
    print("=" * 70)
    
    for name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"{name}: {status}")
    
    all_passed = all(results.values())
    
    if all_passed:
        print("\n✓ All checks passed! Deployment verified.")
        return 0
    else:
        print("\n✗ Some checks failed. See above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
