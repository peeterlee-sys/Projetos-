"""
Análise contextual usando Claude API.
Classifica relevância, tema, tom, urgência e tipo de conteúdo.
"""
import json
import time
from typing import Optional
from dataclasses import dataclass, asdict

import anthropic

from src.core.config import settings
from src.core.models import Sentiment, Urgency, ContentType
from src.core.logging_config import get_logger

logger = get_logger(__name__)

_client: Optional[anthropic.AsyncAnthropic] = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


SYSTEM_PROMPT = """Você é um analista de monitoramento de mídia especializado em comunicação pública municipal.

Sua tarefa é analisar trechos transcritos de programas de rádio e identificar se o conteúdo é relevante para a gestão pública de um município específico.

CONTEXTO DO MUNICÍPIO — ITAPEMA/SC:
- Prefeito: Carlos Alexandre de Souza Ribeiro (Alexandre Xepa), mandato 2025
- Vice-prefeito: Eurico Osmari
- Secretaria de Comunicação: Caroline Poerner
- Secretaria de Saúde: Fabrício Lazzari (Fafá)
- Secretaria de Obras: Jean Idimar da Silva
- Secretaria de Assistência Social: Íris Bispo da Silva
- Câmara Municipal: 13 vereadores, presidente Zulma Souza
- Programa de infraestrutura: "Avança Itapema"
- Bairros principais: Meia Praia, Centro, Canto da Praia, Várzea, Morretes, Ilhota
- Desafios: mobilidade, saúde, educação, saneamento, verticalização, temporada de verão

CRITÉRIOS DE RELEVÂNCIA:
1. O conteúdo deve se referir especificamente ao município, secretarias, autoridades, obras ou serviços públicos de Itapema
2. Menções genéricas sem contexto municipal são irrelevantes ("Itapema tem uma bela praia" → irrelevante)
3. Reclamações, denúncias e críticas à gestão têm prioridade alta
4. Entrevistas com autoridades municipais são sempre relevantes
5. Informações sobre obras, saúde, educação, segurança pública são relevantes
6. Notícias positivas sobre programas municipais são relevantes (tom elogio)

REGRAS DE NÃO-RELEVÂNCIA:
- Menção puramente geográfica sem relação com gestão pública
- Propaganda eleitoral de outro partido sem crítica à gestão atual
- Notícias sobre outros municípios que apenas citam Itapema como referência
- Clima, previsão do tempo sem implicação para gestão pública

Responda SEMPRE em JSON válido com a estrutura exata especificada pelo usuário."""


USER_PROMPT_TEMPLATE = """Analise o seguinte trecho transcrito de um programa de rádio:

RÁDIO: {station_name}
PROGRAMA: {program_name}
HORÁRIO DO TRECHO: {chunk_time}
PALAVRAS-CHAVE DETECTADAS: {keywords}

TRANSCRIÇÃO:
{text}

Responda EXATAMENTE com este JSON (sem markdown, sem explicação, apenas o JSON):
{{
  "is_relevant": true|false,
  "confidence_score": 0.0-1.0,
  "theme": "tema principal em até 60 caracteres",
  "sentiment": "positive|negative|neutral",
  "urgency": "low|medium|high|critical",
  "content_type": "complaint|denouncement|praise|interview|criticism|institutional|political|other",
  "summary": "resumo objetivo do que foi falado em até 200 caracteres",
  "excerpt": "trecho exato mais relevante da transcrição, entre aspas",
  "reason": "por que isso importa para a prefeitura: risco ou oportunidade em até 150 caracteres",
  "suggested_action": "ação prática sugerida para a equipe de comunicação em até 150 caracteres",
  "entities_mentioned": ["lista", "de", "pessoas", "lugares", "programas", "citados"]
}}"""


@dataclass
class AnalysisResult:
    is_relevant: bool
    confidence_score: float
    theme: str
    sentiment: str
    urgency: str
    content_type: str
    summary: str
    excerpt: str
    reason: str
    suggested_action: str
    entities_mentioned: list
    duration_ms: int
    raw_response: dict


async def analyze_transcription(
    text: str,
    station_name: str,
    program_name: str,
    chunk_time: str,
    matched_keywords: list[str],
) -> Optional[AnalysisResult]:
    """
    Analisa um trecho transcrito com Claude.

    Args:
        text: Texto transcrito
        station_name: Nome da rádio
        program_name: Nome do programa
        chunk_time: Horário do trecho (HH:MM:SS)
        matched_keywords: Keywords encontradas no pré-filtro

    Returns:
        AnalysisResult ou None se falhar
    """
    if not text or not text.strip():
        return None

    user_message = USER_PROMPT_TEMPLATE.format(
        station_name=station_name,
        program_name=program_name,
        chunk_time=chunk_time,
        keywords=", ".join(matched_keywords) if matched_keywords else "nenhuma detectada",
        text=text,
    )

    start = time.monotonic()

    try:
        client = get_client()
        response = await client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        duration_ms = int((time.monotonic() - start) * 1000)
        raw_text = response.content[0].text.strip()

        # Parse JSON response
        parsed = json.loads(raw_text)

        result = AnalysisResult(
            is_relevant=bool(parsed.get("is_relevant", False)),
            confidence_score=float(parsed.get("confidence_score", 0.0)),
            theme=str(parsed.get("theme", ""))[:200],
            sentiment=parsed.get("sentiment", "neutral"),
            urgency=parsed.get("urgency", "low"),
            content_type=parsed.get("content_type", "other"),
            summary=str(parsed.get("summary", ""))[:500],
            excerpt=str(parsed.get("excerpt", ""))[:1000],
            reason=str(parsed.get("reason", ""))[:500],
            suggested_action=str(parsed.get("suggested_action", ""))[:500],
            entities_mentioned=parsed.get("entities_mentioned", []),
            duration_ms=duration_ms,
            raw_response=parsed,
        )

        logger.info(
            "analyzer.result",
            is_relevant=result.is_relevant,
            urgency=result.urgency,
            theme=result.theme,
            confidence=result.confidence_score,
            duration_ms=duration_ms,
        )

        return result

    except json.JSONDecodeError as e:
        logger.error("analyzer.json_parse_error", error=str(e), raw=raw_text[:300] if 'raw_text' in dir() else "no response")
        return None
    except Exception as e:
        logger.error("analyzer.error", error=str(e), error_type=type(e).__name__)
        return None
