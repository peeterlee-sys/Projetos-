import Link from "next/link";
import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8 text-center">
        <h1 className="font-serif text-3xl text-brand-700">Criar conta</h1>
        <p className="mt-2 text-sm text-ink-500">
          Comece hoje. Seu radar já começa a trabalhar.
        </p>
      </header>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-ink-500">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-brand-700 underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
