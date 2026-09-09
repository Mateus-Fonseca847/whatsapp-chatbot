// Fluxo completo de compra: busca -> escolhe pela menção ao nome -> vê o carrinho ->
// finaliza. Cada etapa mostra o carrinho da sessão e o que foi registrado como pedido.

import dotenv from "dotenv";
dotenv.config();

import { processarMensagem, achatarResposta } from "./bot/conversation.js";
import { obterCarrinho, limparHistorico } from "./bot/sessionStore.js";
import { listarPedidos } from "./data/orders.js";
import { catalog } from "./data/catalog.js";
import { formatarPreco } from "./utils/formatarPreco.js";

const FROM = "5511955555555";
limparHistorico(FROM);

const resultados = [];
const verificar = (descricao, condicao) => {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
};

const unicornio = catalog.find((p) => p.nome === "Pijama Infantil Unicórnio");

async function etapa(titulo, mensagem) {
  console.log(`\n=== ${titulo} ===`);
  console.log(`cliente: ${mensagem}`);
  const resposta = await processarMensagem(FROM, mensagem);
  console.log(`Ana: ${achatarResposta(resposta)}`);
  console.log(`carrinho: ${JSON.stringify(obterCarrinho(FROM))}`);
  console.log(`pedidos: ${JSON.stringify(listarPedidos(FROM))}`);
  return resposta;
}

await etapa("1. Busca", "quero um pijama de inverno");

const r2 = await etapa("2. Adicionar pelo nome", "quero o infantil unicórnio");
const carrinhoDepois = obterCarrinho(FROM);
verificar("carrinho tem exatamente 1 item", carrinhoDepois.length === 1);
verificar(`item é o ${unicornio.nome}`, carrinhoDepois[0]?.produtoId === unicornio.id);
verificar("quantidade assumida como 1", carrinhoDepois[0]?.quantidade === 1);
verificar("confirmação cita o nome do produto", r2.includes(unicornio.nome));
verificar(
  `confirmação cita o preço real (${formatarPreco(unicornio.preco)})`,
  r2.includes(formatarPreco(unicornio.preco))
);

const r3 = await etapa("3. Ver carrinho", "o que tem no meu carrinho?");
verificar("listagem cita o produto", r3.includes(unicornio.nome));
verificar("listagem mostra o total", r3.includes("Total:"));
verificar(
  `total bate com o catálogo (${formatarPreco(unicornio.preco)})`,
  r3.includes(formatarPreco(unicornio.preco))
);

// Fechar o pedido agora tem duas etapas antes do registro: endereço e pagamento.
const ENDERECO = "Rua das Acácias, 120, Centro, Volta Redonda";

const r4 = await etapa("4. Pedir pra fechar", "pode finalizar");
verificar("pergunta o endereço antes de fechar", /endere[çc]o/i.test(r4));
verificar("não registra pedido antes do checkout terminar", listarPedidos(FROM).length === 0);
verificar("carrinho segue intacto durante o checkout", obterCarrinho(FROM).length === 1);

const r5 = await etapa("5. Informar o endereço", ENDERECO);
verificar(
  `resumo mostra o total (${formatarPreco(unicornio.preco)})`,
  r5.includes(formatarPreco(unicornio.preco))
);
verificar("resumo mostra o endereço", r5.includes(ENDERECO));

const r6 = await etapa("6. Informar o pagamento", "pix");
const pedidos = listarPedidos(FROM);
verificar("um pedido foi registrado", pedidos.length === 1);
verificar("pedido está pendente", pedidos[0]?.status === "pendente");
verificar("pedido tem o item do carrinho", pedidos[0]?.itens?.[0]?.produtoId === unicornio.id);
verificar(`total do pedido é ${formatarPreco(unicornio.preco)}`, pedidos[0]?.total === unicornio.preco);
verificar("pedido tem data de criação", Boolean(pedidos[0]?.criadoEm));
verificar("pedido guardou o endereço", pedidos[0]?.endereco === ENDERECO);
verificar("pedido guardou a forma de pagamento", pedidos[0]?.formaPagamento === "pix");
verificar("confirmação cita o total", r6.includes(formatarPreco(unicornio.preco)));
verificar("confirmação traz instrução de pagamento", /chave pix/i.test(r6));
verificar("carrinho ficou vazio depois de fechar", obterCarrinho(FROM).length === 0);

console.log("\n=== Resultado ===");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
process.exit(todosOk ? 0 : 1);
