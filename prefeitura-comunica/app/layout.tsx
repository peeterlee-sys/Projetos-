import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Porta Voz — Comunicação",
  description: "Painel da assessoria de comunicação municipal",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">
        {children}
      </body>
    </html>
  );
}
