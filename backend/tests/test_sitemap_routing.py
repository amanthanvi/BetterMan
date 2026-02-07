import httpx

from app.main import create_app


async def test_sitemaps_are_not_served_by_fastapi() -> None:
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/sitemap-debian-1.xml")
    assert res.status_code == 404
