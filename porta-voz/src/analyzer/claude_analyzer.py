"""
Análise contextual usando Claude API.
Classifica relevância, tema, tom, urgência e tipo de conteúdo.
"""
import asyncio
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

Sua tarefa é analisar trechos transcritos de programas de rádio e identificar se o conteúdo é DIRETAMENTE relevante para a Secretaria de Comunicação da Prefeitura monitorada.

RELEVANTE — marque is_relevant: true SOMENTE se o conteúdo:
1. Citar explicitamente a Prefeitura, o Prefeito/Prefeita, Vice-prefeito, Secretário(a), vereador ou Câmara Municipal do município monitorado
2. Criticar ou elogiar um serviço público municipal: saúde, obras, transporte, limpeza, saneamento, iluminação
3. Trazer reclamação de morador sobre falha de serviço público (buraco, falta de água, lixo, UPA, hospital)
4. Entrevistar ou mencionar autoridade municipal pelo nome
5. Falar sobre programa, projeto, obra ou licitação da gestão municipal
6. Denunciar irregularidade, corrupção ou desvio envolvendo a prefeitura ou seus agentes
7. Reação social relevante (manifestação, protesto, abaixo-assinado) relacionada à gestão pública

NÃO RELEVANTE — marque is_relevant: false se o conteúdo:
- For ocorrência policial (crime, roubo, acidente, viatura) sem envolver diretamente a gestão municipal
- Mencionar apenas o nome de um bairro sem criticar serviço público da prefeitura
- For notícia sobre outro município (a não ser que envolva autoridades do município monitorado)
- For clima, turismo, esporte, cultura sem relação com gestão pública
- For propaganda comercial ou anúncio
- For genérico demais para demandar ação da comunicação municipal

CLASSIFICAÇÃO DE URGÊNCIA:
- critical (URGENTE): Risco à vida ou segurança pública, acidente com vítimas envolvendo serviço municipal, denúncia grave de corrupção, crise de abastecimento, emergência de saúde pública
- high (ALTA): Crítica direta e nominada ao(à) prefeito(a), secretário(a) ou gestão, reclamação grave de serviço com repercussão, denúncia de irregularidade
- medium (MÉDIA): Reclamação de morador sobre serviço público sem urgência, menção a programa ou obra municipal, entrevista com autoridade sobre tema administrativo
- low (BAIXA): Elogio, menção positiva, pauta cultural ou turística com leve envolvimento municipal

REGRA DE OURO: Se a Secretaria de Comunicação da Prefeitura não precisar tomar nenhuma ação (nota, resposta, apuração), o conteúdo NÃO é relevante.

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
  "source_type": "listener_call|interview|report|editorial|other",
  "summary": "resumo objetivo do que foi falado em até 200 caracteres",
  "excerpt": "trecho exato mais relevante da transcrição, entre aspas",
  "reason": "por que isso importa para a prefeitura: risco ou oportunidade em até 150 caracteres",
  "suggested_action": "ação prática sugerida para a equipe de comunicação em até 150 caracteres",
  "response_draft": "minuta de nota institucional pronta para enviar ao veículo ou publicar, em até 300 caracteres. Só preencha se is_relevant=true, senão retorne string vazia.",
  "entities_mentioned": ["lista", "de", "pessoas", "lugares", "programas", "citados"],
  "city_mentioned": "cidade a que o conteúdo se refere — explícita no trecho ou dedutível por bairro/equipamento público citado. Se não houver evidência da cidade, use a cidade-sede da rádio. Se nem isso for possível, 'incerta'."
}}"""


@dataclass
class AnalysisResult:
    is_relevant: bool
    confidence_score: float
    theme: str
    sentiment: str
    urgency: str
    content_type: str
    source_type: str
    summary: str
    excerpt: str
    reason: str
    suggested_action: str
    response_draft: str
    entities_mentioned: list
    duration_ms: int
    raw_response: dict
    city_mentioned: str = ""


SUMMARY_SYSTEM_PROMPT = """Você é um assistente que resume programas de rádio de forma objetiva e concisa.
Responda sempre em português, em 3 a 5 frases diretas. Não use bullet points, apenas texto corrido.
Foque nos temas abordados, não em detalhes técnicos da transcrição."""

SUMMARY_USER_TEMPLATE = """Abaixo está a transcrição (parcial) de um programa de rádio:

RÁDIO: {station_name}
PROGRAMA: {program_name}
DURAÇÃO MONITORADA: {duration_min} minutos

TRANSCRIÇÃO:
{text}

Escreva um resumo geral do que foi discutido neste programa hoje. Mencione os principais assuntos abordados, \
entrevistados ou temas relevantes para o ouvinte, sem julgamentos. Máximo de 5 frases."""


async def summarize_program(
    texts: list[str],
    station_name: str,
    program_name: str,
    duration_min: int,
) -> Optional[str]:
    """
    Gera um resumo geral do programa com base em amostras das transcrições.
    Limita a ~5000 caracteres para controlar custo.
    """
    if not texts:
        return None

    combined = " ".join(texts)
    if len(combined) > 5000:
        combined = combined[:5000] + "..."

    user_message = SUMMARY_USER_TEMPLATE.format(
        station_name=station_name,
        program_name=program_name,
        duration_min=duration_min,
        text=combined,
    )

    try:
        client = get_client()
        response = await asyncio.wait_for(
            client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=512,
                system=SUMMARY_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}],
            ),
            timeout=60.0,
        )
        return response.content[0].text.strip()
    except asyncio.TimeoutError:
        logger.warning("analyzer.summarize_timeout")
        return None
    except Exception as e:
        logger.error("analyzer.summarize_error", error=str(e))
        return None


async def analyze_transcription(
    text: str,
    station_name: str,
    program_name: str,
    chunk_time: str,
    matched_keywords: list[str],
    city_context: Optional[str] = None,
    org_system_prompt: Optional[str] = None,
    monitored_city: Optional[str] = None,
    station_city: Optional[str] = None,
) -> Optional[AnalysisResult]:
    """
    Analisa um trecho transcrito com Claude.

    Args:
        text: Texto transcrito
        station_name: Nome da rádio
        program_name: Nome do programa
        chunk_time: Horário do trecho (HH:MM:SS)
        matched_keywords: Keywords encontradas no pré-filtro
        monitored_city: Cidade monitorada por este cliente. A mesma rádio pode
            cobrir vários municípios, então este filtro impede que conteúdo de
            cidade vizinha "cole" no cliente errado.

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

    if monitored_city:
        home = (
            f"A rádio é SEDIADA em {station_city}: conteúdo local sem cidade "
            f"explícita (hospital, UPA, obra, bairro não identificado) refere-se "
            f"por padrão a {station_city}, NÃO a {monitored_city}. "
            if station_city and station_city.strip().lower() != monitored_city.strip().lower()
            else ""
        )
        user_message = (
            f"FILTRO GEOGRÁFICO OBRIGATÓRIO: esta rádio cobre mais de um município, "
            f"mas este cliente monitora APENAS {monitored_city}. {home}"
            f"Só marque is_relevant=true se o conteúdo for especificamente sobre "
            f"{monitored_city} (cidade nomeada, ou bairro/autoridade/equipamento "
            f"público que você saiba ser de {monitored_city}). Se for sobre outra "
            f"cidade — mesmo citando prefeito, obra, hospital ou serviço público — "
            f"marque is_relevant=false. Na dúvida sobre a cidade, is_relevant=false "
            f"e city_mentioned='incerta'.\n\n"
        ) + user_message

    # Bloco de sistema com CACHE DE PROMPT: o prompt-base e o contexto da cidade
    # são estáveis entre chamadas (mudam por org, não por trecho). Marcamos o fim
    # do prefixo estável com cache_control ephemeral; as chamadas seguintes do
    # mesmo programa (a cada 30s) leem esse prefixo do cache a ~0,1x do preço de
    # entrada, em vez de reenviá-lo como tokens novos toda vez.
    system_blocks = [{"type": "text", "text": org_system_prompt or SYSTEM_PROMPT}]
    if city_context:
        system_blocks.append({
            "type": "text",
            "text": f"CONTEXTO DO MUNICÍPIO MONITORADO:\n{city_context}",
        })
    system_blocks[-1]["cache_control"] = {"type": "ephemeral"}

    start = time.monotonic()

    try:
        client = get_client()
        response = await client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=1536,
            system=system_blocks,
            messages=[{"role": "user", "content": user_message}],
        )

        duration_ms = int((time.monotonic() - start) * 1000)
        raw_text = response.content[0].text.strip()

        # Remove markdown code fences if Claude wrapped the JSON (```json ... ```)
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```", 2)[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip().rstrip("`").strip()

        # Parse JSON response
        parsed = json.loads(raw_text)

        result = AnalysisResult(
            is_relevant=bool(parsed.get("is_relevant", False)),
            confidence_score=float(parsed.get("confidence_score", 0.0)),
            theme=str(parsed.get("theme", ""))[:200],
            sentiment=parsed.get("sentiment", "neutral"),
            urgency=parsed.get("urgency", "low"),
            content_type=parsed.get("content_type", "other"),
            source_type=parsed.get("source_type", "other"),
            summary=str(parsed.get("summary", ""))[:500],
            excerpt=str(parsed.get("excerpt", ""))[:1000],
            reason=str(parsed.get("reason", ""))[:500],
            suggested_action=str(parsed.get("suggested_action", ""))[:500],
            response_draft=str(parsed.get("response_draft", ""))[:600],
            entities_mentioned=parsed.get("entities_mentioned", []),
            duration_ms=duration_ms,
            raw_response=parsed,
            city_mentioned=str(parsed.get("city_mentioned", ""))[:80],
        )

        usage = getattr(response, "usage", None)
        logger.info(
            "analyzer.result",
            is_relevant=result.is_relevant,
            urgency=result.urgency,
            theme=result.theme,
            confidence=result.confidence_score,
            duration_ms=duration_ms,
            model=settings.CLAUDE_MODEL,
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
            cache_read=getattr(usage, "cache_read_input_tokens", None),
            cache_write=getattr(usage, "cache_creation_input_tokens", None),
        )

        return result

    except json.JSONDecodeError as e:
        logger.error("analyzer.json_parse_error", error=str(e), raw=raw_text[:300] if 'raw_text' in dir() else "no response")
        return None
    except Exception as e:
        logger.error("analyzer.error", error=str(e), error_type=type(e).__name__)
        return None
