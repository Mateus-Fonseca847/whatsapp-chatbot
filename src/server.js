import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { processarMensagem } from "./bot/conversation.js";

const app = express();
app.use(express.json());

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
  const resposta = await processarMensagem(from, text);
  console.log(`Resposta para ${from}: ${resposta}`);

  // TODO: enviar a resposta de volta pelo WhatsApp (src/services/whatsapp.js)
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});