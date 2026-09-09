// Teste de validarContraCatalogo. Não chama a Claude API de propósito: o objeto de
// entrada reproduz na mão o bug real observado ("pijama" extraído como tecido), pra
// que o teste não dependa da variabilidade da IA.

import { validarContraCatalogo } from "./bot/catalogSearch.js";

const resultados = [];

function verificar(descricao, condicao) {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
}

console.log("--- Filtros inventados pela IA ---");
const entrada = { tecido: "pijama", estacao: "inverno", cor: "arco-íris" };
console.log("Entrada: ", JSON.stringify(entrada));

const validados = validarContraCatalogo(entrada);
console.log("Validado:", JSON.stringify(validados));

verificar('tecido "pijama" descartado (nenhum produto tem esse tecido)', validados.tecido === null);
verificar('cor "arco-íris" descartada (nenhuma família de cor bate)', validados.cor === null);
verificar('estacao "inverno" preservada intacta', validados.estacao === "inverno");
verificar("entrada original não foi mutada", entrada.tecido === "pijama");

console.log("\n--- Filtros que existem no catálogo (não podem ser descartados) ---");
const validos = { tecido: "algodão", cor: "azul", estacao: "verão" };
console.log("Entrada: ", JSON.stringify(validos));

const validadosOk = validarContraCatalogo(validos);
console.log("Validado:", JSON.stringify(validadosOk));

verificar('tecido "algodão" preservado (Pijama Curto Listrado)', validadosOk.tecido === "algodão");
verificar('cor "azul" preservada (mesma família de "azul e branco")', validadosOk.cor === "azul");

console.log("\n--- Resultado ---");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
process.exit(todosOk ? 0 : 1);
