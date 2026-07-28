import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/send";

export const runtime = "nodejs";

const INACTIVITY_DAYS = 7;

/**
 * Cutuca por Web Push (grátis) quem não gerou nada pelo WhatsApp nos últimos
 * INACTIVITY_DAYS dias — via WhatsApp isso custaria mensagem. Não repete o
 * aviso todo dia: só manda de novo depois de outros INACTIVITY_DAYS dias sem
 * atividade e sem push. Protegido por CRON_SECRET, mesmo padrão dos outros crons.
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
  const since = new Date(Date.now() - INACTIVITY_DAYS * 86_400_000).toISOString();

  const { data: users } = await supabase
    .from("users")
    .select("id, tenant_id, full_name")
    .eq("role", "client")
    .eq("is_active", true)
    .not("tenant_id", "is", null)
    .is("deleted_at", null);

  let notified = 0;
  for (const u of users ?? []) {
    try {
      const [{ count: recentActivity }, { data: lastReminder }] = await Promise.all([
        supabase
          .from("atividades_whatsapp")
          .select("id", { count: "exact", head: true })
          .eq("user_id", u.id)
          .gte("created_at", since),
        supabase
          .from("notifications")
          .select("sent_at")
          .eq("user_id", u.id)
          .eq("type", "reminder")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (recentActivity && recentActivity > 0) continue;
      if (lastReminder?.sent_at && lastReminder.sent_at > since) continue;

      const payload = {
        title: "Assessor 24h",
        body: "Faz um tempo que você não gera nada por aqui — que tal pedir uma matéria ou um requerimento agora?",
        data: { url: "/hoje" },
      };
      const { sent } = await sendPushToUser(supabase, u.id, payload);
      await supabase.from("notifications").insert({
        tenant_id: u.tenant_id,
        user_id: u.id,
        type: "reminder",
        title: payload.title,
        body: payload.body,
        channel: "web_push",
        data: payload.data,
        sent_at: sent > 0 ? new Date().toISOString() : null,
      });
      if (sent > 0) notified += 1;
    } catch (e) {
      await supabase.from("system_errors").insert({
        tenant_id: u.tenant_id,
        scope: "job",
        message: e instanceof Error ? e.message : "erro no nudge de inatividade",
        context: { user_id: u.id },
      });
    }
  }

  return NextResponse.json({ ok: true, notified });
}

export const GET = handle;
export const POST = handle;
