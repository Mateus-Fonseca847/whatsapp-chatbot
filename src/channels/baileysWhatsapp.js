import fs from "node:fs";
import path from "node:path";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  isPnUser,
  isLidUser,
  getContentType,
  normalizeMessageContent
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import qrcodeImagem from "qrcode";

import {
  processarMensagem,
  montarLegendaProduto,
  achatarResposta
} from "../bot/conversation.js";

// Terceiro canal, ao lado de Meta e Twilio. Este conecta direto ao WhatsApp Web, como um
// aparelho pareado: não passa por conta comercial nem por aprovação da Meta, então é o
// único que funciona hoje, sem restrição de país. A lógica de conversa é a mesma dos
// outros dois — muda só o transporte.

// Credenciais da sessão pareada. Quem tem essa pasta tem acesso à conta: fica fora do git.
const PASTA_AUTH = path.resolve("baileys_auth");

// O desenho em texto depende do terminal renderizar os blocos direito, o que no Windows
// nem sempre acontece. O PNG é o plano B: abre em qualquer visualizador de imagem.
const ARQUIVO_QR = path.resolve("baileys-qr.png");

// Quanto tempo sem evento de histórico pra considerar a sincronização encerrada. Ao
// parear, o WhatsApp despeja as conversas antigas em rajada; o silêncio marca o fim.
const SILENCIO_ATE_PRONTO_MS = 3000;

// O logger padrão do Baileys é um pino em nível info, que despeja JSON no terminal e
// atrapalha a leitura do QR code. Como só nos interessam avisos e erros, passamos um
// logger mínimo com a mesma interface (a lib chama child/trace/debug/info/warn/error).
// A lib chama no estilo pino: logger.warn({ contexto }, "mensagem"). Imprimir os dois
// espalha objetos multilinha pelo terminal; o que interessa é a mensagem.
function mensagemDoLog(args) {
  const texto = args.find((arg) => typeof arg === "string");
  if (texto) return texto;

  // Sem mensagem legível: resume o objeto numa linha só
  try {
    return JSON.stringify(args[0]);
  } catch {
    return String(args[0]);
  }
}

const silencioso = {
  level: "warn",
  child: () => silencioso,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: (...args) => console.warn("[baileys]", mensagemDoLog(args)),
  error: (...args) => console.error("[baileys]", mensagemDoLog(args))
};

// "5524974012668@s.whatsapp.net" -> "5524974012668".
// Mesmo formato dos outros canais, pra que a mesma pessoa caia na mesma sessão do
// sessionStore independentemente de por onde falou.
export function normalizarJid(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
}

// Resposta fixa por tipo de mídia: sem IA, sem custo de API. O cliente que manda uma
// figurinha não fez um pedido — só precisa saber que o bot não entende aquilo ainda.
const AVISO_SO_TEXTO =
  "Por enquanto só consigo entender mensagens de texto — pode escrever o que você procura?";

// Só os tipos que representam algo que o CLIENTE mandou de propósito. Reação, evento de
// protocolo e afins também chegam sem texto, e responder a eles seria falar sozinho.
const RESPOSTAS_POR_TIPO = {
  imageMessage: AVISO_SO_TEXTO,
  stickerMessage: AVISO_SO_TEXTO,
  documentMessage: AVISO_SO_TEXTO,
  documentWithCaptionMessage: AVISO_SO_TEXTO,
  contactMessage: AVISO_SO_TEXTO,
  contactsArrayMessage: AVISO_SO_TEXTO,
  pollCreationMessage: AVISO_SO_TEXTO,
  audioMessage:
    "Ainda não escuto áudios, mas se você puder escrever o que procura, te ajudo rapidinho.",
  videoMessage:
    "Ainda não consigo ver vídeos, mas se você puder escrever o que procura, te ajudo rapidinho.",
  ptvMessage:
    "Ainda não consigo ver vídeos, mas se você puder escrever o que procura, te ajudo rapidinho.",
  locationMessage:
    "Ainda não consigo ler localização por aqui. Me conta por escrito o que você precisa?",
  liveLocationMessage:
    "Ainda não consigo ler localização por aqui. Me conta por escrito o que você precisa?"
};

// O texto pode vir em campos diferentes conforme o tipo de mensagem.
function extrairTexto(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ""
  ).trim();
}

// Lista de quem pode ser atendido durante os testes. Sem isso, o bot responderia
// qualquer pessoa que mandar mensagem pro número pareado — que é um número pessoal real.
function numerosAutorizados() {
  return (process.env.TEST_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((numero) => normalizarJid(numero))
    .filter(Boolean);
}

function estaAutorizado(numero) {
  const autorizados = numerosAutorizados();

  // Lista vazia = sem restrição, que era o comportamento antes dessa checagem existir.
  // Uma variável esquecida em branco não deve deixar o bot mudo sem explicação.
  if (autorizados.length === 0) {
    console.warn("[baileys] TEST_ALLOWED_NUMBERS vazio: respondendo qualquer remetente.");
    return true;
  }

  return autorizados.includes(numero);
}

// O WhatsApp está migrando a identificação de contatos de número de telefone (PN,
// "5524...@s.whatsapp.net") pra LID ("123...@lid"), um id interno que NÃO é o telefone.
// Em LID, a lib expõe o telefone real em key.remoteJidAlt; quando ele não vem, dá pra
// consultar o mapeamento LID->PN que o próprio socket mantém.
// Sem isso, mensagens de contatos já migrados eram descartadas em silêncio.
async function resolverNumeroDoRemetente(sock, key) {
  const jid = key?.remoteJid;

  if (isPnUser(jid)) {
    return { numero: normalizarJid(jid), origem: "remoteJid" };
  }

  if (isLidUser(jid)) {
    if (isPnUser(key?.remoteJidAlt)) {
      return { numero: normalizarJid(key.remoteJidAlt), origem: "remoteJidAlt" };
    }

    try {
      const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
      if (pn) {
        return { numero: normalizarJid(pn), origem: "lidMapping" };
      }
    } catch (erro) {
      console.error("[baileys] Falha ao resolver LID -> telefone:", erro.message);
    }

    // Sem telefone, o id do LID ainda serve de chave de sessão, mas não vai bater com a
    // lista de autorizados — e é isso que o log precisa deixar claro.
    return { numero: normalizarJid(jid), origem: "lid-nao-resolvido" };
  }

  return null; // grupo, status, transmissão, newsletter: não é atendimento individual
}

// Uma mensagem por peça: a foto com a ficha na legenda. Produto sem foto cadastrada
// (os do catálogo antigo) vai como texto, com a mesma ficha — melhor que não aparecer.
async function enviarProduto(sock, jid, produto) {
  const legenda = montarLegendaProduto(produto);
  const caminho = produto.foto ? path.resolve(produto.foto) : null;

  if (caminho && fs.existsSync(caminho)) {
    await sock.sendMessage(jid, { image: fs.readFileSync(caminho), caption: legenda });
    return;
  }

  if (caminho) {
    // Caminho cadastrado mas arquivo ausente: avisa no log e ainda assim mostra a peça
    console.warn(`[baileys] Foto não encontrada em ${caminho}, mandando ${produto.nome} como texto`);
  }

  await sock.sendMessage(jid, { text: legenda });
}

// A resposta é string quando é só conversa, e { texto, produtos } quando há peças
// pra mostrar. No segundo caso vai a frase de abertura e depois uma mensagem por peça.
async function enviarResposta(sock, jid, resposta) {
  if (typeof resposta === "string") {
    await sock.sendMessage(jid, { text: resposta });
    return;
  }

  await sock.sendMessage(jid, { text: resposta.texto });

  for (const produto of resposta.produtos) {
    await enviarProduto(sock, jid, produto);
  }
}

async function tratarMensagem(sock, msg) {
  const jid = msg.key?.remoteJid;

  if (msg.key?.fromMe) return; // mensagem que o próprio bot enviou

  const remetente = await resolverNumeroDoRemetente(sock, msg.key);
  if (!remetente) return; // não é conversa individual

  const { numero, origem } = remetente;

  if (origem === "lid-nao-resolvido") {
    console.warn(
      `[baileys] Contato em formato LID sem telefone resolvido (${jid}). Tratando como ${numero}.`
    );
  }

  // A autorização vem antes de olhar o conteúdo: número fora da lista não recebe nem
  // resposta de produto nem aviso de mídia.
  if (!estaAutorizado(numero)) {
    console.log(`[baileys] Mensagem de ${numero} ignorada: não está na lista de autorizados`);
    return;
  }

  // normalizeMessageContent desembrulha mensagem efêmera e "ver uma vez": sem isso, a
  // figurinha de um chat temporário não apareceria como stickerMessage.
  const conteudo = normalizeMessageContent(msg.message);
  const texto = extrairTexto(conteudo);

  if (!texto) {
    const tipo = getContentType(conteudo);
    const aviso = RESPOSTAS_POR_TIPO[tipo];

    if (!aviso) {
      // Reação, edição, evento de protocolo: chegou sem texto, mas não é uma mensagem
      // que o cliente escreveu esperando resposta.
      console.log(`[baileys] Mensagem de ${numero} sem texto e sem resposta prevista (tipo ${tipo}), ignorada`);
      return;
    }

    console.log(`[baileys] Mensagem não textual de ${numero} (${tipo}): respondendo o aviso padrão`);

    try {
      // Resposta fixa: não passa por processarMensagem, então não gasta API nem mexe
      // nos filtros acumulados da sessão.
      await sock.sendMessage(jid, { text: aviso });
    } catch (erro) {
      console.error(`[baileys] Falha ao avisar ${numero} sobre mídia:`, erro.message);
    }
    return;
  }

  console.log(`[baileys] Mensagem de ${numero} (via ${origem}): ${texto}`);

  try {
    const resposta = await processarMensagem(numero, texto);
    console.log(`[baileys] Resposta para ${numero}: ${achatarResposta(resposta)}`);
    await enviarResposta(sock, jid, resposta);
  } catch (erro) {
    // Uma mensagem problemática não pode derrubar a conexão inteira
    console.error(`[baileys] Falha ao responder ${numero}:`, erro.message);
  }
}

export async function iniciarBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_AUTH);

  const sock = makeWASocket({
    auth: state,
    logger: silencioso,
    // O padrão é true e faz o WhatsApp despejar o histórico inteiro no primeiro
    // pareamento — pesado e sem utilidade pra quem só responde mensagem nova.
    syncFullHistory: false
  });

  // Mensagens de histórico só são contadas; imprimir uma linha por conversa antiga
  // enterra no terminal a única informação útil aqui: quando dá pra começar a testar.
  let historicoIgnorado = 0;
  let timerPronto = null;

  function anunciarQuandoParar() {
    clearTimeout(timerPronto);
    timerPronto = setTimeout(() => {
      if (historicoIgnorado > 0) {
        console.log(
          `[baileys] Sincronização concluída (${historicoIgnorado} mensagens de histórico ignoradas). Pronto para receber mensagens.`
        );
      } else {
        console.log("[baileys] Pronto para receber mensagens.");
      }
    }, SILENCIO_ATE_PRONTO_MS);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Na versão 7.x o printQRInTerminal foi descontinuado (só emite um aviso e não
    // desenha nada): quem exibe o QR agora é este handler.
    if (qr) {
      console.log("\n[baileys] Escaneie o QR code abaixo no WhatsApp:");
      console.log("(Configurações > Aparelhos conectados > Conectar um aparelho)\n");
      qrcode.generate(qr, { small: true });

      qrcodeImagem
        .toFile(ARQUIVO_QR, qr)
        .then(() => {
          console.log(
            "\n[baileys] QR code também salvo em baileys-qr.png — abra esse arquivo se o terminal não estiver legível."
          );
        })
        .catch((erro) => {
          // Falhar aqui não impede o pareamento: o QR do terminal continua valendo
          console.error("[baileys] Não consegui salvar o baileys-qr.png:", erro.message);
        });
    }

    if (connection === "open") {
      console.log("[baileys] Conectado ao WhatsApp.");
      // Conta vazia não gera rajada nenhuma: o aviso de pronto sai logo em seguida.
      anunciarQuandoParar();
      return;
    }

    if (connection === "close") {
      const motivo = lastDisconnect?.error?.output?.statusCode;
      const deslogado = motivo === DisconnectReason.loggedOut;

      if (deslogado) {
        console.error(
          `[baileys] Sessão encerrada no aparelho. Apague a pasta ${PASTA_AUTH} e reinicie pra parear de novo.`
        );
        return;
      }

      console.warn(`[baileys] Conexão caiu (código ${motivo ?? "desconhecido"}). Reconectando...`);
      // Sem o catch, uma falha na reconexão viraria unhandled rejection e derrubaria o processo
      iniciarBaileys().catch((erro) => {
        console.error("[baileys] Falha ao reconectar:", erro.message);
      });
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // "notify" é mensagem chegando agora. "append" é sincronização de histórico — sem
    // esse filtro, o bot responderia conversas antigas ao parear.
    if (type !== "notify") {
      historicoIgnorado += messages.length;
      anunciarQuandoParar();
      return;
    }

    // DIAGNÓSTICO TEMPORÁRIO: a key de cada mensagem que chega de verdade, antes dos
    // filtros de conversa. É o que mostra se um contato chega como @lid em vez de
    // @s.whatsapp.net. Remover quando o comportamento estiver confirmado.
    for (const msg of messages) {
      console.log(`[baileys][diag] type=${type} key:`, JSON.stringify(msg.key));
    }

    for (const msg of messages) {
      await tratarMensagem(sock, msg);
    }
  });

  return sock;
}
