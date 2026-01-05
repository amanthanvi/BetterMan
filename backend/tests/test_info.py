import httpx

from app.main import create_app


async def test_info_shape() -> None:
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/info")
    assert res.status_code == 200
    data = res.json()
    assert set(data.keys()) == {"datasetReleaseId", "locale", "pageCount", "lastUpdated"}
