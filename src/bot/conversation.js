import { interpretarPedido } from "../services/claude.js";
import { buscarProdutos } from "./catalogSearch.js";
import {
  obterHistorico,
  adicionarMensagem,
  obterFiltros,
  salvarFiltros
} from "./sessionStore.js";
import { mesclarFiltros } from "./filtrosState.js";

function formatarPreco(preco) {
  return `R$ ${preco.toFixed(2).replace(".", ",")}`;
}

function montarRespostaBusca(produtos) {
  if (produtos.length === 0) {
    return "Não encontrei nenhum produto com esses critérios. Quer tentar descrever de outro jeito?";
  }

  const linhas = produtos.map((p, i) => {
    const tamanhosTexto = p.tamanhos.join(", ");
    return `${i + 1}. *${p.nome}*\n   Cor: ${p.cor} | Tamanhos: ${tamanhosTexto}\n   ${formatarPreco(p.preco)}`;
  });

  return `Encontrei ${produtos.length} produto(s):\n\n${linhas.join("\n\n")}`;
}

// Versão enxuta do resultado, pro histórico enviado à Claude API. A resposta que vai
// pro WhatsApp tem negrito, quebras de linha e preços — ruído que só encarece as
// próximas chamadas sem ajudar o modelo a interpretar o pedido seguinte.
function resumirBusca(produtos) {
  if (produtos.length === 0) {
    return "Resultado: nenhum produto encontrado";
  }

  const plural = produtos.length > 1 ? "s" : "";
  const nomes = produtos.map((p) => p.nome).join(", ");
  return `Resultado: ${produtos.length} produto${plural} encontrado${plural} — ${nomes}`;
}

// Devolve { texto, resumo }: `texto` é o que o cliente recebe, `resumo` é o que
// guardamos como turno "assistant" no histórico.
function montarResposta(filtros) {
  if (!filtros) {
    const texto = "Desculpa, não consegui entender direito. Pode reformular sua mensagem?";
    return { texto, resumo: texto };
  }

  switch (filtros.intencao) {
    case "buscar_produto": {
      const produtos = buscarProdutos(filtros);
      return { texto: montarRespostaBusca(produtos), resumo: resumirBusca(produtos) };
    }

    case "ver_carrinho":
    case "finalizar_pedido": {
      const texto = "Essa parte do carrinho ainda está sendo construída — chega em breve!";
      return { texto, resumo: texto };
    }

    case "duvida_geral": {
      const texto =
        "Posso te ajudar a encontrar pijamas! Me conta o que você procura (tamanho, cor, estação do ano).";
      return { texto, resumo: texto };
    }

    default: {
      const texto = "Não entendi muito bem o que você precisa. Pode me dar mais detalhes?";
      return { texto, resumo: texto };
    }
  }
}

export async function processarMensagem(from, textoCliente) {
  const historico = obterHistorico(from);
  const filtrosConhecidos = obterFiltros(from);

  // A IA só precisa apontar o que é novo na mensagem atual; o acúmulo é nosso.
  const filtrosNovos = await interpretarPedido(textoCliente, historico, filtrosConhecidos);

  // Falha na API (filtrosNovos === null): não mexemos nos filtros da sessão, pra não
  // perder o que o cliente já tinha confirmado por causa de um erro passageiro.
  const filtros = filtrosNovos ? mesclarFiltros(filtrosConhecidos, filtrosNovos) : null;
  if (filtros) {
    salvarFiltros(from, filtros);
  }

  const { texto, resumo } = montarResposta(filtros);

  // Guardamos as duas pontas da troca pra que a próxima mensagem desse cliente
  // chegue à Claude API já com o contexto do que foi conversado.
  adicionarMensagem(from, "user", textoCliente);
  adicionarMensagem(from, "assistant", resumo);

  return texto;
}