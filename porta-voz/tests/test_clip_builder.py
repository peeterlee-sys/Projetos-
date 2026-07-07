"""
Cenário 6: ocorrência com mais de 30 segundos → clip completo com contexto
antes e depois da menção (nunca só o corte de 30s).
"""
from src.analyzer.city_router import ACTION_SEND  # noqa: F401 (garante import do pacote)
from src.capture.clip_builder import select_clip_chunk_range, chunk_index_from_path
from pathlib import Path


def test_clip_inclui_contexto_antes_e_depois():
    """Menção no chunk 5, chunks 0-8 disponíveis → clip = [3,4,5,6,7]
    (2 antes + 2 depois = 150s de áudio, não 30s)."""
    selected = select_clip_chunk_range(5, list(range(9)), pre_chunks=2, post_chunks=2)
    assert selected == [3, 4, 5, 6, 7]
    # com chunks de 30s, o clip tem 150s — bem mais que o corte antigo de 30s
    assert len(selected) * 30 > 30


def test_clip_no_inicio_do_programa():
    """Menção no chunk 0 — sem contexto anterior, mas com posterior."""
    selected = select_clip_chunk_range(0, [0, 1, 2, 3], pre_chunks=2, post_chunks=2)
    assert selected == [0, 1, 2]


def test_clip_no_fim_do_programa():
    """Menção no último chunk — o clip usa só o que existe."""
    selected = select_clip_chunk_range(4, [0, 1, 2, 3, 4], pre_chunks=2, post_chunks=2)
    assert selected == [2, 3, 4]


def test_clip_nao_atravessa_buracos():
    """Reconexão criou gap: não concatena áudio não-contíguo."""
    selected = select_clip_chunk_range(5, [1, 4, 5, 6, 9], pre_chunks=2, post_chunks=2)
    assert selected == [4, 5, 6]


def test_chunk_central_ausente_retorna_vazio():
    assert select_clip_chunk_range(7, [0, 1, 2], pre_chunks=2, post_chunks=2) == []


def test_parse_indice_do_arquivo():
    assert chunk_index_from_path(Path("/x/chunk_00042.wav")) == 42
    assert chunk_index_from_path(Path("/x/outro.wav")) is None
