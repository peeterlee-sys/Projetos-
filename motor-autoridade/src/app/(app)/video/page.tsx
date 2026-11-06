import { requireUser } from "@/lib/auth/session";
import { zapcapConfigured } from "@/lib/zapcap/client";
import { VideoEditor } from "./VideoEditor";

export const metadata = { title: "Vídeo" };

/**
 * Edição do vídeo do vereador pelo painel.
 *
 * O resto do Assessor 24h acontece no WhatsApp, mas vídeo não cabe lá: a Meta
 * só envia arquivo de até 16MB. Aqui o vereador sobe o arquivo inteiro da
 * galeria do celular e leva o resultado por link.
 *
 * A página não depende da chave de legendas: o corte de pausas é ffmpeg
 * nosso e funciona sozinho. Só a legenda fica indisponível sem a chave.
 */
export default async function VideoPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-8">
      <h1 className="text-2xl font-semibold text-ink-900">Vídeo</h1>
      <p className="mt-1 mb-6 text-sm text-ink-500">
        Escolha o vídeo da galeria do celular. O sistema corta as pausas e devolve pronto para
        publicar.
      </p>
      <VideoEditor legendasDisponiveis={zapcapConfigured()} />
    </main>
  );
}
