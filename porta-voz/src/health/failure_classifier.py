"""
Classificação de falhas de captura de stream.

Transforma erros crus do ffmpeg/yt-dlp/rede em categorias acionáveis, para o
relatório operacional distinguir: falha temporária, rádio fora do ar, URL
inválida, erro do nosso sistema, stream que mudou, e o que precisa de ação
humana.
"""
import re
from dataclasses import dataclass

# classes: dns_failure | invalid_url | timeout | http_error | format_error |
#          stream_offline | system_error | unknown

_PATTERNS = [
    ("dns_failure", [
        r"name or service not known",
        r"failed to resolve",
        r"could not resolve",
        r"temporary failure in name resolution",
        r"nodename nor servname",
        r"getaddrinfo",
        r"não foi possível resolver",
    ]),
    ("invalid_url", [
        r"invalid url",
        r"no such file or directory",
        r"protocol not found",
        r"malformed",
        r"unsupported protocol",
        r"error 404",
        r"http error 404",
        r"404 not found",
        r"410 gone",
    ]),
    ("http_error", [
        r"http error 4\d\d",
        r"http error 5\d\d",
        r"server returned 4\d\d",
        r"server returned 5\d\d",
        r"403 forbidden",
        r"401 unauthorized",
    ]),
    ("timeout", [
        r"timed? ?out",
        r"connection timed",
        r"operation timed",
        r"timeout",
    ]),
    ("stream_offline", [
        r"connection refused",
        r"connection reset",
        r"end of file",
        r"broken pipe",
        r"server closed",
        r"no route to host",
        r"network is unreachable",
    ]),
    ("format_error", [
        r"invalid data found",
        r"could not find codec",
        r"decoder .* not found",
        r"unknown format",
        r"unsupported codec",
        r"moov atom not found",
    ]),
    ("system_error", [
        r"ffmpeg não encontrado",
        r"ffmpeg not found",
        r"no space left",
        r"permission denied",
        r"cannot allocate memory",
    ]),
]

# Classes que tendem a se resolver sozinhas com reconexão
TRANSIENT_CLASSES = {"timeout", "stream_offline"}
# Classes que exigem ação humana (URL nova, correção de sistema)
NEEDS_HUMAN_CLASSES = {"dns_failure", "invalid_url", "format_error", "system_error", "http_error"}


@dataclass
class FailureClassification:
    error_class: str
    is_transient: bool
    needs_human: bool


def classify_failure(error_text: str) -> FailureClassification:
    """Classifica um texto de erro de captura em uma categoria acionável."""
    text = (error_text or "").lower()
    error_class = "unknown"
    for cls, patterns in _PATTERNS:
        if any(re.search(p, text) for p in patterns):
            error_class = cls
            break

    return FailureClassification(
        error_class=error_class,
        is_transient=error_class in TRANSIENT_CLASSES,
        needs_human=error_class in NEEDS_HUMAN_CLASSES or error_class == "unknown",
    )
