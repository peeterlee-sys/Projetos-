"""
Roteamento de alertas por cidade contratada.

Regra central do RADAR PÚBLICO: um alerta só é enviado para a prefeitura
cliente quando o assunto é comprovadamente pertinente à cidade contratada —
nunca apenas porque uma palavra-chave genérica ("hospital", "prefeitura")
apareceu numa rádio regional.

A decisão usa a classificação de cidade produzida pela análise Claude
(cidade principal, cidades afetadas, confiança e justificativa) e aplica
a pergunta obrigatória: "este conteúdo é realmente pertinente à cidade
contratada ou apenas apareceu em uma rádio regional?"
"""
import unicodedata
from dataclasses import dataclass
from typing import List, Optional

from src.core.config import settings


# Ações possíveis
ACTION_SEND = "send"      # envia o alerta normalmente
ACTION_REVIEW = "review"  # retém para revisão interna (baixa confiança / cidade indefinida)
ACTION_BLOCK = "block"    # não envia — assunto não pertence à cidade contratada


@dataclass
class RoutingDecision:
    action: str            # send | review | block
    matched_as: str        # primary | affected | none | unknown
    reason: str            # justificativa registrada no alerta (auditoria)

    @property
    def should_send(self) -> bool:
        return self.action == ACTION_SEND


def normalize_city(name: Optional[str]) -> str:
    """Normaliza nome de cidade para comparação: minúsculas, sem acentos, sem espaços extras."""
    if not name:
        return ""
    text = unicodedata.normalize("NFD", name.strip().lower())
    text = text.encode("ascii", "ignore").decode("ascii")
    return " ".join(text.split())


def _city_in(city: str, candidates: List[str]) -> bool:
    norm = normalize_city(city)
    if not norm:
        return False
    return any(normalize_city(c) == norm for c in candidates or [])


def decide_routing(
    contracted_city: Optional[str],
    primary_city: Optional[str],
    affected_cities: Optional[List[str]],
    city_confidence: Optional[float],
    min_confidence: Optional[float] = None,
) -> RoutingDecision:
    """
    Decide se o alerta deve ser enviado para a cidade contratada.

    Regras:
    1. Sem cidade contratada configurada → revisão interna (não dá para validar).
    2. Cidade principal == cidade contratada → envia (se confiança suficiente).
    3. Cidade contratada explicitamente listada como afetada → envia (se confiança suficiente).
    4. Assunto de outra cidade ou regional genérico → bloqueia.
    5. Confiança abaixo do mínimo → revisão interna, nunca envio automático.
    """
    threshold = min_confidence if min_confidence is not None else settings.MIN_CITY_CONFIDENCE
    confidence = city_confidence if city_confidence is not None else 0.0
    affected = affected_cities or []

    if not contracted_city or not normalize_city(contracted_city):
        return RoutingDecision(
            action=ACTION_REVIEW,
            matched_as="unknown",
            reason=(
                "Organização sem cidade contratada configurada — impossível validar "
                "roteamento; alerta retido para revisão interna."
            ),
        )

    primary_match = normalize_city(primary_city) == normalize_city(contracted_city)
    affected_match = _city_in(contracted_city, affected)

    if not primary_city and not affected:
        return RoutingDecision(
            action=ACTION_REVIEW,
            matched_as="unknown",
            reason=(
                "A análise não identificou nenhuma cidade claramente afetada "
                "(conteúdo regional genérico ou menção curta sem contexto) — "
                "retido para revisão interna, não enviado automaticamente."
            ),
        )

    if primary_match:
        if confidence >= threshold:
            return RoutingDecision(
                action=ACTION_SEND,
                matched_as="primary",
                reason=(
                    f"Cidade principal do assunto é {contracted_city} "
                    f"(confiança {confidence:.2f} ≥ {threshold:.2f})."
                ),
            )
        return RoutingDecision(
            action=ACTION_REVIEW,
            matched_as="primary",
            reason=(
                f"Cidade principal é {contracted_city}, mas a confiança da "
                f"classificação ({confidence:.2f}) está abaixo do mínimo "
                f"({threshold:.2f}) — retido para revisão interna."
            ),
        )

    if affected_match:
        if confidence >= threshold:
            return RoutingDecision(
                action=ACTION_SEND,
                matched_as="affected",
                reason=(
                    f"{contracted_city} foi citada como cidade diretamente afetada "
                    f"pelo assunto (principal: {primary_city or 'indefinida'}; "
                    f"confiança {confidence:.2f})."
                ),
            )
        return RoutingDecision(
            action=ACTION_REVIEW,
            matched_as="affected",
            reason=(
                f"{contracted_city} aparece como afetada, mas com confiança "
                f"insuficiente ({confidence:.2f} < {threshold:.2f}) — retido "
                f"para revisão interna."
            ),
        )

    return RoutingDecision(
        action=ACTION_BLOCK,
        matched_as="none",
        reason=(
            f"Assunto pertence a {primary_city or 'outra cidade/região'} e "
            f"{contracted_city} não foi citada como diretamente afetada — "
            f"alerta bloqueado para esta cidade contratada."
        ),
    )
