import {
  Sun,
  BookOpen,
  TrendingUp,
  History,
  Mic,
  Clapperboard,
  User,
  type LucideIcon,
} from "lucide-react";
import { brand } from "@/lib/brand";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Take: o fluxo é produzir conteúdo dentro do app. */
const TAKE: NavItem[] = [
  { href: "/hoje", label: "Hoje", icon: Sun },
  { href: "/biblioteca", label: "Biblioteca", icon: BookOpen },
  { href: "/progresso", label: "Progresso", icon: TrendingUp },
  { href: "/perfil", label: "Perfil", icon: User },
];

/**
 * Assessor 24h: tudo é produzido no WhatsApp, então o app serve para consultar
 * o que já foi gerado — radar, biblioteca e metas do Take não se aplicam.
 *
 * Vídeo e teleprompter são a exceção, e ficam no app porque não cabem no
 * WhatsApp: a Meta só envia arquivo de até 16MB, e um minuto em 1080p já passa
 * disso. No celular o vereador instala como PWA e fecha o ciclo sem sair dali
 * — pede o discurso no WhatsApp, lê na rolagem, grava, corta e legenda.
 */
const ASSESSOR24H: NavItem[] = [
  { href: "/atividade", label: "Documentos", icon: History },
  { href: "/teleprompter", label: "Gravar", icon: Mic },
  { href: "/video", label: "Vídeo", icon: Clapperboard },
  { href: "/perfil", label: "Perfil", icon: User },
];

export const navItems: NavItem[] = brand.id === "assessor24h" ? ASSESSOR24H : TAKE;
