from sqlalchemy import (
    Column, String, Integer, Boolean, Float, DateTime, ForeignKey,
    JSON, Text, Enum as SAEnum, Index
)
from sqlalchemy.orm import relationship, DeclarativeBase
from datetime import datetime
import enum
import uuid


def gen_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


# ─── Enums ────────────────────────────────────────────────────────────────────

class DayOfWeek(str, enum.Enum):
    monday = "monday"
    tuesday = "tuesday"
    wednesday = "wednesday"
    thursday = "thursday"
    friday = "friday"
    saturday = "saturday"
    sunday = "sunday"


class Sentiment(str, enum.Enum):
    positive = "positive"
    negative = "negative"
    neutral = "neutral"


class Urgency(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class ContentType(str, enum.Enum):
    complaint = "complaint"          # Reclamação
    denouncement = "denouncement"    # Denúncia
    praise = "praise"                # Elogio
    interview = "interview"          # Entrevista
    criticism = "criticism"          # Crítica
    institutional = "institutional"  # Informação institucional
    political = "political"          # Pauta política
    other = "other"                  # Outro


class SessionStatus(str, enum.Enum):
    scheduled = "scheduled"
    running = "running"
    completed = "completed"
    failed = "failed"
    interrupted = "interrupted"


class AlertStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"
    suppressed = "suppressed"      # Deduplicado
    needs_review = "needs_review"  # Baixa confiança — retido para revisão interna
    blocked = "blocked"            # Bloqueado pelo roteamento por cidade


class CaptureEventType(str, enum.Enum):
    capture_started = "capture_started"
    capture_success = "capture_success"
    capture_failed = "capture_failed"
    reconnect = "reconnect"
    resolve_failed = "resolve_failed"


# ─── Models ───────────────────────────────────────────────────────────────────

class Organization(Base):
    """Multi-tenant: cada prefeitura/cliente é uma organização."""
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    city = Column(String(100))
    state = Column(String(2))
    plan = Column(String(50), default="mvp")
    is_active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)  # configurações extras por org
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    radio_stations = relationship("RadioStation", back_populates="organization")
    keywords = relationship("Keyword", back_populates="organization")
    alert_recipients = relationship("AlertRecipient", back_populates="organization")
    subscriptions = relationship("StationSubscription", back_populates="organization")


class AlertRecipient(Base):
    """Destinatários de alertas WhatsApp por organização."""
    __tablename__ = "alert_recipients"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(100))
    phone = Column(String(20), nullable=False)  # 5547999999999
    is_active = Column(Boolean, default=True)
    urgency_filter = Column(String(20), default="low")  # mínima urgência para receber
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="alert_recipients")


class RadioStation(Base):
    """Rádio cadastrada para monitoramento."""
    __tablename__ = "radio_stations"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    city = Column(String(100))
    state = Column(String(2))
    website = Column(String(500))
    stream_url = Column(String(1000))       # URL do stream MP3/HLS
    youtube_url = Column(String(1000))      # URL do YouTube Live (alternativa)
    stream_type = Column(String(20), default="stream")  # stream | youtube
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization", back_populates="radio_stations")
    programs = relationship("Program", back_populates="station")
    subscriptions = relationship("StationSubscription", back_populates="station")


class Program(Base):
    """Programa de rádio com horário de monitoramento."""
    __tablename__ = "programs"

    id = Column(String, primary_key=True, default=gen_uuid)
    station_id = Column(String, ForeignKey("radio_stations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    days_of_week = Column(JSON, nullable=False)  # ["monday","tuesday",...]
    start_time = Column(String(5), nullable=False)   # "07:00"
    end_time = Column(String(5), nullable=False)     # "09:00"
    timezone = Column(String(50), default="America/Sao_Paulo")
    is_active = Column(Boolean, default=True)
    alert_recipients = Column(JSON, default=list)  # lista de phones específicos para este programa
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    station = relationship("RadioStation", back_populates="programs")
    sessions = relationship("MonitoringSession", back_populates="program")
    keywords = relationship("Keyword", back_populates="program")


class Keyword(Base):
    """Palavras-chave para monitoramento. Pode ser global (org), por rádio ou por programa."""
    __tablename__ = "keywords"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    program_id = Column(String, ForeignKey("programs.id"), nullable=True)  # None = global
    term = Column(String(200), nullable=False)
    category = Column(String(100))   # saúde, obras, educação, segurança, etc.
    weight = Column(Integer, default=1)  # 1=normal, 2=importante, 3=crítico
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="keywords")
    program = relationship("Program", back_populates="keywords")

    __table_args__ = (Index("ix_keywords_org_active", "org_id", "is_active"),)


class MonitoringSession(Base):
    """Sessão de monitoramento — uma execução de um programa."""
    __tablename__ = "monitoring_sessions"

    id = Column(String, primary_key=True, default=gen_uuid)
    program_id = Column(String, ForeignKey("programs.id"), nullable=False)
    status = Column(SAEnum(SessionStatus), default=SessionStatus.scheduled)
    started_at = Column(DateTime)
    ended_at = Column(DateTime)
    total_chunks = Column(Integer, default=0)
    relevant_chunks = Column(Integer, default=0)
    total_alerts_sent = Column(Integer, default=0)
    reconnect_count = Column(Integer, default=0)
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    program = relationship("Program", back_populates="sessions")
    transcriptions = relationship("Transcription", back_populates="session")
    alerts = relationship("Alert", back_populates="session")
    report = relationship("Report", back_populates="session", uselist=False)


class Transcription(Base):
    """Transcrição de um chunk de áudio."""
    __tablename__ = "transcriptions"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("monitoring_sessions.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    chunk_started_at = Column(DateTime, nullable=False)
    duration_seconds = Column(Integer, default=30)
    raw_text = Column(Text)
    has_keywords = Column(Boolean, default=False)
    matched_keywords = Column(JSON, default=list)
    audio_file_path = Column(String(500))   # path do chunk WAV (temp)
    clip_file_path = Column(String(500))    # path do clip MP3 salvo (quando relevante)
    whisper_duration_ms = Column(Integer)   # tempo de processamento
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("MonitoringSession", back_populates="transcriptions")
    analysis = relationship("Analysis", back_populates="transcription", uselist=False)

    __table_args__ = (Index("ix_transcriptions_session", "session_id", "chunk_index"),)


class Analysis(Base):
    """Análise contextual do Claude para um trecho transcrito."""
    __tablename__ = "analyses"

    id = Column(String, primary_key=True, default=gen_uuid)
    transcription_id = Column(String, ForeignKey("transcriptions.id"), nullable=False)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=True)
    is_relevant = Column(Boolean, nullable=False)
    theme = Column(String(200))
    sentiment = Column(SAEnum(Sentiment))
    urgency = Column(SAEnum(Urgency))
    content_type = Column(SAEnum(ContentType))
    confidence_score = Column(Float)          # 0.0 - 1.0
    summary = Column(Text)
    excerpt = Column(Text)                    # trecho exato relevante
    reason = Column(Text)                     # por que é relevante / risco/oportunidade
    suggested_action = Column(Text)
    raw_response = Column(JSON)               # resposta bruta do Claude
    claude_duration_ms = Column(Integer)

    # Classificação por cidade (roteamento)
    primary_city = Column(String(100))        # cidade principal do assunto
    mentioned_cities = Column(JSON, default=list)   # todas as cidades citadas
    affected_cities = Column(JSON, default=list)    # cidades direta e justificadamente afetadas
    related_department = Column(String(200))  # órgão/secretaria relacionada
    city_confidence = Column(Float)           # 0.0 - 1.0
    city_reasoning = Column(Text)             # justificativa curta da classificação

    # Custos
    input_tokens = Column(Integer)
    output_tokens = Column(Integer)
    estimated_cost_usd = Column(Float)

    created_at = Column(DateTime, default=datetime.utcnow)

    transcription = relationship("Transcription", back_populates="analysis")
    alert = relationship("Alert", back_populates="analysis", uselist=False)

    __table_args__ = (
        Index("ix_analyses_transcription_org", "transcription_id", "org_id", unique=True),
    )


class Alert(Base):
    """Alerta disparado via WhatsApp."""
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("monitoring_sessions.id"), nullable=False)
    analysis_id = Column(String, ForeignKey("analyses.id"), nullable=True)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=True)
    status = Column(SAEnum(AlertStatus), default=AlertStatus.pending)
    recipients = Column(JSON, default=list)   # lista de phones que receberam
    message_text = Column(Text)
    dedup_hash = Column(String(64))           # hash para deduplicação
    sent_at = Column(DateTime)
    error_message = Column(Text)

    # Rastreabilidade de roteamento por cidade
    contracted_city = Column(String(100))     # cidade do cliente que receberia o alerta
    detected_city = Column(String(100))       # cidade detectada pela análise
    routing_decision = Column(String(20))     # send | review | block
    routing_reason = Column(Text)             # por que foi enviado ou bloqueado

    # Áudio vinculado
    clip_file_path = Column(String(500))      # arquivo de áudio completo do trecho
    audio_status = Column(String(50))         # sent | sent_partial | link_only | failed | none
    audio_url = Column(String(1000))          # link público do áudio, quando disponível

    # Custo estimado do alerta (transcrição + análise + envio)
    estimated_cost_usd = Column(Float)

    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("MonitoringSession", back_populates="alerts")
    analysis = relationship("Analysis", back_populates="alert")

    __table_args__ = (Index("ix_alerts_session_dedup", "session_id", "dedup_hash"),)


class StationSubscription(Base):
    """Permite que múltiplos clientes monitorem a mesma rádio simultaneamente."""
    __tablename__ = "station_subscriptions"

    id = Column(String, primary_key=True, default=gen_uuid)
    station_id = Column(String, ForeignKey("radio_stations.id"), nullable=False)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    city_filter = Column(String(100))  # ex: "Itapema" — contexto de cidade para o Claude
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    station = relationship("RadioStation", back_populates="subscriptions")
    organization = relationship("Organization", back_populates="subscriptions")

    __table_args__ = (
        Index("ix_subscriptions_station", "station_id", "is_active"),
        Index("ix_subscriptions_station_org", "station_id", "org_id", unique=True),
    )


class CaptureEvent(Base):
    """Histórico operacional de captura por rádio/programa — alimenta o relatório de saúde."""
    __tablename__ = "capture_events"

    id = Column(String, primary_key=True, default=gen_uuid)
    station_id = Column(String, ForeignKey("radio_stations.id"), nullable=False)
    program_id = Column(String, ForeignKey("programs.id"), nullable=True)
    session_id = Column(String, ForeignKey("monitoring_sessions.id"), nullable=True)
    event_type = Column(SAEnum(CaptureEventType), nullable=False)
    error_class = Column(String(50))    # dns_failure | timeout | invalid_url | http_error | format_error | stream_offline | system_error | unknown
    message = Column(Text)
    attempt = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_capture_events_station", "station_id", "created_at"),
    )


class Report(Base):
    """Relatório consolidado ao final de cada sessão de monitoramento."""
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("monitoring_sessions.id"), unique=True, nullable=False)
    summary_text = Column(Text)
    general_summary = Column(Text)  # resumo geral do programa gerado pelo Claude
    key_topics = Column(JSON, default=list)
    overall_sentiment = Column(SAEnum(Sentiment))
    total_mentions = Column(Integer, default=0)
    alert_count = Column(Integer, default=0)
    high_urgency_count = Column(Integer, default=0)
    recommendations = Column(JSON, default=list)
    timeline = Column(JSON, default=list)     # [{time, topic, sentiment, excerpt}]
    sent_at = Column(DateTime)
    whatsapp_status = Column(String(50))
    generated_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("MonitoringSession", back_populates="report")
