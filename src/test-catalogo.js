// Navegação pelo catálogo: ver o que existe, abrir uma categoria e escolher uma peça
// direto dali — sem nunca ter feito uma busca com critérios.

import dotenv from "dotenv";
dotenv.config();

import { processarMensagem } from "./bot/conversation.js";
import {
  obterCarrinho,
  obterUltimosProdutosMostrados,
  limparHistorico
} from "./bot/sessionStore.js";
import { listarCategorias } from "./bot/catalogSearch.js";
import { catalog } from "./data/catalog.js";
import { montarLegendaProduto, achatarResposta } from "./bot/conversation.js";
import { formatarPreco } from "./utils/formatarPreco.js";

const FROM = "5511944444444";
limparHistorico(FROM);

const resultados = [];
const verificar = (descricao, condicao) => {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
};

const unicornio = catalog.find((p) => p.nome === "Pijama Infantil Unicórnio");

async function etapa(titulo, mensagem) {
  console.log(`=== ${titulo} ===`);
  console.log(`cliente: ${mensagem}`);
  const resposta = await processarMensagem(FROM, mensagem);
  console.log(`Ana: ${achatarResposta(resposta)}`);
  return resposta;
}

console.log(`Categorias no catálogo: ${listarCategorias(catalog).join(", ")}`);
console.log("");

const r1 = await etapa("1. Ver o catálogo sem critério", "o que vocês têm?");
for (const categoria of listarCategorias(catalog)) {
  verificar(`cita a categoria "${categoria}"`, r1.includes(categoria));
}

console.log("");
const r2 = await etapa("2. Abrir uma categoria", "quero ver as opções infantis");
// A listagem virou: frase de abertura + uma peça por mensagem. Os dados da peça estão
// na ficha, não no texto gerado.
verificar("abertura cita a categoria", r2.texto.includes("infantil"));
verificar("devolve o Pijama Infantil Unicórnio pra exibir", r2.produtos.some((p) => p.id === unicornio.id));

const fichaUnicornio = montarLegendaProduto(unicornio);
console.log(`ficha: ${fichaUnicornio}`);
verificar("ficha traz o nome", fichaUnicornio.includes(unicornio.nome));
verificar(`ficha traz o preço certo (${formatarPreco(unicornio.preco)})`, fichaUnicornio.includes(formatarPreco(unicornio.preco)));
verificar(
  `ficha traz os tamanhos certos (${unicornio.tamanhos.join(", ")})`,
  fichaUnicornio.includes(unicornio.tamanhos.join(", "))
);
verificar("ficha traz a cor certa", fichaUnicornio.includes(unicornio.cor));
const mostrados = obterUltimosProdutosMostrados(FROM);
console.log(`ultimosProdutosMostrados: ${mostrados.map((p) => p.nome).join(", ") || "(vazio)"}`);
verificar(
  "catálogo alimentou ultimosProdutosMostrados",
  mostrados.some((p) => p.id === unicornio.id)
);

console.log("");
const r3 = await etapa("3. Escolher a peça vinda do catálogo", "quero o unicórnio");
const carrinho = obterCarrinho(FROM);
console.log(`carrinho: ${JSON.stringify(carrinho)}`);
verificar("adicionou ao carrinho", carrinho.length === 1 && carrinho[0].produtoId === unicornio.id);
verificar("confirmação cita o nome do produto", r3.includes(unicornio.nome));

console.log("");
console.log("=== Resultado ===");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
process.exit(todosOk ? 0 : 1);
