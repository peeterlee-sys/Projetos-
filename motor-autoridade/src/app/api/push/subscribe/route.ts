import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

/** Registra o dispositivo do usuário para Web Push (respeita RLS). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.tenant_id) return NextResponse.json({ error: "sem tenant" }, { status: 400 });

  let sub: z.infer<typeof schema>;
  try {
    sub = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "inscrição inválida" }, { status: 400 });
  }

  const { error } = await supabase.from("notification_devices").upsert(
    {
      tenant_id: profile.tenant_id,
      user_id: user.id,
      platform: "web",
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: request.headers.get("user-agent") ?? null,
      is_active: true,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** Remove a inscrição (desativa). */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (endpoint) {
    await supabase
      .from("notification_devices")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);
  }
  return NextResponse.json({ ok: true });
}
