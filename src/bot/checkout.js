import { CHAVE_PIX } from "./persona.js";
import { detalharCarrinho, calcularTotalCarrinho } from "./cart.js";
import { formatarPreco } from "../utils/formatarPreco.js";
import { normalizarTexto } from "../utils/normalizarTexto.js";

// Fechamento do pedido em duas etapas: endereço e pagamento. Nada aqui fala com a IA —
// endereço, total e forma de pagamento são dados do pedido, não conversa.

const NL = "\n";

// Formas aceitas, reconhecidas por palavra-chave. Uma tabela só: o que reconhece a
// resposta do cliente é o mesmo que gera o rótulo e as instruções depois.
const FORMAS_DE_PAGAMENTO = [
  {
    forma: "pix",
    rotulo: "Pix",
    padrao: /\bpix\b/,
    instrucoes: () =>
      `Chave Pix: ${CHAVE_PIX}${NL}É só mandar o comprovante por aqui quando fizer a transferência.`
  },
  {
    forma: "cartao",
    rotulo: "cartão",
    padrao: /cartao|credito|debito/,
    instrucoes: () => "Vamos te mandar o link de pagamento em instantes, aqui mesmo pelo WhatsApp."
  },
  {
    forma: "combinar_na_entrega",
    rotulo: "acerto na entrega",
    padrao: /dinheiro|entrega|combinar/,
    instrucoes: () => "Sem problema, você paga na hora da entrega."
  }
];

export function reconhecerFormaPagamento(texto) {
  const normalizado = normalizarTexto(texto);
  return FORMAS_DE_PAGAMENTO.find(({ padrao }) => padrao.test(normalizado)) ?? null;
}

export function instrucoesPagamento(formaPagamento) {
  const forma = FORMAS_DE_PAGAMENTO.find((f) => f.forma === formaPagamento);
  // Pedido antigo ou forma desconhecida: melhor não inventar instrução de pagamento
  if (!forma) return "A gente combina os detalhes do pagamento por aqui.";
  return forma.instrucoes();
}

export function rotuloFormaPagamento(formaPagamento) {
  return FORMAS_DE_PAGAMENTO.find((f) => f.forma === formaPagamento)?.rotulo ?? formaPagamento;
}

// Recibo: o que vai ser cobrado e pra onde vai. O cliente confere antes de confirmar.
export function montarResumoPedido(carrinho, catalogo, endereco) {
  const itens = detalharCarrinho(carrinho, catalogo);
  const total = calcularTotalCarrinho(carrinho, catalogo);

  const linhas = itens.map(
    (item) => `${item.quantidade}x *${item.produto.nome}* — ${formatarPreco(item.subtotal)}`
  );

  const partes = [`*Resumo do pedido*${NL}${linhas.join(NL)}${NL}Total: ${formatarPreco(total)}`];

  if (endereco) {
    partes.push(`*Entrega em:*${NL}${endereco}`);
  }

  return partes.join(`${NL}${NL}`);
}

// Mensagem de encerramento: o que foi comprado, como pagar e o que acontece agora.
export function montarConfirmacaoFinal(pedido, catalogo) {
  const resumo = montarResumoPedido(pedido.itens, catalogo, pedido.endereco);

  return [
    `Pedido ${pedido.id} confirmado! Obrigada pela preferência.`,
    resumo,
    `*Pagamento:* ${rotuloFormaPagamento(pedido.formaPagamento)}${NL}${instrucoesPagamento(pedido.formaPagamento)}`,
    "Assim que o pagamento for confirmado, a gente separa suas peças e te avisa por aqui quando o pedido sair pra entrega. Qualquer dúvida, é só chamar."
  ].join(`${NL}${NL}`);
}
