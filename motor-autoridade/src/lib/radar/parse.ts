/**
 * Funções puras do radar (parsing/normalização) — sem dependências de
 * servidor, para poderem ser testadas isoladamente.
 */

export type RadarHeadline = {
  title: string;
  source: string;
  url: string;
  published_at: string | null;
  from_priority_source: boolean;
};

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

/**
 * Parser do RSS do Google News. Os títulos vêm como "Manchete - Veículo";
 * separamos o veículo quando o RSS não traz <source>.
 */
export function parseGoogleNewsRss(xml: string): RadarHeadline[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
  const out: RadarHeadline[] = [];
  for (const raw of items) {
    const rawTitle = tag(raw, "title");
    if (!rawTitle) continue;
    const link = tag(raw, "link") ?? "";
    const pub = tag(raw, "pubDate");
    const sourceTag = raw.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    let source = sourceTag ? decodeEntities(sourceTag[1]) : "";
    let title = rawTitle;
    const dash = title.lastIndexOf(" - ");
    if (!source && dash > 20) {
      source = title.slice(dash + 3).trim();
      title = title.slice(0, dash).trim();
    } else if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, title.length - source.length - 3).trim();
    }
    out.push({
      title,
      source: source || "—",
      url: link,
      published_at: pub ? new Date(pub).toISOString() : null,
      from_priority_source: false,
    });
  }
  return out;
}

export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
