from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://agro:agro_dev_pass@db:5432/agro_hub"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 480
    environment: str = "development"
    default_user_password: str = "agro1234"

    algorithm: str = "HS256"
    project_name: str = "AgroGestión API"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
