// Fechamento em duas etapas: endereço e pagamento. O pedido só existe quando as duas
// terminam — antes disso, carrinho intacto e nenhum registro.

import dotenv from "dotenv";
dotenv.config();

import { processarMensagem, achatarResposta } from "./bot/conversation.js";
import { obterCarrinho, obterCheckout, limparHistorico } from "./bot/sessionStore.js";
import { listarPedidos } from "./data/orders.js";
import { CHAVE_PIX } from "./bot/persona.js";
import { catalog } from "./data/catalog.js";
import { formatarPreco } from "./utils/formatarPreco.js";

const ENDERECO = "Rua das Acácias, 120, Centro, Volta Redonda";

const resultados = [];
const verificar = (descricao, condicao) => {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
};

const unicornio = catalog.find((p) => p.nome === "Pijama Infantil Unicórnio");

async function etapa(from, mensagem) {
  console.log(`cliente: ${mensagem}`);
  const resposta = await processarMensagem(from, mensagem);
  console.log(`Ana: ${achatarResposta(resposta)}`);
  const checkout = obterCheckout(from);
  console.log(`   [checkout: ${checkout ? checkout.etapa : "nenhum"} | carrinho: ${obterCarrinho(from).length} item(ns) | pedidos: ${listarPedidos(from).length}]\n`);
  return achatarResposta(resposta);
}

const FROM = "5511988887777";
limparHistorico(FROM);

console.log("=== 1. Adiciona e pede pra fechar ===\n");
await etapa(FROM, "quero o pijama infantil unicórnio");

const respostaFechar = await etapa(FROM, "só isso");
verificar("pergunta o endereço de entrega", /endere[çc]o/i.test(respostaFechar));
verificar('checkout está na etapa "endereco"', obterCheckout(FROM)?.etapa === "endereco");
verificar("carrinho continua com o item", obterCarrinho(FROM).length === 1);
verificar("pedido ainda NÃO foi registrado", listarPedidos(FROM).length === 0);

console.log("=== 2. Insiste em finalizar antes de dar o endereço ===\n");
const respostaInsistindo = await etapa(FROM, "finalizar");
verificar("lembra que está esperando o endereço", /endere[çc]o/i.test(respostaInsistindo));
verificar('checkout continua na etapa "endereco"', obterCheckout(FROM)?.etapa === "endereco");
verificar("não registrou pedido nenhum", listarPedidos(FROM).length === 0);
verificar("carrinho segue intacto", obterCarrinho(FROM).length === 1);

console.log("=== 3. Informa o endereço ===\n");
const respostaEndereco = await etapa(FROM, ENDERECO);
verificar("mostra o resumo com o item", respostaEndereco.includes(unicornio.nome));
verificar(
  `mostra o total (${formatarPreco(unicornio.preco)})`,
  respostaEndereco.includes(formatarPreco(unicornio.preco))
);
verificar("mostra o endereço informado", respostaEndereco.includes(ENDERECO));
verificar("pergunta a forma de pagamento", /pagar|pagamento/i.test(respostaEndereco));
verificar('checkout avançou pra etapa "pagamento"', obterCheckout(FROM)?.etapa === "pagamento");
verificar("endereço guardado no checkout", obterCheckout(FROM)?.endereco === ENDERECO);
verificar("pedido ainda NÃO foi registrado", listarPedidos(FROM).length === 0);

console.log("=== 4. Responde algo que não é forma de pagamento ===\n");
const respostaConfusa = await etapa(FROM, "sei lá, tanto faz");
verificar("pede a forma de pagamento de novo", /pagar|pagamento/i.test(respostaConfusa));
verificar("não avança nem registra", listarPedidos(FROM).length === 0);
verificar('checkout continua em "pagamento"', obterCheckout(FROM)?.etapa === "pagamento");

console.log("=== 5. Responde \"pix\" ===\n");
const respostaFinal = await etapa(FROM, "pix");
const pedido = listarPedidos(FROM)[0];
console.log(`pedido: ${JSON.stringify(pedido)}\n`);

verificar("pedido foi registrado agora", listarPedidos(FROM).length === 1);
verificar("pedido guardou o endereço", pedido?.endereco === ENDERECO);
verificar('pedido guardou formaPagamento "pix"', pedido?.formaPagamento === "pix");
verificar("total do pedido está certo", pedido?.total === unicornio.preco);
verificar("item do pedido está certo", pedido?.itens?.[0]?.produtoId === unicornio.id);
verificar("carrinho foi esvaziado", obterCarrinho(FROM).length === 0);
verificar("checkout encerrado", obterCheckout(FROM) === null);

verificar("confirmação cita o número do pedido", respostaFinal.includes(pedido.id));
verificar("confirmação cita a chave Pix", respostaFinal.includes(CHAVE_PIX));
verificar("confirmação repete o resumo com endereço", respostaFinal.includes(ENDERECO));
verificar("confirmação agradece", /obrigad/i.test(respostaFinal));
verificar("confirmação diz o que acontece a seguir", /entrega|avisa|separa/i.test(respostaFinal));

console.log("=== Resultado ===");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
process.exit(todosOk ? 0 : 1);
