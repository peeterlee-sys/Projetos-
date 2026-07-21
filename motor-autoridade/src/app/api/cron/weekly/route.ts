import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateWeeklyReport } from "@/lib/reports/weekly";
import { sendPushToUser } from "@/lib/push/send";

export const runtime = "nodejs";

/**
 * Job semanal (MÓDULO 10 + 12): gera o relatório de cada cliente e dispara o
 * resumo por Web Push. Protegido por CRON_SECRET.
 * Agende no Make/cron: GET/POST /api/cron/weekly com header `x-cron-secret`.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, tenant_id, full_name")
    .eq("role", "client")
    .eq("is_active", true)
    .not("tenant_id", "is", null)
    .is("deleted_at", null);

  let processed = 0;
  let notified = 0;
  for (const u of users ?? []) {
    try {
      const report = await generateWeeklyReport(supabase, u);
      await supabase.from("notifications").insert({
        tenant_id: u.tenant_id,
        user_id: u.id,
        type: "weekly_report",
        title: "Seu relatório semanal chegou",
        body: report.narrative ?? "Veja como foi sua semana.",
        channel: "web_push",
        data: { url: "/relatorio" },
        sent_at: new Date().toISOString(),
      });
      const { sent } = await sendPushToUser(supabase, u.id, {
        title: "Seu relatório semanal chegou",
        body: report.narrative ?? "Veja como foi sua semana.",
        data: { url: "/relatorio" },
      });
      if (sent > 0) notified += 1;
      processed += 1;
    } catch (e) {
      await supabase.from("system_errors").insert({
        tenant_id: u.tenant_id,
        scope: "job",
        message: e instanceof Error ? e.message : "erro no relatório semanal",
        context: { user_id: u.id },
      });
    }
  }

  return NextResponse.json({ ok: true, processed, notified });
}

export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}
