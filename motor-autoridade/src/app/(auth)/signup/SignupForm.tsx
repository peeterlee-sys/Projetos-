"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button, Field, Input } from "@/components/ui";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 8) {
      setError("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Se a confirmação por e-mail estiver desativada, já há sessão.
    if (data.session) {
      router.replace("/onboarding");
      router.refresh();
    } else {
      setInfo("Confirme seu e-mail para ativar a conta.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nome">
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Como quer ser chamado(a)"
        />
      </Field>
      <Field label="E-mail">
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
        />
      </Field>
      <Field label="Senha" hint="Mínimo de 8 caracteres.">
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}
      {info ? <p className="text-sm text-brand-700">{info}</p> : null}
      <Button type="submit" full disabled={loading}>
        {loading ? "Criando…" : "Criar conta"}
      </Button>
    </form>
  );
}
