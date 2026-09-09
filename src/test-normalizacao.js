// Teste da busca sem depender de acentuação. Não chama a Claude API: os filtros são
// montados na mão, do jeito que o modelo os devolve (sem acento, como o SYSTEM_PROMPT pede).

import { buscarProdutos } from "./bot/catalogSearch.js";
import { catalog } from "./data/catalog.js";
import { normalizarTexto } from "./utils/normalizarTexto.js";

const resultados = [];

function verificar(descricao, condicao) {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
}

function nomes(produtos) {
  return produtos.map((p) => p.nome).join(", ") || "(nenhum)";
}

console.log("--- O bug: catálogo grava \"verão\", a IA devolve \"verao\" ---");
const verao = buscarProdutos({ estacao: "verao" }, catalog);
console.log("buscarProdutos({ estacao: \"verao\" }):", nomes(verao));
verificar(
  "Pijama Curto Listrado aparece na busca por verao (sem acento)",
  verao.some((p) => p.nome === "Pijama Curto Listrado")
);

const veraoComAcento = buscarProdutos({ estacao: "verão" }, catalog);
verificar(
  "busca por \"verão\" (com acento) devolve o mesmo resultado",
  nomes(veraoComAcento) === nomes(verao)
);

console.log("\n--- Mesma regra pra cor, tecido e categoria ---");
const lilas = buscarProdutos({ cor: "lilas" }, catalog);
console.log("buscarProdutos({ cor: \"lilas\" }):", nomes(lilas));
verificar(
  "cor \"lilas\" encontra o produto cadastrado como \"lilás\"",
  lilas.some((p) => p.nome === "Pijama Infantil Unicórnio")
);

const algodao = buscarProdutos({ tecido: "algodao" }, catalog);
console.log("buscarProdutos({ tecido: \"algodao\" }):", nomes(algodao));
verificar(
  "tecido \"algodao\" encontra o produto cadastrado como \"algodão\"",
  algodao.some((p) => p.nome === "Pijama Curto Listrado")
);

const feminino = buscarProdutos({ categoria: "FEMININO" }, catalog);
// Conta os femininos do catálogo atual, em vez de fixar um número que envelhece.
const femininosNoCatalogo = catalog.filter((p) => p.categoria === "feminino").length;
verificar(
  "categoria compara sem diferenciar caixa",
  feminino.length === femininosNoCatalogo && femininosNoCatalogo > 0
);

console.log("\n--- Filtros que não batem continuam não batendo ---");
verificar("estacao inexistente não devolve nada", buscarProdutos({ estacao: "outono" }, catalog).length === 0);
verificar("catálogo inteiro sem filtros", buscarProdutos({}, catalog).length === catalog.length);

console.log("\n--- normalizarTexto ---");
verificar('"Verão" -> "verao"', normalizarTexto("Verão") === "verao");
verificar('"  LILÁS  " -> "lilas"', normalizarTexto("  LILÁS  ") === "lilas");
verificar("null vira string vazia", normalizarTexto(null) === "");

console.log("\n--- Resultado ---");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
process.exit(todosOk ? 0 : 1);
