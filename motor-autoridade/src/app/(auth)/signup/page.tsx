import Link from "next/link";
import { SignupForm } from "./SignupForm";
import { TakeLogo } from "@/components/brand/TakeLogo";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8 flex flex-col items-center text-center">
        <TakeLogo size={40} />
        <h1 className="mt-4 font-serif text-2xl text-brand-700">Criar sua conta</h1>
        <p className="mt-2 text-sm text-ink-500">
          Comece hoje. Seu radar editorial já começa a trabalhar.
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
