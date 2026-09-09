import { interpretarPedido, gerarRespostaBusca } from "../services/claude.js";
import { buscarProdutos, validarContraCatalogo } from "./catalogSearch.js";
import {
  obterHistorico,
  adicionarMensagem,
  obterFiltros,
  salvarFiltros,
  obterCarrinho,
  salvarCarrinho,
  obterUltimosProdutosMostrados,
  salvarUltimosProdutosMostrados
} from "./sessionStore.js";
import { mesclarFiltros } from "./filtrosState.js";
import {
  resolverProdutoMencionado,
  adicionarAoCarrinho,
  calcularTotalCarrinho,
  detalharCarrinho
} from "./cart.js";
import { registrarPedido } from "../data/orders.js";
import { sugerirSemelhantes, PONTUACAO_ALTA } from "./similarProducts.js";
import { catalog } from "../data/catalog.js";
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

// Quanto pior o resultado da busca, mais espaço pra sugerir peça parecida:
// - nada encontrado: sugere até 3, é o que o cliente tem pra olhar
// - 1 ou 2 encontrados: no máximo 1, e só se for bem parecida — o cliente já tem opção
// - 3 ou mais: não sugere nada, a resposta já está cheia
function buscarAlternativas(filtros, encontrados) {
  if (encontrados.length >= 3) return [];

  if (encontrados.length === 0) {
    return sugerirSemelhantes(filtros, catalog, encontrados);
  }

  return sugerirSemelhantes(filtros, catalog, encontrados, {
    limite: 1,
    pontuacaoMinima: PONTUACAO_ALTA
  });
}

// --- Carrinho -------------------------------------------------------------
// Quebra de linha das mensagens que vão pro cliente (WhatsApp), separada da quebra de
// linha do arquivo-fonte.
const eolTexto = "\n";

// As respostas de carrinho são montadas pelo código, não geradas pela IA. Aqui se fala
// de quantidade, preço e pedido fechado: é onde um texto "quase certo" custa dinheiro.

function linhaDoItem({ produto, quantidade, subtotal }) {
  return `${quantidade}x *${produto.nome}* — ${formatarPreco(produto.preco)} cada = ${formatarPreco(subtotal)}`;
}

function textoDoCarrinho(itens, total) {
  const linhas = itens.map((item) => linhaDoItem(item)).join(eolTexto);
  return `Seu carrinho:${eolTexto}${eolTexto}${linhas}${eolTexto}${eolTexto}Total: ${formatarPreco(total)}`;
}

function tratarAdicionarCarrinho(from, filtros) {
  const mencao = filtros.produto_mencionado;

  if (!mencao) {
    const texto = "Qual peça você quer levar? Me diz o nome que eu coloco no carrinho.";
    return { texto, resumo: "Carrinho: produto não informado" };
  }

  // Procura primeiro no que acabou de ser mostrado — "quero o unicórnio" quase sempre
  // se refere ao que está na tela, não a um produto qualquer do catálogo.
  const encontrado = resolverProdutoMencionado(mencao, obterUltimosProdutosMostrados(from), catalog);

  if (!encontrado) {
    const texto = `Não achei nenhuma peça como "${mencao}" por aqui. Pode me dizer o nome como aparece na lista?`;
    return { texto, resumo: `Carrinho: "${mencao}" não encontrado` };
  }

  if (Array.isArray(encontrado)) {
    const nomes = encontrado.map((produto) => `*${produto.nome}*`).join(", ");
    const texto = `Achei mais de uma peça com esse nome: ${nomes}. Qual delas você quer?`;
    return { texto, resumo: `Carrinho: "${mencao}" ambíguo entre ${encontrado.length} produtos` };
  }

  const quantidade = Number(filtros.quantidade) > 0 ? Math.floor(Number(filtros.quantidade)) : 1;
  const carrinho = adicionarAoCarrinho(obterCarrinho(from), encontrado, quantidade);
  salvarCarrinho(from, carrinho);

  const subtotal = encontrado.preco * quantidade;
  const total = calcularTotalCarrinho(carrinho, catalog);

  const texto =
    `Coloquei ${quantidade}x *${encontrado.nome}* no seu carrinho, ${formatarPreco(encontrado.preco)} cada` +
    `${quantidade > 1 ? ` (${formatarPreco(subtotal)})` : ""}. ` +
    `Seu carrinho está em ${formatarPreco(total)}. Quer levar mais alguma coisa ou já fecho o pedido?`;

  return { texto, resumo: `Carrinho: +${quantidade}x ${encontrado.nome}, total ${formatarPreco(total)}` };
}

function tratarVerCarrinho(from) {
  const itens = detalharCarrinho(obterCarrinho(from), catalog);

  if (itens.length === 0) {
    const texto = "Seu carrinho ainda está vazio. Me conta o que você procura que eu te mostro as opções.";
    return { texto, resumo: "Carrinho: vazio" };
  }

  const total = itens.reduce((soma, item) => soma + item.subtotal, 0);
  return {
    texto: textoDoCarrinho(itens, total),
    resumo: `Carrinho: ${itens.length} item(ns), total ${formatarPreco(total)}`
  };
}

function tratarFinalizarPedido(from) {
  const carrinho = obterCarrinho(from);
  const itens = detalharCarrinho(carrinho, catalog);

  if (itens.length === 0) {
    const texto = "Seu carrinho está vazio, então não tenho o que fechar ainda. Quer ver alguma peça?";
    return { texto, resumo: "Pedido: não finalizado, carrinho vazio" };
  }

  const total = calcularTotalCarrinho(carrinho, catalog);
  const pedido = registrarPedido(from, carrinho, total);

  // Carrinho esvaziado só depois do pedido registrado: se registrar falhasse, o cliente
  // não ficaria sem o carrinho e sem o pedido.
  salvarCarrinho(from, []);

  const resumoItens = itens.map((item) => `${item.quantidade}x ${item.produto.nome}`).join(", ");
  const texto =
    `Pedido ${pedido.id} anotado: ${resumoItens}. Total de ${formatarPreco(total)}.` +
    `${eolTexto}${eolTexto}O pagamento a gente combina à parte — pode ser Pix, cartão ou acertar na entrega. ` +
    "Como você prefere?";

  return {
    texto,
    resumo: `Pedido ${pedido.id} registrado (pendente), total ${formatarPreco(total)}`
  };
}

// Devolve { texto, resumo }: `texto` é o que o cliente recebe, `resumo` é o que
// guardamos como turno "assistant" no histórico. São propósitos diferentes — o cliente
// lê linguagem natural, o modelo lê o resumo enxuto na próxima mensagem.
async function montarResposta(from, filtros, conversa) {
  if (!filtros) {
    const texto = "Desculpa, não consegui entender direito. Pode reformular sua mensagem?";
    return { texto, resumo: texto };
  }

  switch (filtros.intencao) {
    case "buscar_produto": {
      const produtos = buscarProdutos(filtros);
      const alternativas = buscarAlternativas(filtros, produtos);
      const mostrados = [...produtos, ...alternativas];

      // Guarda o que foi mostrado (encontrados e sugeridos) pra que a próxima mensagem
      // possa dizer só "quero o unicórnio" e a gente saber do que ela fala.
      if (mostrados.length > 0) {
        salvarUltimosProdutosMostrados(from, mostrados);
      }

      // A busca é do código; só o texto é da IA. Se a geração falhar, cai no template.
      const gerado = await gerarRespostaBusca(produtos, alternativas, conversa);

      return {
        texto: gerado ?? montarRespostaBusca(produtos),
        resumo: resumirBusca(produtos)
      };
    }

    case "adicionar_carrinho":
      return tratarAdicionarCarrinho(from, filtros);

    case "ver_carrinho":
      return tratarVerCarrinho(from);

    case "finalizar_pedido":
      return tratarFinalizarPedido(from);

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
  const { texto, resumo } = await montarResposta(from, filtros, conversa);

  // A apresentação é prefixada pelo código, não pedida ao modelo: assim ela acontece
  // sempre na primeira mensagem, e nunca se repete no meio da conversa.
  const textoFinal = primeiraMensagem ? `${SAUDACAO} ${texto}` : texto;

  // Guardamos as duas pontas da troca pra que a próxima mensagem desse cliente
  // chegue à Claude API já com o contexto do que foi conversado.
  adicionarMensagem(from, "user", textoCliente);
  adicionarMensagem(from, "assistant", resumo);

  return textoFinal;
}