import httpx

from app.main import create_app


async def test_healthz_ok() -> None:
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"ok": True}
