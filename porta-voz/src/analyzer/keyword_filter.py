"""
Pré-filtro rápido por palavras-chave — evita chamar o Claude
para trechos claramente irrelevantes.
"""
import re
import unicodedata
from typing import List, Tuple

from src.core.logging_config import get_logger

logger = get_logger(__name__)

# Palavras-chave globais padrão (Itapema, mas expansível para qualquer município)
DEFAULT_KEYWORDS = [
    # Entidade principal
    "prefeitura de itapema",
    "prefeitura municipal",
    "prefeito de itapema",
    "prefeito alexandre",
    "alexandre xepa",
    "xepa",
    "eurico osmari",
    "vice-prefeito",

    # Secretarias
    "secretaria de saúde",
    "secretaria de educação",
    "secretaria de obras",
    "secretaria de turismo",
    "secretaria de segurança",
    "secretaria de assistência",
    "secretaria de finanças",
    "secretaria de comunicação",
    "secretaria municipal",
    "secretário",
    "secretária",

    # Temas municipais
    "câmara de itapema",
    "câmara municipal",
    "vereador",
    "vereadora",

    # Saúde
    "upa",
    "upa de itapema",
    "fila de espera",
    "posto de saúde",
    "unidade básica",
    "pronto-socorro",
    "ambulância",

    # Educação
    "escola municipal",
    "creche municipal",
    "rede municipal de ensino",
    "merenda escolar",

    # Obras e infraestrutura
    "buraco na rua",
    "buraco na via",
    "pavimentação",
    "calçada",
    "obra pública",
    "licitação",
    "contrato",

    # Segurança e trânsito
    "guarda municipal",
    "segurança pública",
    "trânsito",
    "mobilidade urbana",
    "fiscalização",

    # Reclamações e denúncias
    "denúncia",
    "reclamação",
    "irregularidade",
    "desvio",
    "corrupção",

    # Localidade
    "itapema",
    "meia praia",
    "sertão do trombudo",
    "canto da praia",
]


def _normalize(text: str) -> str:
    """Remove acentos e normaliza para busca."""
    text = text.lower().strip()
    return unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("ascii")


def _build_pattern(keywords: List[str]) -> re.Pattern:
    normalized = [re.escape(_normalize(kw)) for kw in keywords]
    return re.compile(r"\b(" + "|".join(normalized) + r")\b", re.IGNORECASE)


def check_keywords(
    text: str,
    custom_keywords: List[str] = None,
    include_defaults: bool = True,
) -> Tuple[bool, List[str]]:
    """
    Verifica se o texto contém palavras-chave relevantes.

    Returns:
        (has_match, list_of_matched_keywords)
    """
    if not text or not text.strip():
        return False, []

    all_keywords = []
    if include_defaults:
        all_keywords.extend(DEFAULT_KEYWORDS)
    if custom_keywords:
        all_keywords.extend(custom_keywords)

    normalized_text = _normalize(text)
    matched = []

    for kw in all_keywords:
        normalized_kw = _normalize(kw)
        if normalized_kw in normalized_text:
            matched.append(kw)

    has_match = len(matched) > 0

    if has_match:
        logger.debug(
            "keyword_filter.match",
            matched=matched[:10],
            text_preview=text[:100],
        )

    return has_match, list(set(matched))


def score_keywords(matched_keywords: List[str], weighted_keywords: dict = None) -> int:
    """
    Calcula score baseado em keywords encontradas e seus pesos.
    weighted_keywords: {keyword: weight}
    """
    if not weighted_keywords:
        return len(matched_keywords)

    score = 0
    for kw in matched_keywords:
        score += weighted_keywords.get(kw.lower(), 1)
    return score
