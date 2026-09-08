// Armazenamento de sessões em memória (um Map por processo).
// Sem banco de dados por enquanto: o projeto ainda está em fase de demo, e reiniciar
// o servidor pode zerar as conversas sem prejuízo. Trocar por Redis/Postgres quando
// o bot for pra produção.

const MAX_MENSAGENS = 10; // 5 trocas (cliente + bot); acima disso a conversa encarece cada chamada à API sem ganho

const sessoes = new Map();

export function obterHistorico(from) {
  // Cópia: quem lê o histórico não deve conseguir alterar a sessão sem passar por adicionarMensagem
  return [...(sessoes.get(from) ?? [])];
}

export function adicionarMensagem(from, role, content) {
  const historico = sessoes.get(from) ?? [];
  historico.push({ role, content });

  // Mantém só as últimas MAX_MENSAGENS mensagens, descartando as mais antigas
  if (historico.length > MAX_MENSAGENS) {
    historico.splice(0, historico.length - MAX_MENSAGENS);
  }

  sessoes.set(from, historico);
  return historico;
}

export function limparHistorico(from) {
  sessoes.delete(from);
}
