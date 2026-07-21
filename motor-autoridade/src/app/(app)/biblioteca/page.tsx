import { Card } from "@/components/ui";

// Biblioteca completa (busca/filtros) entra na Fase 3.
export default function BibliotecaPage() {
  return (
    <main className="px-5 pt-8">
      <h1 className="mb-6 font-serif text-3xl text-ink-900">Biblioteca</h1>
      <Card className="text-center">
        <p className="text-sm text-ink-500">
          Aqui vão ficar seus conteúdos recebidos, produzidos e publicados —
          com busca e filtros. Chega na próxima fase.
        </p>
      </Card>
    </main>
  );
}
