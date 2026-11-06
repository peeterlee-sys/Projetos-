import { requireUser } from "@/lib/auth/session";
import { zapcapConfigured } from "@/lib/zapcap/client";
import { VideoEditor } from "./VideoEditor";

export const metadata = { title: "Vídeo" };

/**
 * Edição do vídeo do vereador pelo painel.
 *
 * O resto do Assessor 24h acontece no WhatsApp, mas vídeo não cabe lá: a Meta
 * só envia arquivo de até 16MB. Aqui o assessor sobe o arquivo inteiro e leva
 * o resultado por link.
 */
export default async function VideoPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-8">
      <h1 className="text-2xl font-semibold text-ink-900">Vídeo</h1>
      <p className="mt-1 mb-6 text-sm text-ink-500">
        Suba o vídeo gravado no celular e receba de volta com as legendas queimadas, pronto para
        publicar.
      </p>
      <VideoEditor configurado={zapcapConfigured()} />
    </main>
  );
}
