import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { ContentWorkspace } from "./ContentWorkspace";

export default async function ConteudoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("content_items")
    .select("id, title, theme, status")
    .eq("id", id)
    .maybeSingle();
  if (!item) notFound();

  const { data: formats } = await supabase
    .from("content_formats")
    .select("format, payload, status")
    .eq("content_item_id", id);

  const byFormat: Record<string, unknown> = {};
  for (const f of formats ?? []) byFormat[f.format] = f.payload;

  return (
    <ContentWorkspace
      itemId={item.id}
      title={item.title}
      theme={item.theme}
      status={item.status}
      generated={byFormat}
    />
  );
}
