import { interpretarPedido, gerarRespostaBusca } from "../services/claude.js";
import { buscarProdutos, validarContraCatalogo } from "./catalogSearch.js";
import {
  obterHistorico,
  adicionarMensagem,
  obterFiltros,
  salvarFiltros
} from "./sessionStore.js";
import { mesclarFiltros } from "./filtrosState.js";
import { SAUDACAO } from "./persona.js";
import { formatarPreco } from "../utils/formatarPreco.js";

// Fallback: texto montado pelo código, usado quando a geração pela IA falha. Feio,
// mas sempre correto — os dados saem direto do catálogo.
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
// guardamos como turno "assistant" no histórico. São propósitos diferentes — o cliente
// lê linguagem natural, o modelo lê o resumo enxuto na próxima mensagem.
async function montarResposta(filtros, conversa) {
  if (!filtros) {
    const texto = "Desculpa, não consegui entender direito. Pode reformular sua mensagem?";
    return { texto, resumo: texto };
  }

  switch (filtros.intencao) {
    case "buscar_produto": {
      const produtos = buscarProdutos(filtros);

      // A busca é do código; só o texto é da IA. Se a geração falhar, cai no template.
      const gerado = await gerarRespostaBusca(produtos, conversa);

      return {
        texto: gerado ?? montarRespostaBusca(produtos),
        resumo: resumirBusca(produtos)
      };
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

  // Histórico vazio = ninguém falou nada ainda nessa sessão, então é a primeira mensagem
  const primeiraMensagem = historico.length === 0;

  // A IA só precisa apontar o que é novo na mensagem atual; o acúmulo é nosso.
  const filtrosNovos = await interpretarPedido(textoCliente, historico, filtrosConhecidos);

  // Antes de mesclar: campo que a IA inventou e não existe no catálogo vira null aqui,
  // e assim nunca entra na sessão pra contaminar as próximas mensagens.
  const filtrosValidados = validarContraCatalogo(filtrosNovos);

  // Falha na API (filtrosNovos === null): não mexemos nos filtros da sessão, pra não
  // perder o que o cliente já tinha confirmado por causa de um erro passageiro.
  const filtros = filtrosValidados ? mesclarFiltros(filtrosConhecidos, filtrosValidados) : null;
  if (filtros) {
    salvarFiltros(from, filtros);
  }

  // A conversa que a IA vê pra escrever a resposta termina na mensagem atual do cliente
  const conversa = [...historico, { role: "user", content: textoCliente }];
  const { texto, resumo } = await montarResposta(filtros, conversa);

  // A apresentação é prefixada pelo código, não pedida ao modelo: assim ela acontece
  // sempre na primeira mensagem, e nunca se repete no meio da conversa.
  const textoFinal = primeiraMensagem ? `${SAUDACAO} ${texto}` : texto;

  // Guardamos as duas pontas da troca pra que a próxima mensagem desse cliente
  // chegue à Claude API já com o contexto do que foi conversado.
  adicionarMensagem(from, "user", textoCliente);
  adicionarMensagem(from, "assistant", resumo);

  return textoFinal;
}