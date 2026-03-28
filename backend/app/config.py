"""
KINDpos Configuration

Central configuration management using environment variables.
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "KINDpos"
    app_version: str = "0.1.0"
    debug: bool = True

    # Terminal identification
    terminal_id: str = "terminal_01"

    # Database
    database_path: str = "./data/event_ledger.db"

    # Server
    host: str = "127.0.0.1"
    port: int = 8000

    # Tax rate — must be set via store config; defaults to 0 until configured
    tax_rate: float = 0.0

    # Hardware Discovery
    default_subnet: str = "10.0.0.0/24"
    scan_timeout: float = 2.0

    class Config:
        env_file = ".env"
        env_prefix = "KINDPOS_"


# Global settings instance
settings = Settings()
