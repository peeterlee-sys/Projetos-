import { redirect } from "next/navigation";

/**
 * Link curto do dashboard — https://assessor24h.ia.br/painel.
 * Encaminha para /admin preservando a query. Quem não tem sessão passa por
 * /login?next=/painel e volta para cá; quem não é admin cai no app (/hoje),
 * pela guarda do próprio layout administrativo.
 */
export default async function PainelShortLink({
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
  redirect(`/admin${suffix ? `?${suffix}` : ""}`);
}
