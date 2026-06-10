import warnings
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Claves conocidas/débiles que jamás deben usarse para firmar tokens.
_WEAK_SECRETS = {"change-me", "secret", "changeme"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://agro:agro_dev_pass@db:5432/agro_hub"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 480
    environment: str = "development"
    default_user_password: str = "agro1234"

    algorithm: str = "HS256"
    project_name: str = "AgroGestión API"

    # Throttle de login (anti fuerza bruta)
    login_max_attempts: int = 5
    login_lockout_seconds: int = 300

    @model_validator(mode="after")
    def _check_secret(self) -> "Settings":
        weak = (
            self.secret_key.lower().startswith("change-me")
            or self.secret_key.lower() in _WEAK_SECRETS
            or len(self.secret_key) < 32
        )
        if weak:
            if self.environment == "development":
                warnings.warn(
                    "SECRET_KEY débil o por defecto: generá una con `openssl rand -hex 32` "
                    "y ponela en .env (solo se tolera en development).",
                    stacklevel=2,
                )
            else:
                raise ValueError(
                    "SECRET_KEY débil o por defecto: el servidor no puede arrancar así "
                    f"en entorno '{self.environment}'. Generá una con `openssl rand -hex 32`."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
