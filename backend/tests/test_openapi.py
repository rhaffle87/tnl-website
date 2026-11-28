"""Generated API contracts stay available behind the production /api reverse proxy."""

from fastapi.openapi.models import OpenAPI


async def test_generated_schema_matches_the_app_and_models(async_client):
    response = await async_client.get("/openapi.json")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    schema = response.json()
    OpenAPI.model_validate(schema)
    assert schema["openapi"].startswith("3.1.")
    assert schema["info"]["title"] == "TNL Studio API"
    assert "/api/auth/login" in schema["paths"]
    assert "/api/contact" in schema["paths"]
    assert "/api/v1/{resource}" in schema["paths"]
    assert "/api/openapi.json" not in schema["paths"]
    login = schema["paths"]["/api/auth/login"]["post"]
    assert login["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/LoginIn"
    }
    assert "email" in schema["components"]["schemas"]["LoginIn"]["properties"]
    operation_ids = [
        operation["operationId"]
        for path in schema["paths"].values()
        for method, operation in path.items()
        if method in {"get", "post", "put", "patch", "delete", "head", "options"}
    ]
    assert len(operation_ids) == len(set(operation_ids))
    original = await async_client.get("http://test/openapi.json")
    assert original.json() == schema
    for path in ("/robots.txt", "/sitemap.xml"):
        head = await async_client.head(path)
        assert head.status_code == 200
        assert not head.content


async def test_v1_contract_stays_available_for_key_clients(async_client):
    response = await async_client.get("/v1-docs/openapi")
    assert response.status_code == 200
    schema = response.json()
    OpenAPI.model_validate(schema)
    assert schema["servers"] == [{"url": "/api"}]
    assert schema["components"]["securitySchemes"]["ApiKeyAuth"] == {
        "type": "apiKey", "in": "header", "name": "X-API-Key"
    }
    assert schema["security"] == [{"ApiKeyAuth": []}]
    assert schema["paths"]["/v1/{resource}/import"]["post"]["requestBody"]["content"][
        "application/json"
    ]["schema"]["properties"]["items"]["maxItems"] == 200
