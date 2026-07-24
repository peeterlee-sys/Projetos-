"use client";

/**
 * Estado de erro (tela 23 do MVP): mensagem calma + tentar novamente.
 * Renderizado quando uma página do app lança durante o carregamento.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Conexão</p>
      <div className="my-5 flex h-24 w-24 items-center justify-center rounded-full bg-danger-600/10">
        <span className="text-3xl">📶</span>
      </div>
      <h1 className="font-serif text-2xl leading-tight text-ink-900">
        Não conseguimos carregar sua pauta.
      </h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        Sua conexão parece instável. Seus dados e sua sequência estão seguros.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center justify-center rounded-full bg-brand-700 px-6 py-4 text-[15px] font-medium text-sand-50 transition hover:bg-brand-800 active:scale-[0.98]"
      >
        Tentar novamente
      </button>
    </main>
  );
}
