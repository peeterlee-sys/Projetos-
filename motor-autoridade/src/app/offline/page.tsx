export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-2xl text-brand-700">Você está offline</h1>
      <p className="mt-2 text-sm text-ink-500">
        Sem conexão no momento. Assim que a internet voltar, seu radar continua de onde parou.
      </p>
    </main>
  );
}
