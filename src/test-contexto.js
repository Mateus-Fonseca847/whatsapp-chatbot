// Teste do acúmulo de filtros ao longo da conversa.
// Três mensagens do mesmo número: a segunda ADICIONA uma informação à primeira,
// e a terceira CORRIGE uma informação sem apagar o resto.

import dotenv from "dotenv";
dotenv.config();

import { processarMensagem, achatarResposta } from "./bot/conversation.js";
import { obterFiltros, obterHistorico, limparHistorico } from "./bot/sessionStore.js";

const FROM = "5511999999999";
limparHistorico(FROM); // começa de uma sessão limpa

const resultados = [];

async function enviar(texto, esperado) {
  console.log(`\n--- "${texto}" ---`);
  const resposta = await processarMensagem(FROM, texto);
  console.log(achatarResposta(resposta));

  const filtros = obterFiltros(FROM);
  console.log("Filtros mesclados:", JSON.stringify(filtros));

  for (const [campo, valorEsperado] of Object.entries(esperado)) {
    // String(): o modelo às vezes devolve tamanho como número (8) em vez de texto ("8"),
    // e buscarProdutos já normaliza os dois casos.
    const valorAtual = filtros?.[campo];
    const ok = String(valorAtual) === String(valorEsperado);
    console.log(`  ${ok ? "OK  " : "FALHA"} ${campo}: esperado ${valorEsperado}, obtido ${valorAtual}`);
    resultados.push(ok);
  }
}

await enviar("quero um pijama de inverno", { estacao: "inverno" });
await enviar("prefiro tamanho 8", { estacao: "inverno", tamanho: "8" });
await enviar("na verdade, quero tamanho 6", { estacao: "inverno", tamanho: "6" });

console.log("\n--- Histórico de mensagens da sessão (sem formatação do WhatsApp) ---");
console.log(JSON.stringify(obterHistorico(FROM), null, 2));

console.log("\n--- Resultado ---");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
process.exit(todosOk ? 0 : 1);
