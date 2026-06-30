"""
FastAPI application — PORTA VOZ.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from src.core.config import settings
from src.core.database import init_db
from src.core.logging_config import get_logger
from src.scheduler.job_manager import job_manager
from src.api.routes import stations, programs, keywords, alerts, sessions, reports, organizations, subscriptions
from src.api.routes import dashboard

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.setup_directories()
    await init_db()
    job_manager.start()
    await job_manager.load_programs()
    logger.info("app.started", version=settings.APP_VERSION)
    yield
    # Shutdown
    job_manager.stop()
    logger.info("app.stopped")


app = FastAPI(
    title="PORTA VOZ",
    description="Sistema de monitoramento de rádio para comunicação pública municipal",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(organizations.router, prefix="/api/v1")
app.include_router(stations.router, prefix="/api/v1")
app.include_router(programs.router, prefix="/api/v1")
app.include_router(keywords.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(subscriptions.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")


@app.get("/dashboard", include_in_schema=False)
async def serve_dashboard():
    return FileResponse("src/api/static/dashboard.html")


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/health", tags=["Health"])
async def health():
    active = await job_manager.get_active_sessions()
    return {
        "status": "healthy",
        "active_monitoring_jobs": len(active),
    }
