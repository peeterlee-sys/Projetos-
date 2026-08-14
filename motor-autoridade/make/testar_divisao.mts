import { readFileSync } from "node:fs";
import { dividirParaWhatsApp } from "../src/lib/atividades/dividir";
import { limparMarcadores } from "../src/lib/atividades/limpar";

const bruto = readFileSync(process.argv[2], "utf-8");
const limpo = limparMarcadores(bruto);
const partes = dividirParaWhatsApp(limpo);

console.log(`documento: ${bruto.length} chars | após limpeza: ${limpo.length}`);
console.log(`partes: ${partes.length}`);
for (const [i, p] of partes.entries()) {
  const fim = p.trimEnd().slice(-45).replace(/\n/g, "⏎");
  console.log(`  ${i + 1}: ${String(p.length).padStart(4)} chars | termina em: ${JSON.stringify(fim)}`);
  if (p.length > 4096) console.log("    !!! ESTOURA O LIMITE DO WHATSAPP");
}
