import { normalizarTexto } from "../utils/normalizarTexto.js";

// Carrinho guardado como [{ produtoId, quantidade }]: só a referência e a quantidade.
// Preço e nome saem do catálogo na hora de mostrar — se a loja mudar o preço, o carrinho
// não fica com um valor congelado de dias atrás.

function nomeCombina(produto, mencao) {
  const nome = normalizarTexto(produto.nome);
  const alvo = normalizarTexto(mencao);
  if (!alvo) return false;

  // "infantil unicórnio" dentro de "Pijama Infantil Unicórnio"
  if (nome.includes(alvo)) return true;

  // Mesma ideia, mas sem depender da ordem: "unicórnio infantil" também vale.
  const palavras = alvo.split(/\s+/).filter(Boolean);
  return palavras.length > 0 && palavras.every((palavra) => nome.includes(palavra));
}

// Devolve o produto quando a menção identifica um só, um array quando ela cabe em mais
// de um (o cliente precisa escolher), ou null quando não bate com nada.
//
// Procura primeiro no que acabou de ser mostrado: "quero o unicórnio" quase sempre se
// refere ao que está na tela, e não a um produto qualquer do catálogo.
export function resolverProdutoMencionado(mencao, ultimosProdutosMostrados = [], catalogoCompleto = []) {
  if (!normalizarTexto(mencao)) return null;

  for (const lista of [ultimosProdutosMostrados, catalogoCompleto]) {
    const achados = (lista ?? []).filter((produto) => nomeCombina(produto, mencao));

    // Duas entradas do mesmo produto (ex: mostrado e também no catálogo) não são ambiguidade
    const unicos = achados.filter(
      (produto, i) => achados.findIndex((outro) => outro.id === produto.id) === i
    );

    if (unicos.length === 1) return unicos[0];
    if (unicos.length > 1) return unicos;
  }

  return null;
}

// Novo array em vez de mutação: o carrinho da sessão só muda quando salvarCarrinho for
// chamado, o que deixa o fluxo em conversation.js explícito.
export function adicionarAoCarrinho(carrinho, produto, quantidade = 1) {
  const quantos = Number.isFinite(quantidade) && quantidade > 0 ? Math.floor(quantidade) : 1;
  const atual = carrinho ?? [];

  const jaTem = atual.some((item) => item.produtoId === produto.id);
  if (jaTem) {
    return atual.map((item) =>
      item.produtoId === produto.id
        ? { ...item, quantidade: item.quantidade + quantos }
        : { ...item }
    );
  }

  return [...atual.map((item) => ({ ...item })), { produtoId: produto.id, quantidade: quantos }];
}

export function calcularTotalCarrinho(carrinho, catalogo) {
  return (carrinho ?? []).reduce((total, item) => {
    const produto = catalogo.find((p) => p.id === item.produtoId);
    // Produto saiu do catálogo entre a adição e agora: ignora em vez de somar NaN
    if (!produto) return total;
    return total + produto.preco * item.quantidade;
  }, 0);
}

// Junta o item do carrinho com os dados do catálogo, pra quem for montar texto não
// precisar procurar produto por id em todo lugar.
export function detalharCarrinho(carrinho, catalogo) {
  return (carrinho ?? [])
    .map((item) => {
      const produto = catalogo.find((p) => p.id === item.produtoId);
      if (!produto) return null;
      return { produto, quantidade: item.quantidade, subtotal: produto.preco * item.quantidade };
    })
    .filter(Boolean);
}
