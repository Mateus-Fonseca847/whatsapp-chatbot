// Pedidos registrados, em memória — mesma fase de demo do sessionStore: sem banco, e
// reiniciar o servidor zera tudo. Vira tabela quando o projeto sair do protótipo.
//
// Nada aqui processa pagamento: o pedido nasce "pendente" e o acerto (Pix, cartão ou
// combinar na entrega) é feito por fora, entre a loja e o cliente.

const pedidos = [];

export function registrarPedido(from, carrinho, total, dados = {}) {
  const pedido = {
    id: `PED-${String(pedidos.length + 1).padStart(4, "0")}`,
    from,
    itens: (carrinho ?? []).map((item) => ({ ...item })),
    total,
    criadoEm: new Date().toISOString(),
    status: "pendente",
    // Preenchidos no fechamento: o pedido só é registrado com os dois já definidos
    endereco: dados.endereco ?? null,
    formaPagamento: dados.formaPagamento ?? null
  };

  pedidos.push(pedido);
  return { ...pedido };
}

// `from` opcional: sem ele devolve todos os pedidos registrados.
export function listarPedidos(from) {
  const filtrados = from ? pedidos.filter((pedido) => pedido.from === from) : pedidos;
  return filtrados.map((pedido) => ({ ...pedido }));
}
