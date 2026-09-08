// Preço no formato brasileiro: 59.9 -> "R$ 59,90".
// Fica aqui porque é usado tanto pra montar a resposta de fallback quanto pra passar
// os preços já formatados pro prompt de geração — o modelo não deve reformatar número.

export function formatarPreco(preco) {
  return `R$ ${preco.toFixed(2).replace(".", ",")}`;
}
