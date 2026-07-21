import { Card } from "@/components/ui";

// Progresso, sequências e comparativos entram na Fase 5.
export default function ProgressoPage() {
  return (
    <main className="px-5 pt-8">
      <h1 className="mb-6 font-serif text-3xl text-ink-900">Progresso</h1>
      <Card className="text-center">
        <p className="text-sm text-ink-500">
          Sua evolução — publicações por semana, sequência atual e melhor sequência —
          aparece aqui quando o acompanhamento entrar no ar.
        </p>
      </Card>
    </main>
  );
}
