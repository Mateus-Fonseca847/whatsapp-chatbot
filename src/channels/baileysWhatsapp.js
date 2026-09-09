import path from "node:path";
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

import { processarMensagem } from "../bot/conversation.js";

// Terceiro canal, ao lado de Meta e Twilio. Este conecta direto ao WhatsApp Web, como um
// aparelho pareado: não passa por conta comercial nem por aprovação da Meta, então é o
// único que funciona hoje, sem restrição de país. A lógica de conversa é a mesma dos
// outros dois — muda só o transporte.

// Credenciais da sessão pareada. Quem tem essa pasta tem acesso à conta: fica fora do git.
const PASTA_AUTH = path.resolve("baileys_auth");

// O logger padrão do Baileys é um pino em nível info, que despeja JSON no terminal e
// atrapalha a leitura do QR code. Como só nos interessam avisos e erros, passamos um
// logger mínimo com a mesma interface (a lib chama child/trace/debug/info/warn/error).
const silencioso = {
  level: "warn",
  child: () => silencioso,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: (...args) => console.warn("[baileys]", ...args),
  error: (...args) => console.error("[baileys]", ...args)
};

// "5524974012668@s.whatsapp.net" -> "5524974012668".
// Mesmo formato dos outros canais, pra que a mesma pessoa caia na mesma sessão do
// sessionStore independentemente de por onde falou.
export function normalizarJid(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
}

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

function ehGrupo(jid) {
  return String(jid ?? "").endsWith("@g.us");
}

// Conversas individuais terminam em @s.whatsapp.net. Status, listas de transmissão e
// newsletters chegam por outros domínios e não são atendimento.
function ehConversaIndividual(jid) {
  return String(jid ?? "").endsWith("@s.whatsapp.net");
}

async function tratarMensagem(sock, msg) {
  const jid = msg.key?.remoteJid;

  if (msg.key?.fromMe) return; // mensagem que o próprio bot enviou
  if (ehGrupo(jid) || !ehConversaIndividual(jid)) return;

  const texto = extrairTexto(msg.message);
  if (!texto) return; // áudio, sticker, figurinha: ainda não tratamos

  const from = normalizarJid(jid);
  console.log(`[baileys] Mensagem de ${from}: ${texto}`);

  try {
    const resposta = await processarMensagem(from, texto);
    console.log(`[baileys] Resposta para ${from}: ${resposta}`);
    await sock.sendMessage(jid, { text: resposta });
  } catch (erro) {
    // Uma mensagem problemática não pode derrubar a conexão inteira
    console.error(`[baileys] Falha ao responder ${from}:`, erro.message);
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

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Na versão 7.x o printQRInTerminal foi descontinuado (só emite um aviso e não
    // desenha nada): quem exibe o QR agora é este handler.
    if (qr) {
      console.log("\n[baileys] Escaneie o QR code abaixo no WhatsApp:");
      console.log("(Configurações > Aparelhos conectados > Conectar um aparelho)\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("[baileys] Conectado ao WhatsApp.");
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
    if (type !== "notify") return;

    for (const msg of messages) {
      await tratarMensagem(sock, msg);
    }
  });

  return sock;
}
