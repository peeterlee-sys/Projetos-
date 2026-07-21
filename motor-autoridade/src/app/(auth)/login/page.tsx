import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8 text-center">
        <h1 className="font-serif text-3xl text-brand-700">Motor de Autoridade</h1>
        <p className="mt-2 text-sm text-ink-500">
          Sua presença editorial, do radar à publicação.
        </p>
      </header>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-ink-500">
        Ainda não tem conta?{" "}
        <Link href="/signup" className="font-medium text-brand-700 underline">
          Criar conta
        </Link>
      </p>
    </main>
  );
}
