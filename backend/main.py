"""
GROOVE4U FastAPI Backend Application Entrypoint.

This module initializes the FastAPI service, configures CORS middleware for frontend origins,
registers feature routers (Users, Tracks, Playlists, Taste Profile, Recommendations), and defines health checks.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.routers import users, tracks, playlists, taste_profile, recommendations

# Initialize FastAPI Application Instance
app = FastAPI(
    title="Groove4U Backend API",
    description="FastAPI Backend service for GROOVE4U hybrid vector recommendation system.",
    version="1.0.0"
)

# Configure CORS Middleware allowing local and production origins dynamically
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.up\.railway\.app|http://localhost:.*|http://127\.0\.0\.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(users.router)
app.include_router(tracks.router)
app.include_router(playlists.router)
app.include_router(taste_profile.router)
app.include_router(recommendations.router)


@app.get("/health", tags=["Health Check"])
async def health_check() -> dict:
    """Service Health Check Endpoint for Railway / Cloud monitoring."""
    return {"status": "healthy", "service": "groove4u-backend"}


# Mount static production React bundle if static directory exists
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
else:
    @app.get("/", tags=["Health Check"])
    async def root_health_check() -> dict:
        return {
            "status": "online",
            "app": "Groove4U API",
            "database": "Supabase PostgreSQL",
            "auth": "Supabase Auth",
            "docs_url": "/docs"
        }


if __name__ == "__main__":
    import uvicorn
    # Launch uvicorn web server instance
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
