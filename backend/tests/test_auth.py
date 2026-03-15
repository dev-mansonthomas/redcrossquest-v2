"""Tests for authentication endpoints."""
import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_get_me_endpoint():
    """Test /api/me endpoint returns mock user data."""
    response = client.get("/api/me")
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "email" in data
    assert "role" in data
    assert "ul_id" in data
    # Verify mock data structure
    assert isinstance(data["id"], int)
    assert isinstance(data["email"], str)
    assert isinstance(data["role"], str)

