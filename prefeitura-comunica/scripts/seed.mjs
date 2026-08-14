// Cria as tabelas e popula o banco com dados de demonstração.
// Uso: node scripts/seed.mjs
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const db = createClient({
  url: process.env.DATABASE_URL ?? "file:./local.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const S = (n) => Math.floor(Date.now() / 1000) - n; // agora - n segundos
const id = () => randomUUID();

const DDL = [
  `CREATE TABLE IF NOT EXISTS prefeituras (
    id text PRIMARY KEY, nome text NOT NULL, municipio text NOT NULL,
    uf text NOT NULL DEFAULT 'SC', slug text NOT NULL UNIQUE,
    ativo integer NOT NULL DEFAULT 1, criado_em integer NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY, prefeitura_id text REFERENCES prefeituras(id),
    nome text NOT NULL, email text NOT NULL UNIQUE, senha_hash text NOT NULL,
    papel text NOT NULL DEFAULT 'comunicacao', ativo integer NOT NULL DEFAULT 1,
    criado_em integer NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS secretarios (
    id text PRIMARY KEY, prefeitura_id text NOT NULL REFERENCES prefeituras(id),
    nome text NOT NULL, cargo text, secretaria text, telefone text NOT NULL,
    ativo integer NOT NULL DEFAULT 1, criado_em integer NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS contextos (
    id text PRIMARY KEY, prefeitura_id text NOT NULL UNIQUE REFERENCES prefeituras(id),
    prefeito text, vice text, mandato text, lema text, programa text, tom text,
    hashtags text, bairros text, programas text, contexto text,
    modelos text DEFAULT '[]', atualizado_em integer NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS releases (
    id text PRIMARY KEY, prefeitura_id text NOT NULL REFERENCES prefeituras(id),
    secretario_id text REFERENCES secretarios(id), secretario_nome text, secretaria text,
    origem text DEFAULT 'audio', transcricao text, headline text, release_body text,
    instagram text, status text NOT NULL DEFAULT 'pendente', flag integer DEFAULT 0,
    aguardando integer DEFAULT 0, ask_msg text, caso text, publicado_em integer,
    criado_em integer NOT NULL DEFAULT (unixepoch()), atualizado_em integer NOT NULL DEFAULT (unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS fotos (
    id text PRIMARY KEY, release_id text NOT NULL REFERENCES releases(id),
    prefeitura_id text NOT NULL REFERENCES prefeituras(id), url text, legenda text,
    criado_em integer NOT NULL DEFAULT (unixepoch()))`,
];

async function run(sql, args = []) {
  await db.execute({ sql, args });
}

async function main() {
  for (const ddl of DDL) await run(ddl);

  // limpa (dev) — ordem filho -> pai
  for (const t of ["fotos", "releases", "contextos", "secretarios", "users", "prefeituras"]) {
    await run(`DELETE FROM ${t}`);
  }

  // ---------- Prefeituras ----------
  const itapema = id();
  const balneario = id();
  await run(`INSERT INTO prefeituras (id,nome,municipio,uf,slug,ativo,criado_em) VALUES (?,?,?,?,?,1,?)`,
    [itapema, "Prefeitura de Itapema", "Itapema", "SC", "itapema", S(0)]);
  await run(`INSERT INTO prefeituras (id,nome,municipio,uf,slug,ativo,criado_em) VALUES (?,?,?,?,?,1,?)`,
    [balneario, "Prefeitura de Balneário Camboriú", "Balneário Camboriú", "SC", "balneario-camboriu", S(0)]);

  // ---------- Usuários ----------
  const mkUser = async (prefId, nome, email, senha, papel) => {
    await run(`INSERT INTO users (id,prefeitura_id,nome,email,senha_hash,papel,ativo,criado_em) VALUES (?,?,?,?,?,?,1,?)`,
      [id(), prefId, nome, email, await bcrypt.hash(senha, 10), papel, S(0)]);
  };
  await mkUser(null, "Peeter Grando", "peeterlee@gmail.com", "admin123", "admin");
  await mkUser(itapema, "Comunicação Itapema", "comunicacao@itapema.sc.gov.br", "itapema123", "comunicacao");
  await mkUser(balneario, "Comunicação BC", "comunicacao@balneario.sc.gov.br", "balneario123", "comunicacao");

  // ---------- Secretários ----------
  const sec = {};
  const mkSec = async (key, prefId, nome, cargo, secretaria, tel, ativo = 1) => {
    const sid = id();
    sec[key] = { id: sid, nome, secretaria };
    await run(`INSERT INTO secretarios (id,prefeitura_id,nome,cargo,secretaria,telefone,ativo,criado_em) VALUES (?,?,?,?,?,?,?,?)`,
      [sid, prefId, nome, cargo, secretaria, tel, ativo, S(0)]);
  };
  await mkSec("marcos", itapema, "Marcos Ventura", "Secretário de Obras", "Obras", "5547996611001");
  await mkSec("claudia", itapema, "Cláudia Reis", "Secretária de Assistência Social", "Assistência Social", "5547996611002");
  await mkSec("rafael", itapema, "Rafael Diniz", "Secretário de Turismo", "Turismo", "5547996611003");
  await mkSec("juliana", itapema, "Juliana Prado", "Secretária de Saúde", "Saúde", "5547996611004");
  await mkSec("pedro", itapema, "Pedro Anselmo", "Secretário de Esportes", "Esportes", "5547996611005");
  await mkSec("bianca", itapema, "Bianca Lorena", "Secretária de Educação", "Educação", "5547996611006");
  await mkSec("helena", itapema, "Helena Costa", "Secretária de Cultura", "Cultura", "5547996611007");
  await mkSec("ricardo", itapema, "Ricardo Amaral", "Secretário de Fazenda", "Fazenda", "5547996611008", 0);
  await mkSec("andre", balneario, "André Salles", "Secretário de Mobilidade", "Mobilidade", "5547997722001");
  await mkSec("leticia", balneario, "Letícia Moura", "Secretária de Meio Ambiente", "Meio Ambiente", "5547997722002");
  await mkSec("fernando", balneario, "Fernando Bittencourt", "Secretário de Turismo", "Turismo", "5547997722003");

  // ---------- Contexto (anamnese) ----------
  const mkCtx = async (prefId, c) => {
    await run(`INSERT INTO contextos (id,prefeitura_id,prefeito,vice,mandato,lema,programa,tom,hashtags,bairros,programas,contexto,modelos,atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id(), prefId, c.prefeito, c.vice, c.mandato, c.lema, c.programa, c.tom, c.hashtags, c.bairros, c.programas, c.contexto, JSON.stringify(c.modelos ?? []), S(0)]);
  };
  await mkCtx(itapema, {
    prefeito: "Antônio Mendes", vice: "Regina Foppa", mandato: "2025–2028",
    lema: "Itapema para todos", programa: "Plano Itapema 2030",
    tom: "Formal institucional, em terceira pessoa, sem sensacionalismo",
    hashtags: "#Itapema #PrefeituraDeItapema", telComunicacao: "",
    bairros: "Centro\nMeia Praia\nMorretes\nTabuleiro\nAreal\nIlhota\nCanto da Praia",
    programas: "Itapema Mais Asfalto\nAbrigo de Inverno\nFestival de Verão da Meia Praia\nMutirões de Saúde nas UBSs",
    contexto: "Itapema é um município turístico do litoral norte de Santa Catarina, com forte sazonalidade no verão por causa da Meia Praia. A gestão prioriza mobilidade urbana, saúde, assistência social e turismo. Não usar adjetivos superlativos e nunca inventar números ou datas que não estejam na mensagem do secretário.",
    modelos: [
      "Prefeitura de Itapema conclui pavimentação de mais um trecho da Estrada Geral do Areal\n\nA Prefeitura de Itapema, por meio da Secretaria de Obras, concluiu a pavimentação asfáltica de mais um trecho da Estrada Geral do Areal. A intervenção integra o programa de mobilidade urbana da gestão.\n\n\"Cada trecho entregue representa mais qualidade de vida para quem vive no interior do município\", destacou o secretário de Obras.",
      "Prefeitura de Itapema abre matrículas da rede municipal de ensino\n\nA Prefeitura de Itapema, por meio da Secretaria de Educação, abre o período de matrículas da rede municipal, com inscrições online e presenciais nas unidades escolares.\n\n\"Garantir a vaga de cada criança na escola é a nossa prioridade\", afirmou a secretária de Educação.",
    ],
  });
  await mkCtx(balneario, {
    prefeito: "Carlos Beninca", vice: "Marina Duarte", mandato: "2025–2028",
    lema: "BC cada vez melhor", programa: "BC do Futuro",
    tom: "Formal institucional, em terceira pessoa",
    hashtags: "#BalnearioCamboriu #PrefeituraDeBalneario",
    bairros: "Centro\nBarra\nPioneiros\nNações\nEstados\nAvenida Central",
    programas: "Faixa Exclusiva de Ônibus\nColeta de Recicláveis na Orla\nVerão BC",
    contexto: "Balneário Camboriú é um dos principais destinos turísticos do Sul do Brasil, com verticalização intensa e grande fluxo no verão. Prioridades: mobilidade, meio ambiente e turismo.",
    modelos: [
      "Prefeitura de Balneário Camboriú implanta faixa exclusiva para ônibus na Terceira Avenida\n\nA Prefeitura de Balneário Camboriú, por meio da Secretaria de Mobilidade, implantou uma faixa exclusiva para ônibus na Terceira Avenida, para melhorar a fluidez do transporte coletivo na alta temporada.\n\n\"Priorizar o transporte coletivo é priorizar quem mais precisa se locomover na cidade\", destacou o secretário de Mobilidade.",
    ],
  });

  // ---------- Releases + fotos ----------
  const mkRel = async (prefId, secKey, r) => {
    const rid = id();
    const s = sec[secKey];
    await run(`INSERT INTO releases
      (id,prefeitura_id,secretario_id,secretario_nome,secretaria,origem,transcricao,headline,release_body,instagram,status,flag,aguardando,ask_msg,caso,publicado_em,criado_em,atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [rid, prefId, s.id, s.nome, s.secretaria, r.origem ?? "audio", r.transcricao ?? null, r.headline ?? null,
       r.release ?? null, r.instagram ?? null, r.status ?? "pendente", r.flag ? 1 : 0, r.aguardando ? 1 : 0,
       r.askMsg ?? null, r.caso ?? null, r.publicadoEm ?? null, r.criadoEm, r.criadoEm]);
    for (const f of r.fotos ?? []) {
      await run(`INSERT INTO fotos (id,release_id,prefeitura_id,url,legenda,criado_em) VALUES (?,?,?,?,?,?)`,
        [id(), rid, prefId, f.url ?? null, f.legenda ?? null, r.criadoEm]);
    }
  };

  await mkRel(itapema, "marcos", {
    criadoEm: S(6 * 60), status: "pendente",
    transcricao: "Oi, aqui é o Marcos das Obras. Concluímos a pavimentação de mais um trecho da Estrada Geral do Areal, cerca de 800 metros de asfalto novo. Pode divulgar.",
    headline: "Mais um trecho da Estrada Geral do Areal recebe pavimentação asfáltica",
    release: "A Prefeitura de Itapema, por meio da Secretaria de Obras, concluiu a pavimentação de mais um trecho da Estrada Geral do Areal, com aproximadamente 800 metros de asfalto novo. A intervenção integra o programa municipal de mobilidade urbana.\n\nO trecho melhora as condições de tráfego e a segurança dos moradores da região.\n\n\"Cada trecho entregue representa mais qualidade de vida para quem vive no interior do município\", destacou o secretário de Obras, Marcos Ventura.",
    instagram: "🚧 Mais asfalto novo em Itapema! Concluímos a pavimentação de mais um trecho da Estrada Geral do Areal. 🛣️💚\n\n#Itapema #PrefeituraDeItapema #Obras #Mobilidade",
    fotos: [{ legenda: "Trecho pavimentado" }, { legenda: "Equipe e maquinário no local" }],
  });
  await mkRel(itapema, "claudia", {
    criadoEm: S(26 * 60), status: "pendente",
    transcricao: "É a Cláudia da Assistência. Com a frente fria, vamos ativar o Abrigo de Inverno a partir de amanhã, no ginásio do centro, com refeição e cobertor.",
    headline: "Prefeitura ativa Abrigo de Inverno para acolher pessoas em situação de rua",
    release: "Diante da chegada de uma frente fria ao litoral, a Prefeitura de Itapema, por meio da Secretaria de Assistência Social, ativa o Abrigo de Inverno para acolher pessoas em situação de rua durante as noites mais frias.\n\nO espaço funcionará no ginásio do centro e oferecerá pernoite, alimentação e cobertores.\n\n\"Ninguém pode passar frio nas ruas enquanto tivermos como acolher\", afirmou a secretária de Assistência Social, Cláudia Reis.",
    instagram: "❄️ A Prefeitura de Itapema ativou o Abrigo de Inverno! 🏠 Acolhimento, refeição quente e cobertor no ginásio do centro. 🤝\n\n#Itapema #PrefeituraDeItapema #AssistenciaSocial",
  });
  await mkRel(itapema, "rafael", {
    criadoEm: S(60 * 60), status: "revisao", origem: "texto",
    transcricao: "[texto] Fechamos a programação do Festival de Verão da Meia Praia: três fins de semana de shows, praça de alimentação e feira de artesanato. Começa dia 10 de janeiro.",
    headline: "Festival de Verão da Meia Praia terá três fins de semana de shows gratuitos",
    release: "A Prefeitura de Itapema, por meio da Secretaria de Turismo, confirmou a programação do Festival de Verão da Meia Praia, que ocupará a orla com shows gratuitos durante três fins de semana, a partir de 10 de janeiro.\n\nO evento contará com praça de alimentação e feira de artesanato local.\n\n\"O Festival é um convite para o turista viver Itapema e para o morador celebrar a nossa cidade\", destacou o secretário de Turismo, Rafael Diniz.",
    instagram: "🎉 O verão em Itapema vai ferver! 🌊 Festival de Verão da Meia Praia: 3 fins de semana de shows gratuitos. 🎶\n\n#Itapema #PrefeituraDeItapema #Turismo #FestivalDeVerao",
  });
  await mkRel(itapema, "juliana", {
    criadoEm: S(2 * 3600), status: "revisao",
    transcricao: "Juliana da Saúde. Vamos começar o mutirão de consultas oftalmológicas na semana que vem, com foco nos idosos, por agendamento nas UBSs.",
    headline: "Saúde inicia mutirão de consultas oftalmológicas com foco na população idosa",
    release: "A Prefeitura de Itapema, por meio da Secretaria de Saúde, inicia na próxima semana um mutirão de consultas oftalmológicas voltado prioritariamente à população idosa.\n\nOs atendimentos ocorrerão nas Unidades Básicas de Saúde mediante agendamento prévio.\n\n\"Cuidar da visão dos nossos idosos é cuidar da autonomia deles\", afirmou a secretária de Saúde, Juliana Prado.",
    instagram: "👀 Mutirão de consultas oftalmológicas em Itapema, com foco na população idosa. 👵👴 Agende na sua UBS!\n\n#Itapema #PrefeituraDeItapema #Saude",
  });
  await mkRel(itapema, "pedro", {
    criadoEm: S(3 * 3600), status: "pendente", flag: true,
    transcricao: "É o Pedro. Teve o jogo lá ontem e foi bom, bastante gente. Depois passo mais detalhe.",
    headline: "Final da Copa Municipal de Futebol reúne torcida no Estádio Municipal",
    release: "A Prefeitura de Itapema, por meio da Secretaria de Esportes, realizou a final da Copa Municipal de Futebol, que reuniu grande público no Estádio Municipal.\n\n[Detalhes operacionais pendentes — o áudio não trouxe placar, times finalistas nem data. Confirmar com o secretário.]\n\n\"O esporte aproxima a comunidade e revela talentos da nossa cidade\", destacou o secretário de Esportes, Pedro Anselmo. [CITAÇÃO SUGERIDA — validar]",
    instagram: "⚽ Que final! A Copa Municipal de Futebol de Itapema agitou o Estádio Municipal! 🏆 [completar com o campeão]\n\n#Itapema #PrefeituraDeItapema #Esportes",
  });
  await mkRel(itapema, "marcos", {
    criadoEm: S(26 * 3600), status: "aprovado",
    transcricao: "Marcos de novo. Entregamos a reforma da praça do Tabuleiro, com playground, academia ao ar livre e iluminação de LED.",
    headline: "Praça do Tabuleiro é entregue revitalizada com playground e academia ao ar livre",
    release: "A Prefeitura de Itapema, por meio da Secretaria de Obras, entregou a revitalização da praça do bairro Tabuleiro, agora com playground novo, academia ao ar livre e iluminação em LED.\n\n\"Devolver uma praça revitalizada é devolver um espaço de encontro para as famílias\", destacou o secretário de Obras, Marcos Ventura.",
    instagram: "🌳 Praça nova no Tabuleiro! Playground, academia ao ar livre e iluminação de LED. ✨\n\n#Itapema #PrefeituraDeItapema #Obras",
    fotos: [{ legenda: "Praça revitalizada" }],
  });
  await mkRel(itapema, "bianca", {
    criadoEm: S(28 * 3600), status: "publicado", publicadoEm: S(27 * 3600),
    transcricao: "Bianca da Educação. As matrículas da rede municipal para 2026 abrem na segunda, dia 15, até o fim do mês, online ou presencial.",
    headline: "Matrículas da rede municipal de ensino para 2026 começam na próxima segunda",
    release: "A Prefeitura de Itapema, por meio da Secretaria de Educação, abre na próxima segunda-feira, dia 15, o período de matrículas da rede municipal de ensino para 2026, com inscrições até o fim do mês.\n\n\"Garantir a vaga de cada criança na escola é a nossa prioridade\", afirmou a secretária de Educação, Bianca Lorena.",
    instagram: "🎒 Matrículas 2026 abertas! A partir de segunda (15), garanta a vaga na rede municipal de Itapema. 📚\n\n#Itapema #PrefeituraDeItapema #Educacao",
  });
  await mkRel(itapema, "helena", {
    criadoEm: S(12 * 60), status: "aguardando", aguardando: true, origem: "foto", caso: "sem-contexto",
    askMsg: "📷 Recebi sua foto, Helena! Sobre qual assunto é? Me manda um áudio ou texto explicando a ação da secretaria, que eu preparo o release com a foto junto. 🎙️",
    fotos: [{ legenda: "Foto recebida" }],
  });
  await mkRel(itapema, "rafael", {
    criadoEm: S(20 * 60), status: "aguardando", aguardando: true, origem: "foto", caso: "fora-janela",
    askMsg: "📷 Recebi sua foto, Rafael! Como já faz um tempo desde a sua última mensagem, me confirma: essa foto é sobre o Festival de Verão da Meia Praia ou é de um novo assunto? 🙂",
    fotos: [{ legenda: "Foto recebida" }],
  });

  await mkRel(balneario, "andre", {
    criadoEm: S(40 * 60), status: "pendente",
    transcricao: "André da Mobilidade. Vamos implantar faixa exclusiva de ônibus na Terceira Avenida a partir de 1º de dezembro.",
    headline: "Terceira Avenida ganha faixa exclusiva de ônibus para o verão",
    release: "A Prefeitura de Balneário Camboriú, por meio da Secretaria de Mobilidade, implantará uma faixa exclusiva para ônibus na Terceira Avenida, com o objetivo de melhorar a fluidez do transporte coletivo durante a alta temporada. A medida passa a valer em 1º de dezembro.\n\n\"Priorizar o transporte coletivo é priorizar quem mais precisa se locomover na cidade\", destacou o secretário de Mobilidade, André Salles.",
    instagram: "🚌 Novidade pro verão de BC! Faixa exclusiva de ônibus na Terceira Avenida a partir de 1º de dezembro. 🚦💙\n\n#BalnearioCamboriu #PrefeituraDeBalneario #Mobilidade",
    fotos: [{ legenda: "Terceira Avenida" }],
  });
  await mkRel(balneario, "leticia", {
    criadoEm: S(5 * 3600), status: "revisao", origem: "texto",
    transcricao: "[texto] Vamos lançar recolhimento de recicláveis na orla, com pontos a cada 500 metros, começando neste fim de semana.",
    headline: "Programa amplia coleta de recicláveis na orla com novos pontos a cada 500 metros",
    release: "A Prefeitura de Balneário Camboriú, por meio da Secretaria de Meio Ambiente, lança um programa de ampliação da coleta de recicláveis na orla, com novos pontos a cada 500 metros ao longo da praia, a partir deste fim de semana.\n\n\"Uma praia limpa é responsabilidade de todos, e a prefeitura faz a sua parte ampliando a estrutura\", afirmou a secretária de Meio Ambiente, Letícia Moura.",
    instagram: "♻️ BC mais limpa neste verão! Novos pontos de coleta de recicláveis a cada 500m na orla. 🏖️💚\n\n#BalnearioCamboriu #PrefeituraDeBalneario #MeioAmbiente",
  });

  const [{ n: nRel }] = (await db.execute("SELECT COUNT(*) as n FROM releases")).rows;
  const [{ n: nSec }] = (await db.execute("SELECT COUNT(*) as n FROM secretarios")).rows;
  console.log(`\n✅ Seed concluído. Prefeituras: 2 · Secretários: ${nSec} · Releases: ${nRel}\n`);
  console.log("Logins de demonstração:");
  console.log("  ADMIN        peeterlee@gmail.com            / admin123");
  console.log("  Itapema      comunicacao@itapema.sc.gov.br  / itapema123");
  console.log("  Bal. Camb.   comunicacao@balneario.sc.gov.br / balneario123\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
