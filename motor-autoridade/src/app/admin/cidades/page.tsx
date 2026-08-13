import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { CityContextEditor, type CityContext } from "./CityContextEditor";
import { brand } from "@/lib/brand";
import { parseAutoridades } from "@/lib/autoridades";

/**
 * Biblioteca de contexto por cidade — o admin escreve uma vez por cidade/UF
 * e todo vereador de lá herda. Substitui o campo que antes era preenchido
 * (mal) pelo próprio vereador na anamnese.
 */
export default async function CidadesPage() {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) redirect(brand.home);

  const supabase = await createClient();
  const { data } = await supabase
    .from("city_contexts")
    .select("id, city, state, context, autoridades, updated_at")
    .order("city", { ascending: true })
    .limit(500);

  const items: CityContext[] = (data ?? []).map((c) => ({
    id: c.id,
    city: c.city,
    state: c.state,
    context: c.context,
    autoridades: parseAutoridades(c.autoridades),
    updatedAt: c.updated_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-ink-900">Cidades</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          O contexto da cidade não é mais preenchido pelo vereador — é você quem escreve, uma vez
          por cidade. Cada vereador dessa cidade herda automaticamente: quem ainda vai responder a
          anamnese recebe direto; quem já respondeu é atualizado assim que você salva aqui.
        </p>
      </div>
      <CityContextEditor initial={items} />
    </div>
  );
}
