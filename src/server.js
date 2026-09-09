import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { processarMensagem, achatarResposta } from "./bot/conversation.js";
import { enviarMensagem } from "./services/whatsapp.js";
import {
  enviarMensagemTwilio,
  normalizarNumeroWhatsapp
} from "./services/twilioWhatsapp.js";
import { iniciarBaileys } from "./channels/baileysWhatsapp.js";

const app = express();
app.use(express.json());
// A Twilio manda o webhook como formulário (application/x-www-form-urlencoded),
// formato que o express.json() acima não entende.
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado com sucesso");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  // Responde rápido pra Meta não reenviar o evento
  res.sendStatus(200);

  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  if (!message) return; // pode ser um evento de status (entregue/lido), ignoramos por enquanto

  const from = message.from; // número do cliente
  const text = message.text?.body;

  console.log(`Mensagem de ${from}: ${text}`);

  if (!text) return; // áudio, imagem, sticker: ainda não tratamos

  // O `from` identifica a sessão do cliente, pra que o bot lembre do que já foi dito
  const resposta = achatarResposta(await processarMensagem(from, text));
  console.log(`Resposta para ${from}: ${resposta}`);

  // O 200 pra Meta já foi enviado lá em cima, então esse await não atrasa o webhook.
  // enviarMensagem não lança: uma falha de envio é logada e a requisição termina normal.
  await enviarMensagem(from, resposta);
});


// Canal Twilio, em paralelo ao da Meta. Não tem GET de verificação: aquele handshake
// é exigência da Meta, a Twilio não pede. A partir daqui é tudo igual — mesma
// processarMensagem, mesma sessão, só o transporte é outro.
app.post("/webhook/twilio", async (req, res) => {
  // Responde na hora pra Twilio não reenviar o evento. O TwiML vazio evita o aviso
  // 12300 (content-type inválido) no console da Twilio: quem entrega a resposta de
  // verdade é a chamada de API logo abaixo, não este corpo.
  res.type("text/xml").status(200).send("<Response></Response>");

  const texto = req.body.Body;
  // Só os dígitos, mesmo formato que a Meta usa: os dois canais caem na mesma sessão
  const from = normalizarNumeroWhatsapp(req.body.From);

  if (!from || !texto) return; // status de entrega, mídia sem texto, etc.

  console.log(`[twilio] Mensagem de ${from}: ${texto}`);

  const resposta = achatarResposta(await processarMensagem(from, texto));
  console.log(`[twilio] Resposta para ${from}: ${resposta}`);

  await enviarMensagemTwilio(from, resposta);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// Os canais Meta e Twilio ficam esperando webhook no Express acima; o Baileys mantém
// a própria conexão com o WhatsApp Web. Um npm run dev sobe os três.
iniciarBaileys().catch((erro) => {
  console.error("Não foi possível iniciar o canal Baileys:", erro.message);
});