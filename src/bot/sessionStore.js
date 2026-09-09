// Armazenamento de sessões em memória (um Map por processo).
// Sem banco de dados por enquanto: o projeto ainda está em fase de demo, e reiniciar
// o servidor pode zerar as conversas sem prejuízo. Trocar por Redis/Postgres quando
// o bot for pra produção.
//
// Cada sessão guarda dois estados independentes:
//   - historico: as últimas mensagens trocadas, usado como contexto da conversa
//   - filtros: o que o cliente já confirmou (tamanho, cor, estação...), acumulado
//     por nós e não pela IA — ver mesclarFiltros em filtrosState.js
//   - carrinho: [{ produtoId, quantidade }] do que o cliente quer levar
//   - ultimosProdutosMostrados: o que apareceu na última resposta, pra resolver
//     referências como "quero o unicórnio" sem adivinhação
//   - checkout: { etapa, endereco } enquanto o pedido está sendo fechado. O pedido só
//     é registrado quando as duas etapas terminam
//   - saudou: se a apresentação já foi feita nesta conversa

const MAX_MENSAGENS = 10; // 5 trocas (cliente + bot); acima disso a conversa encarece cada chamada à API sem ganho

const sessoes = new Map();

function obterSessao(from) {
  let sessao = sessoes.get(from);
  if (!sessao) {
    sessao = {
      historico: [],
      filtros: null,
      carrinho: [],
      ultimosProdutosMostrados: [],
      // { etapa: "endereco" | "pagamento", endereco } durante o fechamento do pedido
      checkout: null,
      // Marca explícita em vez de deduzir do histórico: duas entregas da mesma
      // mensagem liam o histórico vazio as duas e saudavam as duas.
      saudou: false
    };
    sessoes.set(from, sessao);
  }
  return sessao;
}

export function obterHistorico(from) {
  // Cópia: quem lê o histórico não deve conseguir alterar a sessão sem passar por adicionarMensagem
  return [...obterSessao(from).historico];
}

export function adicionarMensagem(from, role, content) {
  const sessao = obterSessao(from);
  sessao.historico.push({ role, content });

  // Mantém só as últimas MAX_MENSAGENS mensagens, descartando as mais antigas
  if (sessao.historico.length > MAX_MENSAGENS) {
    sessao.historico.splice(0, sessao.historico.length - MAX_MENSAGENS);
  }

  return [...sessao.historico];
}

export function obterFiltros(from) {
  const { filtros } = obterSessao(from);
  return filtros ? { ...filtros } : null;
}

export function salvarFiltros(from, filtros) {
  const sessao = obterSessao(from);
  sessao.filtros = filtros ? { ...filtros } : null;
  return sessao.filtros;
}

export function obterCarrinho(from) {
  return obterSessao(from).carrinho.map((item) => ({ ...item }));
}

export function salvarCarrinho(from, carrinho) {
  const sessao = obterSessao(from);
  sessao.carrinho = (carrinho ?? []).map((item) => ({ ...item }));
  return sessao.carrinho.map((item) => ({ ...item }));
}

export function obterUltimosProdutosMostrados(from) {
  return [...obterSessao(from).ultimosProdutosMostrados];
}

export function salvarUltimosProdutosMostrados(from, produtos) {
  const sessao = obterSessao(from);
  sessao.ultimosProdutosMostrados = [...(produtos ?? [])];
  return [...sessao.ultimosProdutosMostrados];
}

export function jaSaudou(from) {
  return obterSessao(from).saudou;
}

export function marcarSaudacao(from) {
  obterSessao(from).saudou = true;
}

export function obterCheckout(from) {
  const { checkout } = obterSessao(from);
  return checkout ? { ...checkout } : null;
}

export function salvarCheckout(from, checkout) {
  const sessao = obterSessao(from);
  sessao.checkout = checkout ? { ...checkout } : null;
  return sessao.checkout ? { ...sessao.checkout } : null;
}

export function limparCheckout(from) {
  obterSessao(from).checkout = null;
}

// Zera a sessão inteira: histórico, filtros, carrinho e últimos produtos mostrados.
// Todos descrevem a mesma conversa, então não faz sentido descartar um e manter os outros.
export function limparHistorico(from) {
  sessoes.delete(from);
}
