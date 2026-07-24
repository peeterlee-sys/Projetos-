import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { TakeLogo, TakeMark } from "@/components/brand/TakeLogo";

/**
 * Landing pública do Take. Visitante deslogado vê a apresentação; usuário
 * logado é levado direto para o app.
 */
export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/hoje");

  const steps = [
    {
      title: "Pauta do dia",
      body: "Todo dia útil, seu editor-chefe decide sobre o que vale a pena falar — no seu tom, para o seu público.",
    },
    {
      title: "Conteúdo em 5 formatos",
      body: "Roteiro de vídeo, carrossel, post, story e LinkedIn gerados com a sua cara, a partir de uma única pauta.",
    },
    {
      title: "Grave e publique",
      body: "Teleprompter para gravar, legenda pronta para copiar e acompanhamento da sua meta da semana.",
    },
  ];

  return (
    <main className="min-h-dvh bg-sand-50">
      {/* Cabeçalho */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <TakeLogo size={34} />
        <div className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-full px-4 py-2 text-ink-700 hover:bg-sand-100">
            Entrar
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-brand-700 px-4 py-2 text-sand-50 transition hover:bg-brand-800"
          >
            Criar conta
          </Link>
        </div>
      </header>

      {/* Herói */}
      <section className="mx-auto max-w-3xl px-6 pb-16 pt-12 text-center sm:pt-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">
          Seu editor-chefe inteligente
        </p>
        <h1 className="mt-4 font-serif text-4xl leading-[1.1] text-brand-700 sm:text-6xl">
          Autoridade se constrói
          <br />
          publicando todo dia.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-700">
          O Take entrega a pauta certa por dia, transforma em conteúdo com a sua voz e te leva da
          ideia à publicação — sem depender de inspiração.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="w-full rounded-full bg-brand-700 px-6 py-3.5 text-center text-[15px] font-medium text-sand-50 transition hover:bg-brand-800 sm:w-auto"
          >
            Começar agora
          </Link>
          <Link
            href="/login"
            className="w-full rounded-full bg-sand-100 px-6 py-3.5 text-center text-[15px] font-medium text-ink-900 transition hover:bg-sand-200 sm:w-auto"
          >
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* Como funciona */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={i} className="rounded-2xl bg-white/70 p-6 ring-1 ring-sand-200">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700/10 font-serif text-brand-700">
                {i + 1}
              </span>
              <h3 className="mt-4 font-serif text-xl text-ink-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Chamada final */}
      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <div className="rounded-3xl bg-brand-700 px-6 py-12 text-sand-50">
          <TakeMark size={44} className="mx-auto" />
          <h2 className="mt-5 font-serif text-3xl">Pronto para virar referência?</h2>
          <p className="mx-auto mt-3 max-w-md text-sand-200">
            Crie sua conta e responda a anamnese editorial. Em minutos, seu DNA de conteúdo está
            pronto.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-full bg-sand-50 px-6 py-3.5 text-[15px] font-medium text-brand-700 transition hover:bg-white"
          >
            Criar minha conta
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 pb-10 text-center text-xs text-ink-400">
        Take · Seu editor-chefe inteligente
      </footer>
    </main>
  );
}
