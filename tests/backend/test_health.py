"""Pruebas rápidas que no dependen de un catálogo sísmico ni de Docker."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_api_health() -> None:
    """El endpoint base debe responder con una estructura fija."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "sismo-api"


def test_openapi_available() -> None:
    """La documentación OpenAPI forma parte de la base técnica."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/v1/health" in response.json()["paths"]


def test_cors_rejects_unknown_origin() -> None:
    """Los orígenes desconocidos no obtienen una cabecera de permiso CORS."""
    response = client.get("/api/v1/health", headers={"Origin": "https://no-permitido.example"})
    assert "access-control-allow-origin" not in response.headers
