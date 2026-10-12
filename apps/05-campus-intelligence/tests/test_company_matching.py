"""
Integration tests for Company Matching feature (Sprint 2).
Tests company seeding, match calculation, and student-company eligibility tiers.
"""
import pytest
from unittest.mock import patch, MagicMock

from services.company_matching_service import (
    ensure_companies_table_consistency,
    seed_default_companies,
    get_company_matches_for_student,
    calculate_company_match_score,
    get_all_companies,
)
from database import get_db_connection


@pytest.fixture(scope="function")
def setup_companies_db():
    """Ensure companies tables exist and seed default companies."""
    with get_db_connection() as conn:
        ensure_companies_table_consistency(conn)
        # Clear existing data
        with conn.cursor() as cur:
            cur.execute("DELETE FROM student_company_applications")
            cur.execute("DELETE FROM placement_companies")
        seed_default_companies(conn)
    yield
    # Cleanup
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM student_company_applications")
            cur.execute("DELETE FROM placement_companies")


def test_seed_default_companies(setup_companies_db):
    """Test that default companies are seeded correctly."""
    companies = get_all_companies()
    
    # Should have at least 10 companies
    assert len(companies) >= 10
    
    # Check for specific companies
    company_names = [c["name"] for c in companies]
    assert "TCS (Tata Consultancy Services)" in company_names
    assert "Infosys" in company_names
    assert "Wipro" in company_names
    assert "Microsoft" in company_names
    
    # Verify package info
    tcs = next(c for c in companies if "TCS" in c["name"])
    assert float(tcs["package"]) >= 3.0  # Should be 3.5 LPA


def test_seed_idempotent():
    """Test that seeding is idempotent (safe to call multiple times)."""
    with get_db_connection() as conn:
        ensure_companies_table_consistency(conn)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM placement_companies")
        
        # Seed twice
        seed_default_companies(conn)
        companies_after_first = get_all_companies()
        
        seed_default_companies(conn)
        companies_after_second = get_all_companies()
        
        # Should have same companies
        assert len(companies_after_first) == len(companies_after_second)


def test_calculate_match_score_perfect_match():
    """Test match score when student meets all requirements perfectly."""
    student_metrics = {
        "marks": 80,
        "attendance": 85,
        "mock_score": 85,
        "skills": ["Java", "Python", "SQL"],
    }
    
    company_req = {
        "min_marks_percentage": 80,
        "min_attendance": 85,
        "min_mock_score": 85,
        "required_skills": ["Java", "Python", "SQL"],
    }
    
    result = calculate_company_match_score(student_metrics, company_req)
    
    assert result["match_score"] == 100.0
    assert result["is_eligible"] is True
    assert len(result["gaps"]) == 0


def test_calculate_match_score_with_gaps():
    """Test match score when student has gaps."""
    student_metrics = {
        "marks": 60,
        "attendance": 70,
        "mock_score": 65,
        "skills": ["Java"],
    }
    
    company_req = {
        "min_marks_percentage": 70,
        "min_attendance": 80,
        "min_mock_score": 75,
        "required_skills": ["Java", "Python", "SQL"],
    }
    
    result = calculate_company_match_score(student_metrics, company_req)
    
    # Score should be between 0 and 100, but not 100
    assert 0 <= result["match_score"] <= 100
    assert result["match_score"] < 100
    
    # Should have gaps identified
    assert len(result["gaps"]) > 0
    
    # Check for marks gap
    marks_gap = next((g for g in result["gaps"] if g["type"] == "marks"), None)
    assert marks_gap is not None
    assert marks_gap["gap"] == 10.0  # 70 - 60


def test_calculate_match_score_partial_skills():
    """Test match score with partial skill match."""
    student_metrics = {
        "marks": 75,
        "attendance": 75,
        "mock_score": 75,
        "skills": ["Java", "SQL"],
    }
    
    company_req = {
        "min_marks_percentage": 70,
        "min_attendance": 75,
        "min_mock_score": 70,
        "required_skills": ["Java", "Python", "SQL"],
    }
    
    result = calculate_company_match_score(student_metrics, company_req)
    
    # Should still be eligible (75+ match score) despite missing Python
    assert result["match_score"] >= 75
    assert result["is_eligible"] is True


def test_match_score_weighting():
    """Test that match score uses correct weightings (marks 40%, attendance 30%, mock 20%, skills 10%)."""
    # Scenario: Only marks are perfect, rest are 0
    student_metrics = {
        "marks": 100,  # 100% of 100 = 100 points (40% weight)
        "attendance": 0,  # 0% of 80 = 0 points (30% weight)
        "mock_score": 0,  # 0% of 80 = 0 points (20% weight)
        "skills": [],  # 0% of skills = 0 points (10% weight)
    }
    
    company_req = {
        "min_marks_percentage": 100,
        "min_attendance": 80,
        "min_mock_score": 80,
        "required_skills": ["Java", "Python"],
    }
    
    result = calculate_company_match_score(student_metrics, company_req)
    
    # Expected: 100*0.4 + 0*0.3 + 0*0.2 + 0*0.1 = 40
    assert result["match_score"] == 40.0


def test_get_company_matches_categories():
    """Test that student companies are correctly categorized into tiers."""
    # Mock student readiness data
    with patch("services.company_matching_service.calculate_readiness") as mock_readiness:
        mock_readiness.return_value = {
            "marks": 95,
            "attendance": 90,
            "mock_score": 90,
        }
        
        with patch("services.skills_service.get_student_skills") as mock_skills:
            mock_skills.return_value = ["Python", "Java", "DSA", "System Design"]
            
            matches = get_company_matches_for_student(1)
    
    # Should have categorized results
    assert "eligible_now" in matches
    assert "eligible_with_improvement" in matches
    assert "stretch_targets" in matches
    
    # High-performing student should have some eligible_now
    assert len(matches["eligible_now"]) > 0
    
    # Verify structure of eligible_now items
    if matches["eligible_now"]:
        item = matches["eligible_now"][0]
        assert "name" in item
        assert "package" in item
        assert "sector" in item
        assert "match_score" in item
        assert 90 <= item["match_score"] <= 100


def test_get_company_matches_with_gaps():
    """Test that eligible_with_improvement items have gap descriptions."""
    with patch("services.company_matching_service.calculate_readiness") as mock_readiness:
        mock_readiness.return_value = {
            "marks": 65,
            "attendance": 75,
            "mock_score": 70,
        }
        
        with patch("services.skills_service.get_student_skills") as mock_skills:
            mock_skills.return_value = ["Java", "SQL"]
            
            matches = get_company_matches_for_student(2)
    
    # Should have some items with improvements needed
    for item in matches.get("eligible_with_improvement", []):
        assert "gap" in item
        assert item["gap"]  # Gap message should not be empty
    
    for item in matches.get("stretch_targets", []):
        assert "gap" in item


def test_get_company_matches_low_performer():
    """Test categorization for a low-performing student."""
    with patch("services.company_matching_service.calculate_readiness") as mock_readiness:
        mock_readiness.return_value = {
            "marks": 40,
            "attendance": 60,
            "mock_score": 50,
        }
        
        with patch("services.skills_service.get_student_skills") as mock_skills:
            mock_skills.return_value = []
            
            matches = get_company_matches_for_student(3)
    
    # Low performer should not have eligible_now (90%+ match)
    assert len(matches.get("eligible_now", [])) == 0
    
    # Should mostly be in stretch_targets
    assert len(matches.get("stretch_targets", [])) > 0


def test_company_package_sorting():
    """Test that companies are sorted by package (highest LPA first)."""
    companies = get_all_companies()
    
    packages = [float(c["package"]) for c in companies]
    
    # Should be sorted in descending order
    assert packages == sorted(packages, reverse=True)


def test_get_all_companies_structure():
    """Test that get_all_companies returns properly structured data."""
    companies = get_all_companies()
    
    assert len(companies) > 0
    
    for company in companies[:3]:  # Check first 3
        assert "id" in company
        assert "name" in company
        assert "package" in company
        assert "sector" in company
        assert "min_marks" in company
        assert "required_skills" in company
        
        # Verify data types
        assert isinstance(company["id"], int)
        assert isinstance(company["name"], str)
        assert company["name"]  # Not empty
        assert isinstance(company["required_skills"], list)


def test_company_matching_integration():
    """
    End-to-end test: seed companies, get student metrics, calculate matches.
    """
    with patch("services.company_matching_service.calculate_readiness") as mock_readiness:
        mock_readiness.return_value = {
            "marks": 80,
            "attendance": 85,
            "mock_score": 80,
        }
        
        with patch("services.skills_service.get_student_skills") as mock_skills:
            mock_skills.return_value = ["Python", "Java", "DSA"]
            
            with get_db_connection() as conn:
                ensure_companies_table_consistency(conn)
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM placement_companies")
                seed_default_companies(conn)
            
            matches = get_company_matches_for_student(1)
    
    # Summary verification
    total_matches = (
        len(matches["eligible_now"]) +
        len(matches["eligible_with_improvement"]) +
        len(matches["stretch_targets"])
    )
    
    assert total_matches >= 10  # All seeded companies should appear
    
    # Score distribution check
    all_items = (
        matches["eligible_now"] +
        matches["eligible_with_improvement"] +
        matches["stretch_targets"]
    )
    
    for item in all_items:
        assert 0 <= item["match_score"] <= 100
