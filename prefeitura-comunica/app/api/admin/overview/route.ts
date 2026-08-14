import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { prefeituras, releases, secretarios } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { unauthorized, forbidden } from "@/lib/http";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.papel !== "admin") return forbidden();

  const [prefs, rel, secs] = await Promise.all([
    db.select().from(prefeituras).orderBy(asc(prefeituras.nome)),
    db.select({ prefeituraId: releases.prefeituraId, status: releases.status }).from(releases),
    db.select({ prefeituraId: secretarios.prefeituraId, ativo: secretarios.ativo }).from(secretarios),
  ]);

  const statsFor = (id: string) => {
    const rs = rel.filter((r) => r.prefeituraId === id);
    const ss = secs.filter((s) => s.prefeituraId === id);
    const count = (st: string) => rs.filter((r) => r.status === st).length;
    return {
      total: rs.length,
      pendente: count("pendente"),
      revisao: count("revisao"),
      aprovado: count("aprovado"),
      publicado: count("publicado"),
      aguardando: count("aguardando"),
      secretarios: ss.length,
      secretariosAtivos: ss.filter((s) => s.ativo).length,
    };
  };

  return NextResponse.json({
    prefeituras: prefs.map((p) => ({ ...p, stats: statsFor(p.id) })),
    totals: {
      prefeituras: prefs.length,
      releases: rel.length,
      publicados: rel.filter((r) => r.status === "publicado").length,
      secretarios: secs.length,
    },
  });
}
