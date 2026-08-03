import Link from "next/link";
import { SuggestForm } from "./SuggestForm";

export default async function SugerirPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <main className="px-5 pt-8">
      <Link href="/hoje" className="text-sm text-ink-500">
        ← Hoje
      </Link>
      <header className="mb-5 mt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
          Sua pauta
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-ink-900">
          Sobre o que você quer falar?
        </h1>
        <p className="mt-2 text-[15px] text-ink-500">
          Descreva o tema com suas palavras. A gente transforma na sua próxima pauta —
          com o seu tom e o ângulo certo.
        </p>
      </header>

      <SuggestForm error={erro ?? null} />

      <div className="mt-6 rounded-[24px] bg-white p-4 ring-1 ring-sand-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Exemplos
        </p>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-600">
          <li>• O fim das convenções e a preparação para o início da campanha</li>
          <li>• Os bastidores das convenções em SC</li>
          <li>• Um erro que quase todo mundo comete no começo</li>
        </ul>
      </div>
    </main>
  );
}
