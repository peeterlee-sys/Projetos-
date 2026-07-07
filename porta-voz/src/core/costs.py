"""
Estimativa de custos por etapa do pipeline.
Preços em USD. Atualizar aqui quando os provedores mudarem tabela.
"""
from typing import Optional

# OpenAI Whisper API (whisper-1): $0.006 por minuto de áudio
WHISPER_USD_PER_MINUTE = 0.006

# Claude — preço por milhão de tokens (input, output), por modelo.
# Fonte: tabela oficial Anthropic (2026-06).
CLAUDE_PRICING_PER_MTOK = {
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-opus-4-8": (5.00, 25.00),
}
_DEFAULT_CLAUDE_PRICING = (3.00, 15.00)

# Z-API: custo por mensagem enviada (aproximação — plano mensal / volume).
# Ajustável via settings se necessário.
WHATSAPP_USD_PER_MESSAGE = 0.005


def estimate_whisper_cost(duration_seconds: float) -> float:
    """Custo estimado de transcrever um trecho de áudio."""
    return round((duration_seconds / 60.0) * WHISPER_USD_PER_MINUTE, 6)


def estimate_claude_cost(
    model: str,
    input_tokens: Optional[int],
    output_tokens: Optional[int],
) -> float:
    """Custo estimado de uma chamada Claude a partir do usage retornado pela API."""
    price_in, price_out = CLAUDE_PRICING_PER_MTOK.get(model, _DEFAULT_CLAUDE_PRICING)
    cost = ((input_tokens or 0) / 1_000_000) * price_in
    cost += ((output_tokens or 0) / 1_000_000) * price_out
    return round(cost, 6)


def estimate_whatsapp_cost(message_count: int) -> float:
    return round(message_count * WHATSAPP_USD_PER_MESSAGE, 6)
