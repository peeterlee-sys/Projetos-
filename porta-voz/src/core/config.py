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
    DEDUP_WINDOW_MINUTES: int = 60
    DEDUP_SIMILARITY_THRESHOLD: float = 0.72  # similaridade de tema/resumo para considerar duplicata
    STREAM_RECONNECT_DELAY_SECONDS: int = 10
    MAX_RECONNECT_ATTEMPTS: int = 10
    MIN_CLIP_CONTEXT_SECONDS: int = 30  # segundos de contexto antes/depois do trecho relevante

    # Roteamento por cidade
    MIN_CITY_CONFIDENCE: float = 0.75      # abaixo disso o alerta vai para revisão interna, não é enviado
    ANALYSIS_CONTEXT_CHUNKS: int = 3       # nº de chunks (atual + anteriores) usados como contexto na análise

    # Áudio / clips
    CLIP_PRE_CONTEXT_CHUNKS: int = 2       # chunks antes da menção incluídos no clip
    CLIP_POST_CONTEXT_CHUNKS: int = 2      # chunks depois da menção incluídos no clip
    MAX_AUDIO_MB: float = 15.0             # limite prático do WhatsApp (16MB) com margem
    PUBLIC_BASE_URL: str = ""              # ex: https://radar.exemplo.com — habilita link de áudio completo

    # Redução de custo
    SKIP_SILENT_CHUNKS: bool = True        # não transcreve chunks de silêncio
    SILENCE_MEAN_DB_THRESHOLD: float = -45.0  # mean_volume abaixo disso = silêncio

    # Avisos operacionais (falhas de captura) — telefones separados por vírgula
    OPERATIONS_RECIPIENTS: str = ""

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
    def operations_recipients_list(self) -> List[str]:
        return [r.strip() for r in self.OPERATIONS_RECIPIENTS.split(",") if r.strip()]

    @property
    def zapi_send_audio_url(self) -> str:
        return (
            f"{self.ZAPI_BASE_URL}/instances/{self.ZAPI_INSTANCE_ID}"
            f"/token/{self.ZAPI_TOKEN}/send-audio"
        )

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
