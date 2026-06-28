from pydantic_settings import BaseSettings
from pathlib import Path
from typing import List, Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "PORTA VOZ"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./porta_voz.db"

    # OpenAI
    OPENAI_API_KEY: str = ""
    WHISPER_MODEL: str = "whisper-1"
    WHISPER_LANGUAGE: str = "pt"
    WHISPER_PROMPT: str = (
        "Prefeitura de Itapema, secretaria municipal, prefeito Alexandre Xepa, "
        "Eurico Osmari, vereador, câmara municipal, obra pública, saúde, educação, "
        "trânsito, mobilidade urbana, licitação, denúncia, reclamação, buraco, "
        "saneamento, segurança pública, guarda municipal"
    )

    # Anthropic
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    # Z-API
    ZAPI_INSTANCE_ID: str = ""
    ZAPI_TOKEN: str = ""
    ZAPI_CLIENT_TOKEN: str = ""
    ZAPI_BASE_URL: str = "https://api.z-api.io"

    # Alertas
    DEFAULT_ALERT_RECIPIENTS: str = ""

    # Monitoramento
    CHUNK_DURATION_SECONDS: int = 30
    DEDUP_WINDOW_MINUTES: int = 15
    STREAM_RECONNECT_DELAY_SECONDS: int = 10
    MAX_RECONNECT_ATTEMPTS: int = 10
    MIN_CLIP_CONTEXT_SECONDS: int = 30  # segundos de contexto antes/depois do trecho relevante

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_SECRET_KEY: str = "dev-secret-change-in-production"

    # Paths
    AUDIO_CHUNKS_DIR: Path = Path("audio_chunks")
    CLIPS_DIR: Path = Path("clips")
    LOGS_DIR: Path = Path("logs")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def alert_recipients_list(self) -> List[str]:
        return [r.strip() for r in self.DEFAULT_ALERT_RECIPIENTS.split(",") if r.strip()]

    @property
    def zapi_send_text_url(self) -> str:
        return (
            f"{self.ZAPI_BASE_URL}/instances/{self.ZAPI_INSTANCE_ID}"
            f"/token/{self.ZAPI_TOKEN}/send-text"
        )

    def setup_directories(self) -> None:
        for path in [self.AUDIO_CHUNKS_DIR, self.CLIPS_DIR, self.LOGS_DIR]:
            path.mkdir(parents=True, exist_ok=True)


settings = Settings()
