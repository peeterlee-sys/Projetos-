import { brand } from "@/lib/brand";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import Teleprompter from "./Teleprompter";

export const metadata: Metadata = {
  title: `Teleprompter — ${brand.name}`,
};

/**
 * Teleprompter avulso: o usuário cola ou digita o próprio roteiro.
 *
 * O "voltar" sai da marca porque `/hoje` é rota do Take e não existe no
 * Assessor 24h, onde a tela inicial é a lista de documentos.
 */
export default async function TeleprompterPage() {
  await requireUser();
  return (
    <Teleprompter
      backHref={brand.home}
      backLabel={brand.id === "assessor24h" ? "Atividade" : "Hoje"}
    />
  );
}
