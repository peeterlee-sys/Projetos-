from pydantic_settings import BaseSettings
from pathlib import Path
from typing import List, Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "RADAR PÚBLICO"
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
    # Haiku 4.5 ($1/$5 por milhão) dá conta da classificação por ~1/3 do custo
    # do Sonnet 4.6. Para voltar ao Sonnet, defina CLAUDE_MODEL no .env.
    CLAUDE_MODEL: str = "claude-haiku-4-5"

    # YouTube (captura de rádios via YouTube Live)
    YOUTUBE_COOKIES_FILE: str = ""

    # Z-API
    ZAPI_INSTANCE_ID: str = ""
    ZAPI_TOKEN: str = ""
    ZAPI_CLIENT_TOKEN: str = ""
    ZAPI_BASE_URL: str = "https://api.z-api.io"

    # Alertas
    DEFAULT_ALERT_RECIPIENTS: str = ""

    # Monitoramento
    CHUNK_DURATION_SECONDS: int = 30
    # Janela de contexto da ANÁLISE: quantos blocos consecutivos (incl. o atual)
    # são enviados juntos ao Claude. Evita subestimar a urgência de um assunto
    # que foi cortado entre blocos de 30s (ex.: denúncia que "começa" num bloco e
    # revela a gravidade no seguinte). 3 blocos ≈ 90s de contexto.
    CHUNK_CONTEXT_WINDOW: int = 3
    DEDUP_WINDOW_MINUTES: int = 60
    # Agregação de alertas por assunto: junta blocos consecutivos do mesmo
    # assunto num único alerta com o áudio completo.
    ALERT_AGG_QUIET_SECONDS: int = 75      # tempo sem novas menções antes de enviar
    ALERT_AGG_MAX_WINDOW_SECONDS: int = 300  # janela máxima de agregação por assunto
    STREAM_RECONNECT_DELAY_SECONDS: int = 10
    MAX_RECONNECT_ATTEMPTS: int = 10
    MIN_CLIP_CONTEXT_SECONDS: int = 30  # segundos de contexto antes/depois do trecho relevante

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_SECRET_KEY: str = "dev-secret-change-in-production"
    DASHBOARD_URL: str = ""  # ex: http://147.182.211.211:8000/dashboard

    # Paths
    AUDIO_CHUNKS_DIR: Path = Path("audio_chunks")
    CLIPS_DIR: Path = Path("clips")
    LOGS_DIR: Path = Path("logs")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

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
