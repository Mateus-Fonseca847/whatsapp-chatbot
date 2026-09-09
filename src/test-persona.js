// Teste da camada de geração de texto: persona, saudação e anti-alucinação.
// A busca em si continua sendo do código — aqui checamos que o texto gerado fala
// SÓ do que a busca encontrou, com os dados exatos do catálogo.

import dotenv from "dotenv";
dotenv.config();

import { processarMensagem, achatarResposta } from "./bot/conversation.js";
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
// Peças de outra categoria: nenhuma pode aparecer numa busca por infantil.
const deOutraCategoria = catalog.filter((p) => p.categoria !== unicornio.categoria);

// A resposta é string quando é só conversa e { texto, produtos } quando há peças.
const textoDe = (r) => (typeof r === "string" ? r : r.texto);

// Emoji: mesma faixa usada pra conferir que nenhuma resposta do bot tem emoji
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

console.log("=== 1. Primeira mensagem da sessão, busca com 1 resultado ===");
const resposta1 = await processarMensagem(FROM, "quero um pijama infantil");
console.log(achatarResposta(resposta1));

verificar("começa com a saudação da persona", textoDe(resposta1).startsWith(SAUDACAO));

// Nome e preço agora vivem na ficha de cada peça, não no texto gerado pela IA.
const tudo = achatarResposta(resposta1);
verificar(
  `menciona o nome real do produto (${unicornio.nome})`,
  tudo.includes(unicornio.nome)
);
verificar(
  `menciona o preço real do catálogo (${formatarPreco(unicornio.preco)})`,
  tudo.includes(formatarPreco(unicornio.preco))
);
for (const outro of deOutraCategoria) {
  verificar(`não cita "${outro.nome}", de outra categoria`, !tudo.includes(outro.nome));
}
verificar("sem emoji", !EMOJI.test(tudo));

// "plus size" não existe no catálogo e não pontua como parecido com nada, então esta
// busca cai no cenário "vazio e sem alternativas" — que é o que este teste checa.
// A busca vazia COM alternativas é coberta pelo test-similares.js.
console.log("\n=== 2. Segunda mensagem da mesma sessão, busca sem resultado ===");
const resposta2 = await processarMensagem(FROM, "e plus size, vocês têm?");
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
