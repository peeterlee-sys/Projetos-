import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruah CRM | Pipeline de Vendas",
  description: "Pipeline de vendas da Ruah (OOH/DOOH) com lembretes e integracao via WhatsApp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
