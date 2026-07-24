import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { ContentWorkspace } from "./ContentWorkspace";

export default async function ConteudoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const { id } = await params;
  const { f } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("content_items")
    .select("id, title, theme, status")
    .eq("id", id)
    .maybeSingle();
  if (!item) notFound();

  const [{ data: formats }, { data: profile }] = await Promise.all([
    supabase.from("content_formats").select("format, payload, status").eq("content_item_id", id),
    supabase
      .from("client_profiles")
      .select("brand_primary, brand_secondary, brand_accent, logo_url")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const byFormat: Record<string, unknown> = {};
  for (const f of formats ?? []) byFormat[f.format] = f.payload;

  const brand = {
    primary: profile?.brand_primary ?? "#1d4a38",
    secondary: profile?.brand_secondary ?? "#faf7f2",
    accent: profile?.brand_accent ?? "#c9a94e",
    logoUrl: profile?.logo_url ?? null,
  };

  const validFormats = ["video", "carousel", "post", "story", "linkedin"];
  const initialFormat = f && validFormats.includes(f) ? f : undefined;

  return (
    <ContentWorkspace
      itemId={item.id}
      title={item.title}
      theme={item.theme}
      status={item.status}
      generated={byFormat}
      brand={brand}
      initialFormat={initialFormat}
    />
  );
}
