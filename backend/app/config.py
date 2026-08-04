"""
Application Environment Configuration Settings Module.

Manages environment variable parsing using Pydantic Settings for Supabase credentials,
Qdrant vector cluster settings, external API keys, and CORS server configuration.
"""

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central Application Settings class mapped to environment variables (.env).
    """

    # Supabase Configuration
    SUPABASE_URL: str = "https://your-supabase-project.supabase.co"
    SUPABASE_PUBLIC_KEY: str = "your_supabase_public_key_here"
    SUPABASE_SECRET_KEY: str = "your_supabase_secret_key_here"

    # Qdrant Vector DB Configuration
    QDRANT_URL: str = "https://your-qdrant-cluster-url:6333"
    QDRANT_API_KEY: str = "your_qdrant_api_key_here"

    # External API Configuration
    LASTFM_API_KEY: str = "your_lastfm_api_key_here"
    DISCOGS_USER_TOKEN: str = "your_discogs_user_token_here"
    GROQ_API_KEY: str = "your_groq_api_key_here"

    # Server Host & CORS Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        """
        Parses comma-separated CORS_ORIGINS string into a clean list of allowed origins.
        """
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


# Instantiate Global Settings Singleton
settings = Settings()
