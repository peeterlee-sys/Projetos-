import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { SourcesEditor, type SegmentSource } from "./SourcesEditor";

export default async function FontesPage() {
  const user = await getSessionUser();
  // Somente super_admin edita; admin comum só visualiza.
  const canEdit = user?.role === "super_admin";
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) redirect("/hoje");

  const supabase = await createClient();
  const { data } = await supabase
    .from("segment_sources")
    .select("id, segment, name, url, kind, priority, is_active")
    .order("segment", { ascending: true })
    .order("priority", { ascending: true })
    .limit(500);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-ink-900">Fontes por segmento</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Esta é a <strong>matriz base</strong> consultada pelo radar de cada segmento. Ela é o
          piso: as fontes que cada cliente informa na anamnese têm prioridade maior e são
          consultadas primeiro. Aqui você mantém a rede de segurança do mercado.
        </p>
      </div>
      <SourcesEditor initial={(data ?? []) as SegmentSource[]} canEdit={canEdit} />
    </div>
  );
}
