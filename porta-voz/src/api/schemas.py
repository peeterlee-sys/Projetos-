"""
Pydantic schemas para request/response da API.
"""
from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, field_validator


# ─── Organization ─────────────────────────────────────────────────────────────

class OrganizationCreate(BaseModel):
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    plan: str = "mvp"


class OrganizationOut(BaseModel):
    id: str
    name: str
    city: Optional[str]
    state: Optional[str]
    plan: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Radio Station ────────────────────────────────────────────────────────────

class StationCreate(BaseModel):
    org_id: str
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    website: Optional[str] = None
    stream_url: Optional[str] = None
    youtube_url: Optional[str] = None
    stream_type: str = "stream"
    description: Optional[str] = None


class StationUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    stream_url: Optional[str] = None
    youtube_url: Optional[str] = None
    stream_type: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class StationOut(BaseModel):
    id: str
    org_id: str
    name: str
    city: Optional[str]
    state: Optional[str]
    stream_url: Optional[str]
    youtube_url: Optional[str]
    stream_type: str
    description: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Program ──────────────────────────────────────────────────────────────────

class ProgramCreate(BaseModel):
    station_id: str
    name: str
    days_of_week: List[str]
    start_time: str  # "07:00"
    end_time: str    # "09:00"
    timezone: str = "America/Sao_Paulo"
    alert_recipients: Optional[List[str]] = None

    @field_validator("days_of_week")
    @classmethod
    def validate_days(cls, v):
        valid = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
        for d in v:
            if d not in valid:
                raise ValueError(f"Dia inválido: {d}")
        return v

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time(cls, v):
        parts = v.split(":")
        if len(parts) != 2:
            raise ValueError("Formato de hora inválido. Use HH:MM")
        return v


class ProgramUpdate(BaseModel):
    name: Optional[str] = None
    days_of_week: Optional[List[str]] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None
    alert_recipients: Optional[List[str]] = None


class ProgramOut(BaseModel):
    id: str
    station_id: str
    name: str
    days_of_week: List[str]
    start_time: str
    end_time: str
    timezone: str
    is_active: bool
    alert_recipients: Optional[List[str]]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Keyword ──────────────────────────────────────────────────────────────────

class KeywordCreate(BaseModel):
    org_id: str
    term: str
    program_id: Optional[str] = None
    category: Optional[str] = None
    weight: int = 1


class KeywordOut(BaseModel):
    id: str
    org_id: str
    program_id: Optional[str]
    term: str
    category: Optional[str]
    weight: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Alert ────────────────────────────────────────────────────────────────────

class AlertOut(BaseModel):
    id: str
    session_id: str
    analysis_id: Optional[str]
    status: str
    recipients: List[str]
    message_text: Optional[str]
    dedup_hash: Optional[str]
    sent_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Monitoring Session ───────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id: str
    program_id: str
    status: str
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    total_chunks: int
    relevant_chunks: int
    total_alerts_sent: int
    reconnect_count: int
    error_message: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Report ───────────────────────────────────────────────────────────────────

class ReportOut(BaseModel):
    id: str
    session_id: str
    summary_text: Optional[str]
    key_topics: Optional[List[str]]
    overall_sentiment: Optional[str]
    total_mentions: int
    alert_count: int
    high_urgency_count: int
    recommendations: Optional[List[str]]
    timeline: Optional[List[Any]]
    sent_at: Optional[datetime]
    generated_at: datetime

    model_config = {"from_attributes": True}


# ─── Alert Recipient ─────────────────────────────────────────────────────────

class RecipientCreate(BaseModel):
    org_id: str
    name: Optional[str] = None
    phone: str
    urgency_filter: str = "low"


class RecipientOut(BaseModel):
    id: str
    org_id: str
    name: Optional[str]
    phone: str
    is_active: bool
    urgency_filter: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Monitoring Control ───────────────────────────────────────────────────────

class MonitorStartRequest(BaseModel):
    program_id: str


class MonitorStatusOut(BaseModel):
    program_id: str
    is_monitoring: bool
    session_id: Optional[str] = None


# ─── Station Subscription ────────────────────────────────────────────────────

class SubscriptionCreate(BaseModel):
    station_id: str
    org_id: str
    city_filter: Optional[str] = None


class SubscriptionOut(BaseModel):
    id: str
    station_id: str
    org_id: str
    city_filter: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Generic ──────────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    message: str
    detail: Optional[str] = None
