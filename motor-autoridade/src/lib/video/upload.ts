/**
 * Upload de vídeo com progresso real.
 *
 * O `upload()` do cliente Supabase usa `fetch`, que não informa quanto já
 * subiu. Num vídeo de 55MB em rede de celular isso são minutos de tela parada
 * dizendo só "enviando" — o vereador acha que travou e fecha o app. O XHR é a
 * única forma de ter o evento de progresso no navegador.
 *
 * Vai direto no endpoint de Storage com o token da sessão, então a RLS do
 * bucket continua valendo igual ao caminho do SDK.
 */

export type Progresso = { enviado: number; total: number; porcento: number };

/** Sobe o arquivo e chama `aoProgredir` a cada pedaço confirmado. */
export function subirComProgresso(opcoes: {
  supabaseUrl: string;
  accessToken: string;
  bucket: string;
  caminho: string;
  arquivo: File;
  aoProgredir: (p: Progresso) => void;
  sinal?: AbortSignal;
}): Promise<void> {
  const { supabaseUrl, accessToken, bucket, caminho, arquivo, aoProgredir, sinal } = opcoes;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${bucket}/${caminho}`, true);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "video/mp4");
    // Reenvio do mesmo vídeo não pode falhar por já existir o caminho.
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      aoProgredir({
        enviado: e.loaded,
        total: e.total,
        porcento: Math.round((e.loaded / e.total) * 100),
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(mensagemDeErro(xhr.status, xhr.responseText, arquivo.size)));
    };

    xhr.onerror = () => reject(new Error("A conexão caiu durante o envio. Tente de novo."));
    xhr.ontimeout = () => reject(new Error("O envio demorou demais. Tente numa rede melhor."));

    if (sinal) {
      sinal.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.onabort = () => reject(new Error("Envio cancelado."));
    }

    xhr.send(arquivo);
  });
}

/**
 * Traduz a falha do Storage para algo que o vereador entenda e possa agir.
 *
 * O 413 é o que mais aparece na prática: o bucket tem limite por arquivo
 * (50MB na configuração padrão) e o vídeo de celular passa disso fácil.
 */
export function mensagemDeErro(status: number, corpo: string, tamanhoBytes: number): string {
  const mb = (tamanhoBytes / 1024 / 1024).toFixed(0);
  if (status === 413) {
    return `O vídeo tem ${mb}MB e passa do limite por arquivo do servidor. Grave um trecho menor ou peça para aumentar o limite do bucket.`;
  }
  if (status === 401 || status === 403) {
    return "Sua sessão expirou durante o envio. Entre de novo e repita.";
  }
  let detalhe = "";
  try {
    const j = JSON.parse(corpo) as { message?: string; error?: string };
    detalhe = j.message || j.error || "";
  } catch {
    detalhe = "";
  }
  return detalhe ? `Falha ao enviar o vídeo: ${detalhe}` : `Falha ao enviar o vídeo (erro ${status}).`;
}

/**
 * Estimativa grosseira de quanto o envio vai levar, para a tela poder avisar
 * antes em vez de deixar o vereador adivinhando.
 *
 * Usa 4 Mbps de subida, que é o que se consegue num 4G comum no Brasil — a
 * ideia é não prometer rápido demais.
 */
export function estimarSegundosDeEnvio(tamanhoBytes: number, mbpsSubida = 4): number {
  const megabits = (tamanhoBytes * 8) / 1_000_000;
  return Math.max(5, Math.round(megabits / mbpsSubida));
}

/** "1 min 30 s" lê melhor que "90 s" numa espera longa. */
export function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return resto ? `${min} min ${resto}s` : `${min} min`;
}
