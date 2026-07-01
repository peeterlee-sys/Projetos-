"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SairButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
      title="Sair"
    >
      <LogOut size={14} /> Sair
    </button>
  );
}
