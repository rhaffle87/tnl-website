import logging
import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from lib.cache import close_public_cache  # noqa: E402
from lib.db import client, db, ensure_indexes  # noqa: E402
from lib.rate_limit import close_rate_limiter, get_rate_limiter  # noqa: E402
from lib.workflow_worker import run_workflow_worker  # noqa: E402
from redis.exceptions import RedisError  # noqa: E402
from routers import (  # noqa: E402
    apiv1, auth, content, figma, google_auth, labphotos, media, public, pubimport, registrar, seo, siteadmin,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Index creation is awaited so boot failures are visible, but each index is
    # individually guarded in ensure_indexes() so a stale spec never blocks boot.
    try:
        await ensure_indexes()
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).exception("Index initialisation failed; continuing startup")
    stop = asyncio.Event()
    worker = None
    if os.environ.get("WORKFLOW_WORKER_ENABLED", "1").lower() not in ("0", "false", "no"):
        worker = asyncio.create_task(run_workflow_worker(stop), name="tnl-workflows")
    try:
        yield
    finally:
        stop.set()
        try:
            if worker is not None:
                try:
                    await asyncio.wait_for(worker, timeout=20)
                except asyncio.TimeoutError:
                    worker.cancel()
                    await asyncio.gather(worker, return_exceptions=True)
                except asyncio.CancelledError:
                    if not worker.cancelled():
                        raise
                except Exception:
                    logging.getLogger(__name__).exception("Workflow worker stopped with an error")
        finally:
            try:
                await close_rate_limiter()
            finally:
                try:
                    await close_public_cache()
                finally:
                    client.close()


app = FastAPI(
    lifespan=lifespan,
    title="TNL Studio API",
    description="Public site + CMS API for the Telecommunication Network Laboratory, ITS Surabaya.",
)

api_router = APIRouter(prefix="/api")


@api_router.get("/openapi.json", include_in_schema=False)
async def openapi_schema():
    """Expose the generated schema through the same /api proxy as every API route."""
    return JSONResponse(app.openapi())


@api_router.get("/")
async def root():
    return {"service": "TNL Studio", "status": "ok"}


@api_router.get("/health")
async def health():
    try:
        await db.command("ping")
    except Exception:  # noqa: BLE001 — never leak driver/DSN details to an unauthenticated caller
        return JSONResponse(status_code=503, content={
            "status": "degraded", "database": "unavailable",
            "message": "The database is temporarily unavailable."})
    try:
        await get_rate_limiter().ping()
    except RedisError:
        return JSONResponse(status_code=503, content={
            "status": "degraded", "database": "connected", "rate_limiter": "unavailable",
            "message": "Request protection is temporarily unavailable."})
    return {"status": "ok", "database": "connected", "rate_limiter": "connected"}


# Public reads, contact inbox, registration engine, certificate verification.
api_router.include_router(public.router)
# Session auth (email+password) and staff user management.
api_router.include_router(auth.router)
# Direct Google OIDC (domain-allowlisted, invite-only; credentials required).
api_router.include_router(google_auth.router)
# Admin content CRUD across every content type + admin-defined Collections.
api_router.include_router(content.router)
# Page builder, settings, theme tokens, audit log, dashboard.
api_router.include_router(siteadmin.router)
# Figma to CMS sync (tokens, frames, private plugin).
api_router.include_router(figma.router)
# Registrar pipeline, contact inbox management, UU PDP tools.
api_router.include_router(registrar.router)
# Media library + local file serving.
api_router.include_router(media.router)

api_router.include_router(labphotos.router)

api_router.include_router(pubimport.router)
# Scoped public API v1 + OpenAPI docs + bulk importer.
api_router.include_router(apiv1.router)
# sitemap.xml, robots.txt, JSON-LD.
api_router.include_router(seo.router)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    return response


# Include the router in the main app — must stay the last registration.
app.include_router(api_router)


def _cors_origins() -> list[str]:
    """Explicit allow-list only. Unset means same-origin only (no CORS headers): the site and
    the API share one origin behind the reverse proxy, and the Vite dev server proxies /api.
    A wildcard is never honoured because cookies are sent (allow_credentials=True)."""
    origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    if "*" in origins:
        logging.getLogger(__name__).warning("CORS_ORIGINS contains '*'; ignoring it (credentials are enabled).")
        origins = [o for o in origins if o != "*"]
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
