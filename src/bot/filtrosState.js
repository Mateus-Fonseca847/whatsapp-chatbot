// Acúmulo de filtros ao longo de uma conversa.
//
// A IA só precisa dizer o que é novo na mensagem atual; quem mantém a memória do
// que já foi confirmado somos nós. Assim uma mensagem como "prefiro tamanho 8"
// não apaga o "inverno" que o cliente disse duas mensagens atrás, e o resultado
// não depende do modelo repetir corretamente tudo que veio antes.

// `intencao` descreve o que o cliente quer AGORA ("buscar_produto", "ver_carrinho"...),
// então nunca é herdada da mensagem anterior — sempre vem da mensagem atual.
const CAMPOS_NAO_HERDADOS = ["intencao"];

export function mesclarFiltros(anteriores, novos) {
  const base = anteriores ?? {};
  const atuais = novos ?? {};

  const resultado = { ...base };

  for (const campo of Object.keys(atuais)) {
    // null significa "a mensagem atual não fala disso" — mantemos o que já sabíamos
    if (atuais[campo] !== null && atuais[campo] !== undefined) {
      resultado[campo] = atuais[campo];
    }
  }

  for (const campo of CAMPOS_NAO_HERDADOS) {
    resultado[campo] = atuais[campo] ?? null;
  }

  return resultado;
}
