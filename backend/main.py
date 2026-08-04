"""
GROOVE4U FastAPI Backend Application Entrypoint.

This module initializes the FastAPI service, configures CORS middleware for frontend origins,
registers feature routers (Users, Tracks, Playlists, Taste Profile, Recommendations), and defines health checks.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import users, tracks, playlists, taste_profile, recommendations

# Initialize FastAPI Application Instance
app = FastAPI(
    title="Groove4U Backend API",
    description="FastAPI Backend service for GROOVE4U hybrid vector recommendation system.",
    version="1.0.0"
)

# Configure CORS Middleware allowing local and production origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Register API Routers
app.include_router(users.router)
app.include_router(tracks.router)
app.include_router(playlists.router)
app.include_router(taste_profile.router)
app.include_router(recommendations.router)


@app.get("/", tags=["Health Check"])
async def root_health_check() -> dict:
    """
    Root Health Check Endpoint.

    Returns:
        dict: Status payload confirming backend service health and API documentation link.
    """
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
