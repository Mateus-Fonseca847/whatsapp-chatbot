import { interpretarPedido } from "../services/claude.js";
import { buscarProdutos } from "./catalogSearch.js";
import { obterHistorico, adicionarMensagem } from "./sessionStore.js";

function formatarPreco(preco) {
  return `R$ ${preco.toFixed(2).replace(".", ",")}`;
}

function montarRespostaBusca(produtos) {
  if (produtos.length === 0) {
    return "Não encontrei nenhum produto com esses critérios 😕 Quer tentar descrever de outro jeito?";
  }

  const linhas = produtos.map((p, i) => {
    const tamanhosTexto = p.tamanhos.join(", ");
    return `${i + 1}. *${p.nome}*\n   Cor: ${p.cor} | Tamanhos: ${tamanhosTexto}\n   ${formatarPreco(p.preco)}`;
  });

  return `Encontrei ${produtos.length} produto(s):\n\n${linhas.join("\n\n")}`;
}

function montarResposta(filtros) {
  if (!filtros) {
    return "Desculpa, não consegui entender direito 😅 Pode reformular sua mensagem?";
  }

  switch (filtros.intencao) {
    case "buscar_produto": {
      const produtos = buscarProdutos(filtros);
      return montarRespostaBusca(produtos);
    }

    case "ver_carrinho":
    case "finalizar_pedido":
      return "Essa parte do carrinho ainda está sendo construída — chega em breve! 🛠️";

    case "duvida_geral":
      return "Posso te ajudar a encontrar pijamas! Me conta o que você procura (tamanho, cor, estação do ano).";

    default:
      return "Não entendi muito bem o que você precisa. Pode me dar mais detalhes?";
  }
}

export async function processarMensagem(from, textoCliente) {
  const historico = obterHistorico(from);
  const filtros = await interpretarPedido(textoCliente, historico);
  const resposta = montarResposta(filtros);

  // Guardamos as duas pontas da troca pra que a próxima mensagem desse cliente
  // chegue à Claude API já com o contexto do que foi conversado.
  adicionarMensagem(from, "user", textoCliente);
  adicionarMensagem(from, "assistant", resposta);

  return resposta;
}