// Teste da camada de geração de texto: persona, saudação e anti-alucinação.
// A busca em si continua sendo do código — aqui checamos que o texto gerado fala
// SÓ do que a busca encontrou, com os dados exatos do catálogo.

import dotenv from "dotenv";
dotenv.config();

import { processarMensagem } from "./bot/conversation.js";
import { limparHistorico } from "./bot/sessionStore.js";
import { SAUDACAO } from "./bot/persona.js";
import { catalog } from "./data/catalog.js";
import { formatarPreco } from "./utils/formatarPreco.js";

const FROM = "5511977777777";
limparHistorico(FROM);

const resultados = [];

function verificar(descricao, condicao) {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
}

const unicornio = catalog.find((p) => p.nome === "Pijama Infantil Unicórnio");
const outrosProdutos = catalog.filter((p) => p.nome !== unicornio.nome);

// Emoji: mesma faixa usada pra conferir que nenhuma resposta do bot tem emoji
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

console.log("=== 1. Primeira mensagem da sessão, busca com 1 resultado ===");
const resposta1 = await processarMensagem(FROM, "quero um pijama infantil");
console.log(`\n${resposta1}\n`);

verificar("começa com a saudação da persona", resposta1.startsWith(SAUDACAO));
verificar(
  `menciona o nome real do produto (${unicornio.nome})`,
  resposta1.includes(unicornio.nome)
);
verificar(
  `menciona o preço real do catálogo (${formatarPreco(unicornio.preco)})`,
  resposta1.includes(formatarPreco(unicornio.preco).replace("R$ ", ""))
);
for (const outro of outrosProdutos) {
  verificar(`não cita "${outro.nome}", que não veio na busca`, !resposta1.includes(outro.nome));
}
verificar("sem emoji", !EMOJI.test(resposta1));

console.log("\n=== 2. Segunda mensagem da mesma sessão, busca sem resultado ===");
const resposta2 = await processarMensagem(FROM, "tem alguma coisa até 20 reais?");
console.log(`\n${resposta2}\n`);

verificar("não repete a saudação", !resposta2.includes(SAUDACAO));
for (const produto of catalog) {
  verificar(`não sugere "${produto.nome}"`, !resposta2.includes(produto.nome));
}
verificar("sem emoji", !EMOJI.test(resposta2));

console.log("\n=== Resultado ===");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
console.log("Revise os dois textos acima: soam naturais ou robóticos?");
process.exit(todosOk ? 0 : 1);
