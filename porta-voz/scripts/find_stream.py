#!/usr/bin/env python3
"""
Caçador de URL de stream de rádio a partir da página do site.

Muitos sites escondem o áudio num player embutido (iframe) ou numa variável de
JS. Este script busca na página, segue iframes/players um nível, testa padrões
comuns de mount point e valida cada candidato com ffprobe — imprime os que
realmente tocam.

Uso (no servidor):
    python3 scripts/find_stream.py "https://site-da-radio.com.br/pagina"

Depois é só cadastrar a URL que funcionar (rádio + programa + assinatura).
"""
import re
import subprocess
import sys
import urllib.request
import urllib.error
from urllib.parse import urljoin, urlparse

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"}

STREAM_RE = re.compile(
    r'https?://[^\s"\'<>\\]+?(?:\.mp3|\.aac|\.m3u8|/stream[^\s"\'<>\\]*|'
    r'/live[^\s"\'<>\\]*|/radio[^\s"\'<>\\]*|:\d{3,5}/[^\s"\'<>\\]*)',
    re.IGNORECASE,
)
IFRAME_RE = re.compile(r'<iframe[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)
JSVAR_RE = re.compile(
    r'["\'](?:url|stream|streamUrl|url_stream|src|audio)["\']\s*[:=]\s*'
    r'["\'](https?://[^\s"\'<>\\]+)["\']', re.IGNORECASE,
)
# mount points comuns para tentar sobre host:port descobertos
MOUNTS = ["/stream", "/live", "/;", "/;stream.mp3", "/radio", "/1", "/live.mp3"]


def fetch(url: str) -> str:
    try:
        req = urllib.request.Request(url, headers=UA)
        return urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"   (falha ao ler {url[:60]}: {e})")
        return ""


def probe(url: str) -> str | None:
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=format_name",
             "-of", "csv=p=0", url],
            capture_output=True, text=True, timeout=18,
        )
        return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else None
    except Exception:
        return None


def candidates_from(html: str, base: str) -> list[str]:
    out = []
    for m in STREAM_RE.findall(html):
        out.append(m.rstrip("\\"))
    for m in JSVAR_RE.findall(html):
        out.append(m.rstrip("\\"))
    # bases host:port → tenta mount points
    for m in re.findall(r'https?://[^\s"\'<>\\]+?:\d{3,5}', html):
        for mt in MOUNTS:
            out.append(m + mt)
    # normaliza/dedup
    seen, res = set(), []
    for u in out:
        u = u.split("?")[0]
        if u not in seen:
            seen.add(u)
            res.append(u)
    return res


def main():
    if len(sys.argv) < 2:
        print("uso: python3 scripts/find_stream.py <URL-da-pagina>")
        sys.exit(1)
    page = sys.argv[1]
    print(f"🔎 Analisando {page}\n")

    html = fetch(page)
    if not html:
        print("Não consegui ler a página (pode exigir navegador). "
              "Use F12 › Rede › Media no navegador e me passe a URL que tocar.")
        sys.exit(2)

    pages = [html]
    # segue iframes/players um nível
    for src in IFRAME_RE.findall(html)[:5]:
        full = urljoin(page, src)
        print(f"   ↳ player embutido: {full[:70]}")
        sub = fetch(full)
        if sub:
            pages.append(sub)

    cands = []
    for h in pages:
        for u in candidates_from(h, page):
            if u not in cands:
                cands.append(u)

    if not cands:
        print("\nNenhum candidato encontrado no HTML. Provável player 100% via "
              "JS/API. Caminho certo: F12 › Rede › filtro Media › play › copiar URL.")
        sys.exit(3)

    print(f"\nTestando {len(cands)} candidato(s) com ffprobe...\n")
    ok = []
    for u in cands:
        fmt = probe(u)
        mark = f"✅ {fmt}" if fmt else "❌"
        print(f"  {mark}  {u}")
        if fmt:
            ok.append(u)

    print("\n" + "=" * 60)
    if ok:
        print("STREAMS QUE FUNCIONAM (use um destes no cadastro):")
        for u in ok:
            print("  ", u)
    else:
        print("Nenhum candidato tocou. Use F12 › Rede › Media no navegador.")


if __name__ == "__main__":
    main()
