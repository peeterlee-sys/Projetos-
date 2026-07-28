import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Corta o acesso de quem passou dos 7 dias de trial sem assinar: vira
 * 'past_due' (bloqueia o WhatsApp — ver billing.blocked em getVereador) até
 * o Asaas confirmar um pagamento. Roda uma vez por dia (vercel.json).
 * Protegido por CRON_SECRET, mesmo padrão de /api/cron/weekly.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided =
    request.headers.get("x-cron-secret") ??
    bearer ??
    new URL(request.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("client_profiles")
    .update({ subscription_status: "past_due", subscription_updated_at: new Date().toISOString() })
    .eq("subscription_status", "trial")
    .lt("trial_ends_at", new Date().toISOString())
    .select("user_id");

  if (error) {
    await supabase.from("system_errors").insert({ scope: "cron", message: error.message, context: { job: "expire-trials" } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", expired: data?.length ?? 0 });
}

export const GET = handle;
export const POST = handle;
