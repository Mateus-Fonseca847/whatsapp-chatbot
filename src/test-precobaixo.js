// Recusa educada quando o cliente pede abaixo do que a loja pratica — e a garantia de
// que o caso "não temos nada assim" continua indo pelo caminho antigo.

import dotenv from "dotenv";
dotenv.config();

import { diagnosticarBuscaVazia } from "./bot/catalogSearch.js";
import { gerarRespostaBusca } from "./services/claude.js";
import { processarMensagem } from "./bot/conversation.js";
import { limparHistorico } from "./bot/sessionStore.js";
import { DIFERENCIAIS_LOJA } from "./bot/persona.js";
import { catalog } from "./data/catalog.js";
import { formatarPreco } from "./utils/formatarPreco.js";

const resultados = [];
const verificar = (descricao, condicao) => {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
};

const unicornio = catalog.find((p) => p.nome === "Pijama Infantil Unicórnio");

// Palavras-chave de cada diferencial, pra reconhecer o motivo citado sem exigir que o
// modelo repita a frase inteira, palavra por palavra.
const MARCAS_DOS_DIFERENCIAIS = [
  ["feito à mão / produção local", /(m[ãa]o|artesanal|local)/i],
  ["tecido e acabamento", /(tecido|acabamento)/i],
  ["conforto e caimento", /(conforto|caimento|confort)/i],
  ["durabilidade", /(durab|desbot|costura|dura)/i]
];

console.log("=== 1. Pedido abaixo do que a loja pratica ===");
const filtrosBaratos = { categoria: "infantil", preco_maximo: 20, intencao: "buscar_produto" };
const diagnostico = diagnosticarBuscaVazia(filtrosBaratos, catalog);
console.log(`diagnóstico: ${JSON.stringify({ motivo: diagnostico.motivo, opcoes: diagnostico.opcoes.map((p) => p.nome) })}`);

verificar('motivo é "preco"', diagnostico.motivo === "preco");
verificar(
  "oferece o Pijama Infantil Unicórnio",
  diagnostico.opcoes.some((p) => p.id === unicornio.id)
);
verificar("no máximo 3 opções", diagnostico.opcoes.length <= 3);
verificar(
  "ordenadas por preço crescente",
  diagnostico.opcoes.every((p, i, arr) => i === 0 || arr[i - 1].preco <= p.preco)
);

const resposta1 = await gerarRespostaBusca([], diagnostico.opcoes, [
  { role: "user", content: "quero um pijama infantil até 20 reais" }
], "preco_baixo");
console.log(`\nAna: ${resposta1}\n`);

verificar("cita o produto oferecido", resposta1.includes(unicornio.nome));
verificar(`cita o preço real (${formatarPreco(unicornio.preco)})`, resposta1.includes(formatarPreco(unicornio.preco)));

const citados = MARCAS_DOS_DIFERENCIAIS.filter(([, padrao]) => padrao.test(resposta1));
console.log(`diferenciais reconhecidos no texto: ${citados.map(([nome]) => nome).join(", ") || "(nenhum)"}`);
verificar("cita ao menos um diferencial da lista", citados.length >= 1);
verificar("não promete desconto nem promoção", !/(desconto|promo[çc][ãa]o|parcel)/i.test(resposta1));

verificar("cita no máximo 2 diferenciais", citados.length <= 2);

// Ponta a ponta: prova que o branch de buscar_produto escolhe esse caminho sozinho,
// e não só que a função de geração sabe escrever o texto.
const FROM_PRECO = "5511922222222";
limparHistorico(FROM_PRECO);
const respostaFluxo = await processarMensagem(FROM_PRECO, "quero um pijama infantil até 20 reais");
console.log(`Ana (fluxo completo): ${respostaFluxo}`);
verificar(
  "fluxo completo cita o produto e o preço reais",
  respostaFluxo.includes(unicornio.nome) && respostaFluxo.includes(formatarPreco(unicornio.preco))
);
verificar(
  "fluxo completo cita algum diferencial",
  MARCAS_DOS_DIFERENCIAIS.some(([, padrao]) => padrao.test(respostaFluxo))
);

console.log("=== 2. Categoria que não existe (fluxo antigo) ===");
const filtrosInexistentes = { categoria: "plus size", intencao: "buscar_produto" };
const diagnostico2 = diagnosticarBuscaVazia(filtrosInexistentes, catalog);
console.log(`diagnóstico: ${JSON.stringify(diagnostico2)}`);
verificar('motivo é "sem_correspondencia"', diagnostico2.motivo === "sem_correspondencia");
verificar("nenhuma opção oferecida", diagnostico2.opcoes.length === 0);

const FROM = "5511933333333";
limparHistorico(FROM);
const resposta2 = await processarMensagem(FROM, "vocês têm pijama plus size?");
console.log(`\nAna: ${resposta2}\n`);

verificar(
  "não usa linguagem de recusa por preço",
  !/(valor que voc[êe]|abaixo do que|faixa de pre[çc]o que trabalhamos)/i.test(resposta2)
);
for (const produto of catalog) {
  verificar(`não inventa produto: "${produto.nome}" ausente`, !resposta2.includes(produto.nome));
}

console.log("\n=== Resultado ===");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
console.log(`(diferenciais cadastrados: ${DIFERENCIAIS_LOJA.length})`);
process.exit(todosOk ? 0 : 1);
