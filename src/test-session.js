// Teste isolado da memória de conversa: duas mensagens seguidas do mesmo número.
// A segunda ("prefiro tamanho 8") só faz sentido se a Claude API receber a primeira
// no histórico — por isso o script inspeciona o payload enviado, além do sessionStore.

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { processarMensagem } from "./bot/conversation.js";
import { obterHistorico } from "./bot/sessionStore.js";

const FROM = "5511999999999";

// Espiona as chamadas à API sem alterar o comportamento: guarda o payload e repassa adiante.
const payloadsEnviados = [];
const postOriginal = axios.post;
axios.post = function (url, data, config) {
  payloadsEnviados.push(data);
  return postOriginal.call(this, url, data, config);
};

console.log("--- Mensagem 1: 'quero um pijama de inverno' ---");
const resposta1 = await processarMensagem(FROM, "quero um pijama de inverno");
console.log(resposta1);
console.log("Histórico após a 1ª mensagem:", obterHistorico(FROM).length, "entradas");

console.log("\n--- Mensagem 2: 'prefiro tamanho 8' ---");
const resposta2 = await processarMensagem(FROM, "prefiro tamanho 8");
console.log(resposta2);

const historicoFinal = obterHistorico(FROM);
console.log("\nHistórico final da sessão:");
console.log(JSON.stringify(historicoFinal, null, 2));

const segundoPayload = payloadsEnviados[1];
console.log("\nMessages enviadas na 2ª chamada à Claude API:");
console.log(JSON.stringify(segundoPayload?.messages, null, 2));

console.log("\n--- Resultado ---");
console.log(
  "Histórico acumulou mais de 2 entradas:",
  historicoFinal.length > 2,
  `(${historicoFinal.length})`
);
console.log(
  "2ª chamada recebeu o histórico no payload:",
  (segundoPayload?.messages?.length ?? 0) > 1,
  `(${segundoPayload?.messages?.length ?? 0} mensagens)`
);
