import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pedidos de edição com legenda (ZapCap) para o painel administrativo.
 * A RLS delimita o escopo: admin vê o próprio tenant, super_admin vê tudo.
 */

export type EditRequestStatus = "pending" | "processing" | "ready" | "failed";

export type EditRequestView = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  contentItemId: string | null;
  contentTitle: string | null;
  provider: string;
  language: string;
  templateId: string | null;
  status: EditRequestStatus;
  outputUrl: string | null;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Minutos desde a criação — usado para destacar pedidos travados. */
  ageMinutes: number | null;
  /** Em processamento há tempo demais (provável abandono da tela). */
  stalled: boolean;
};

export type EditRequestSummary = {
  total: number;
  processing: number;
  ready: number;
  failed: number;
  stalled: number;
  requests: EditRequestView[];
};

/** Acima disso um pedido em processamento é tratado como travado. */
const STALLED_AFTER_MINUTES = 15;

const SELECT =
  "id, user_id, content_item_id, provider, template_id, language, status, output_url, error, created_at, updated_at, users(full_name, email), content_items(title)";

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

/** Embeds do PostgREST podem vir como objeto ou array conforme a cardinalidade. */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function getEditRequests(
  supabase: SupabaseClient,
  opts: { userId?: string; limit?: number } = {},
): Promise<EditRequestSummary> {
  let query = supabase
    .from("edit_requests")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.userId) query = query.eq("user_id", opts.userId);

  const { data } = await query;

  const requests: EditRequestView[] = (data ?? []).map((r) => {
    const user = one(r.users as { full_name?: string | null; email?: string | null } | null);
    const item = one(r.content_items as { title?: string | null } | null);
    const status = (r.status ?? "pending") as EditRequestStatus;
    const age = minutesSince(r.created_at as string | null);
    return {
      id: r.id as string,
      userId: r.user_id as string,
      userName: user?.full_name ?? null,
      userEmail: user?.email ?? null,
      contentItemId: (r.content_item_id as string | null) ?? null,
      contentTitle: item?.title ?? null,
      provider: (r.provider as string) ?? "zapcap",
      language: (r.language as string) ?? "pt",
      templateId: (r.template_id as string | null) ?? null,
      status,
      outputUrl: (r.output_url as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      updatedAt: (r.updated_at as string | null) ?? null,
      ageMinutes: age,
      stalled: status === "processing" && age != null && age >= STALLED_AFTER_MINUTES,
    };
  });

  return {
    total: requests.length,
    processing: requests.filter((r) => r.status === "processing" || r.status === "pending").length,
    ready: requests.filter((r) => r.status === "ready").length,
    failed: requests.filter((r) => r.status === "failed").length,
    stalled: requests.filter((r) => r.stalled).length,
    requests,
  };
}
