import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminOverview, situacaoDoMandato } from "@/lib/admin/overview";
import { formatPhoneBR } from "@/lib/phone";

const SITUACAO_STYLE = {
  ok: "bg-success-100 text-brand-700",
  atencao: "bg-gold-300/40 text-gold-700",
  alerta: "bg-danger-600/10 text-danger-700",
} as const;

function date(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}


/**
 * Painel do Assessor 24h: os mandatos com anamnese concluída no app e os
 * registros ainda vindos das planilhas antigas (o assistente do WhatsApp
 * responde por eles até o vereador preencher o wizard).
 */
export default async function VereadoresPage() {
  const supabase = await createClient();

  const [overview, { data: legacy }] = await Promise.all([
    getAdminOverview(supabase),
    supabase
      .from("legacy_vereadores")
      .select("id, phone, name, political_name, party, city, state, linked_user_id, imported_at")
      .order("imported_at", { ascending: false })
      .limit(500),
  ]);

  // Quem se cadastrou e ainda não fez a anamnese não tem trilha definida —
  // mas é justamente quem precisa de atenção, então entra na lista também.
  const mandates = overview.clients.filter((c) => c.track === "political" || !c.onboarded);
  const legacyRows = legacy ?? [];
  const pendingLegacy = legacyRows.filter((l) => !l.linked_user_id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-ink-900">Vereadores</h1>
        <p className="mt-1 text-sm text-ink-500">
          Mandatos atendidos pelo Assessor 24h e o que ainda falta migrar das planilhas.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
          Mandatos no app ({mandates.length})
        </h2>
        {mandates.length === 0 ? (
          <div className="rounded-2xl bg-white/80 p-8 text-center text-sm text-ink-500 ring-1 ring-sand-200">
            Nenhum vereador cadastrado ainda.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white/80 ring-1 ring-sand-200">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-400">
                  <th className="px-3 py-3 font-medium">Vereador</th>
                  <th className="px-3 py-3 font-medium">Cidade/UF</th>
                  <th className="px-3 py-3 font-medium">Partido</th>
                  <th className="px-3 py-3 font-medium">WhatsApp</th>
                  <th className="px-3 py-3 font-medium">Últ. pauta</th>
                  <th className="px-3 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {mandates.map((c) => (
                  <tr key={c.id} className="border-t border-sand-200 transition hover:bg-sand-100/60">
                    <td className="whitespace-nowrap px-3 py-3">
                      <Link href={`/admin/clientes/${c.id}`} className="block">
                        <span className="font-medium text-ink-900 hover:text-brand-700">
                          {c.politicalName ?? c.name ?? c.email}
                        </span>
                        <span className="block text-xs text-ink-400">{c.name ?? c.email}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-700">
                      {c.city ? `${c.city}${c.state ? `/${c.state}` : ""}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-700">{c.party ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500 tabular-nums">
                      {c.phone ? formatPhoneBR(c.phone) : "—"}
                    </td>
                    <td className="max-w-[16rem] px-3 py-3">
                      <span className="block truncate text-sm text-ink-500" title={c.lastOpportunity ?? ""}>
                        {c.lastOpportunity ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const s = situacaoDoMandato(c);
                        return (
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${SITUACAO_STYLE[s.tone]}`}
                          >
                            {s.label}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
          Importados das planilhas ({pendingLegacy.length} sem conta no app)
        </h2>
        {legacyRows.length === 0 ? (
          <div className="rounded-2xl bg-white/80 p-8 text-center text-sm text-ink-500 ring-1 ring-sand-200">
            Nada importado. Rode <code className="font-mono">node scripts/import-planilhas.mjs</code>{" "}
            com os CSVs das planilhas antigas.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white/80 ring-1 ring-sand-200">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-400">
                  <th className="px-3 py-3 font-medium">Nome</th>
                  <th className="px-3 py-3 font-medium">Cidade/UF</th>
                  <th className="px-3 py-3 font-medium">Partido</th>
                  <th className="px-3 py-3 font-medium">WhatsApp</th>
                  <th className="px-3 py-3 font-medium">Importado</th>
                  <th className="px-3 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {legacyRows.map((l) => (
                  <tr key={l.id} className="border-t border-sand-200">
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-900">
                      {l.political_name ?? l.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-700">
                      {l.city ? `${l.city}${l.state ? `/${l.state}` : ""}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-700">{l.party ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500 tabular-nums">
                      {formatPhoneBR(l.phone)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-500 tabular-nums">
                      {date(l.imported_at)}
                    </td>
                    <td className="px-3 py-3">
                      {l.linked_user_id ? (
                        <Link
                          href={`/admin/clientes/${l.linked_user_id}`}
                          className="rounded-full bg-success-100 px-2.5 py-0.5 text-xs text-brand-700"
                        >
                          Anamnese concluída
                        </Link>
                      ) : (
                        <span className="rounded-full bg-gold-300/40 px-2.5 py-0.5 text-xs text-gold-700">
                          Aguardando anamnese
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-ink-400">
          Enquanto o vereador não conclui o wizard, o <code className="font-mono">get_vereador</code>{" "}
          responde com estes dados importados. Depois da anamnese, o registro é vinculado e o
          assistente passa a usar o perfil vivo do app.
        </p>
      </section>
    </div>
  );
}
