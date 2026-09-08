// Armazenamento de sessões em memória (um Map por processo).
// Sem banco de dados por enquanto: o projeto ainda está em fase de demo, e reiniciar
// o servidor pode zerar as conversas sem prejuízo. Trocar por Redis/Postgres quando
// o bot for pra produção.
//
// Cada sessão guarda dois estados independentes:
//   - historico: as últimas mensagens trocadas, usado como contexto da conversa
//   - filtros: o que o cliente já confirmou (tamanho, cor, estação...), acumulado
//     por nós e não pela IA — ver mesclarFiltros em filtrosState.js

const MAX_MENSAGENS = 10; // 5 trocas (cliente + bot); acima disso a conversa encarece cada chamada à API sem ganho

const sessoes = new Map();

function obterSessao(from) {
  let sessao = sessoes.get(from);
  if (!sessao) {
    sessao = { historico: [], filtros: null };
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

// Zera a sessão inteira: histórico de mensagens e filtros acumulados.
// Os dois descrevem a mesma conversa, então não faz sentido descartar um e manter o outro.
export function limparHistorico(from) {
  sessoes.delete(from);
}
