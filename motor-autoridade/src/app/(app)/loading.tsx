/**
 * Esqueleto de carregamento exibido instantaneamente ao navegar entre páginas
 * (enquanto o servidor busca os dados). Melhora a percepção de velocidade.
 */
export default function Loading() {
  return (
    <main className="animate-pulse px-5 pt-8">
      <div className="mb-6 space-y-2">
        <div className="h-4 w-32 rounded-full bg-sand-200" />
        <div className="h-8 w-56 rounded-lg bg-sand-200" />
      </div>
      <div className="mb-5 h-24 rounded-[24px] bg-sand-200" />
      <div className="h-72 rounded-[28px] bg-sand-200" />
    </main>
  );
}
