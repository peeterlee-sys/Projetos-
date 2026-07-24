import { describe, it, expect } from "vitest";
import { parseGoogleNewsRss } from "@/lib/radar/parse";

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>STF decide sobre reforma trabalhista - Conjur</title>
    <link>https://news.google.com/rss/articles/abc</link>
    <pubDate>Wed, 23 Jul 2026 12:00:00 GMT</pubDate>
    <source url="https://www.conjur.com.br">Conjur</source>
  </item>
  <item>
    <title>Nova regra de contratos gera dúvidas &amp; debate - Migalhas</title>
    <link>https://news.google.com/rss/articles/def</link>
    <pubDate>Wed, 23 Jul 2026 09:30:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe("parseGoogleNewsRss", () => {
  const items = parseGoogleNewsRss(SAMPLE);

  it("extrai todos os itens", () => {
    expect(items).toHaveLength(2);
  });

  it("separa o veículo do título quando há <source>", () => {
    expect(items[0].title).toBe("STF decide sobre reforma trabalhista");
    expect(items[0].source).toBe("Conjur");
    expect(items[0].url).toContain("abc");
    expect(items[0].published_at).toBe("2026-07-23T12:00:00.000Z");
  });

  it("infere o veículo pelo sufixo ' - ' quando falta <source> e decodifica entidades", () => {
    expect(items[1].source).toBe("Migalhas");
    expect(items[1].title).toBe("Nova regra de contratos gera dúvidas & debate");
  });

  it("não quebra com XML vazio", () => {
    expect(parseGoogleNewsRss("<rss></rss>")).toEqual([]);
  });
});
