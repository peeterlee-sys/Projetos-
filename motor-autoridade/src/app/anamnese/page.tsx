import { redirect } from "next/navigation";

/**
 * Link curto e público da anamnese do Assessor 24h — é este endereço que vai
 * para o vereador (https://assessor24h.ia.br/anamnese). Encaminha para a
 * trilha política preservando a query (ex.: ?refazer=1).
 *
 * Quem não está logado passa por /login?next=/anamnese (ou /signup) e volta
 * para cá automaticamente — a middleware cuida disso.
 */
export default async function AnamneseShortLink({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const suffix = qs.toString();
  redirect(`/onboarding/politico${suffix ? `?${suffix}` : ""}`);
}
