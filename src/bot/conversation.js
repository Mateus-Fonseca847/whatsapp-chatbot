import { interpretarPedido, gerarRespostaBusca } from "../services/claude.js";
import {
  buscarProdutos,
  validarContraCatalogo,
  listarCategorias,
  diagnosticarBuscaVazia
} from "./catalogSearch.js";
import {
  obterHistorico,
  adicionarMensagem,
  obterFiltros,
  salvarFiltros,
  obterCarrinho,
  salvarCarrinho,
  obterUltimosProdutosMostrados,
  salvarUltimosProdutosMostrados,
  obterAguardandoPagamento,
  salvarAguardandoPagamento,
  limparAguardandoPagamento
} from "./sessionStore.js";
import { mesclarFiltros } from "./filtrosState.js";
import {
  resolverProdutoMencionado,
  adicionarAoCarrinho,
  calcularTotalCarrinho,
  detalharCarrinho
} from "./cart.js";
import { registrarPedido, atualizarFormaPagamento } from "../data/orders.js";
import { sugerirSemelhantes, PONTUACAO_ALTA } from "./similarProducts.js";
import { catalog } from "../data/catalog.js";
import { SAUDACAO } from "./persona.js";
import { formatarPreco } from "../utils/formatarPreco.js";
import { normalizarTexto } from "../utils/normalizarTexto.js";

// Quebra de linha das mensagens que vão pro cliente (WhatsApp), separada da quebra de
// linha do arquivo-fonte. Usada pelo catálogo, pela busca e pelo carrinho.
const eolTexto = "\n";

// Fallback: texto montado pelo código, usado quando a geração pela IA falha. Feio,
// mas sempre correto — os dados saem direto do catálogo.
function formatarListaProdutos(produtos) {
  return produtos
    .map((p, i) => {
      const tamanhosTexto = p.tamanhos.join(", ");
      return `${i + 1}. *${p.nome}*${eolTexto}   Cor: ${p.cor} | Tamanhos: ${tamanhosTexto}${eolTexto}   ${formatarPreco(p.preco)}`;
    })
    .join(`${eolTexto}${eolTexto}`);
}

// Ficha de uma peça, do jeito que vai na legenda da foto. Mesmo conteúdo que antes ia
// na lista de texto — agora uma mensagem por produto, com a imagem junto.
export function montarLegendaProduto(produto) {
  const tamanhos = produto.tamanhos.join(", ");
  return `*${produto.nome}*${eolTexto}Cor: ${produto.cor} | Tamanhos: ${tamanhos}${eolTexto}${formatarPreco(produto.preco)}`;
}

// Junta tudo num texto só. Serve os canais que ainda não mandam imagem (Meta e Twilio)
// e os logs: sem isso, uma resposta com produtos viraria [object Object] lá.
export function achatarResposta(resposta) {
  if (typeof resposta === "string") return resposta;

  const fichas = resposta.produtos.map((produto) => montarLegendaProduto(produto));
  return [resposta.texto, ...fichas].join(`${eolTexto}${eolTexto}`);
}

// Fallback: frase de abertura montada pelo código, usada quando a geração pela IA falha.
// Não descreve as peças — cada uma vai numa mensagem própria, com foto e ficha.
function montarRespostaBusca(produtos) {
  if (produtos.length === 0) {
    return "Não encontrei nenhum produto com esses critérios. Quer tentar descrever de outro jeito?";
  }

  const plural = produtos.length > 1 ? "ões" : "ão";
  return `Encontrei ${produtos.length} opç${plural} pra você:`;
}

// --- Catálogo -------------------------------------------------------------
// Determinística, como o carrinho: listar o que a loja tem é fato, não conversa. A IA
// já resumiu lista e omitiu preço antes — aqui isso significaria esconder produto do
// cliente sem ninguém perceber.

function juntarComE(itens) {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

// Devolve { produtos, texto, resumo }: `produtos` é o que foi efetivamente listado, pra
// quem chamou poder guardar como "últimos mostrados".
export function montarRespostaCatalogo(filtros, catalogo) {
  // Sem categoria: o cliente pediu pra ver tudo de forma genérica. Em vez de despejar o
  // catálogo inteiro, oferece os segmentos que existem e deixa ele escolher.
  if (!filtros?.categoria) {
    const categorias = listarCategorias(catalogo);

    if (categorias.length === 0) {
      return {
        produtos: [],
        texto: "Ainda não tenho nenhuma peça cadastrada pra te mostrar.",
        resumo: "Catálogo: vazio"
      };
    }

    return {
      produtos: [],
      texto: `A gente tem pijama ${juntarComE(categorias)}. Qual desses você quer ver?`,
      resumo: `Catálogo: categorias disponíveis — ${categorias.join(", ")}`
    };
  }

  const produtos = buscarProdutos({ categoria: filtros.categoria }, catalogo);

  if (produtos.length === 0) {
    return {
      produtos: [],
      texto: `No momento não tenho nenhum pijama ${filtros.categoria} pra te mostrar. Quer ver outra categoria?`,
      resumo: `Catálogo ${filtros.categoria}: nenhum produto`
    };
  }

  const plural = produtos.length > 1 ? "s" : "";
  const nomes = produtos.map((produto) => produto.nome).join(", ");

  return {
    produtos,
    texto: `Essas são as opções de pijama ${filtros.categoria}:`,
    resumo: `Catálogo ${filtros.categoria}: ${produtos.length} produto${plural} — ${nomes}`
  };
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
    `Seu carrinho está em ${formatarPreco(total)}. Você se interessou por algo mais?`;

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

  // A próxima mensagem do cliente é a resposta da pergunta abaixo, não um pedido novo.
  salvarAguardandoPagamento(from, pedido.id);

  const resumoItens = itens.map((item) => `${item.quantidade}x ${item.produto.nome}`).join(", ");
  const texto =
    `Pedido anotado: ${resumoItens}. Total de ${formatarPreco(total)}.` +
    `${eolTexto}${eolTexto}O pagamento a gente combina à parte — pode ser Pix, cartão ou acertar na entrega. ` +
    "Como você prefere?";

  return {
    texto,
    resumo: `Pedido ${pedido.id} registrado (pendente), total ${formatarPreco(total)}`
  };
}

// Busca vazia tem duas causas bem diferentes, e a resposta certa muda com elas:
// o cliente pediu algo que a loja não tem ("sem_correspondencia"), ou pediu abaixo do
// que a loja pratica ("preco"). Só a segunda vira conversa sobre preço.
function escolherAlternativas(filtros, encontrados) {
  if (encontrados.length === 0 && filtros.preco_maximo) {
    const { motivo, opcoes } = diagnosticarBuscaVazia(filtros, catalog);

    if (motivo === "preco") {
      return { alternativas: opcoes, motivo: "preco_baixo" };
    }
  }

  // Qualquer outro caso segue o fluxo de peças parecidas, inalterado.
  return { alternativas: buscarAlternativas(filtros, encontrados), motivo: "semelhante" };
}

// Formas que a loja aceita, reconhecidas por palavra-chave. Determinístico de
// propósito: mandar "pix" pra IA interpretar custaria uma chamada e devolveria
// "intencao: ver_carrinho" num carrinho já esvaziado — que foi exatamente o bug.
const FORMAS_DE_PAGAMENTO = [
  { forma: "pix", rotulo: "Pix", padrao: /\bpix\b/ },
  { forma: "cartao", rotulo: "cartão", padrao: /cartao|credito|debito/ },
  { forma: "combinar_na_entrega", rotulo: "acerto na entrega", padrao: /dinheiro|entrega|combinar/ }
];

// Devolve o texto de confirmação quando a mensagem responde à pergunta de pagamento,
// e null quando não é o caso (a mensagem segue pro fluxo normal).
function tratarRespostaDePagamento(from, textoCliente) {
  const pedidoId = obterAguardandoPagamento(from);
  if (!pedidoId) return null;

  // Independente de reconhecer ou não, a espera acaba aqui: se o cliente mudou de
  // assunto, a conversa não pode ficar presa esperando uma forma de pagamento.
  limparAguardandoPagamento(from);

  const normalizado = normalizarTexto(textoCliente);
  const escolhida = FORMAS_DE_PAGAMENTO.find(({ padrao }) => padrao.test(normalizado));
  if (!escolhida) return null;

  const pedido = atualizarFormaPagamento(pedidoId, escolhida.forma);
  if (!pedido) return null; // pedido sumiu (servidor reiniciado): trata como mensagem nova

  return `Anotado: ${escolhida.rotulo} no pedido ${pedido.id}. Qualquer dúvida é só chamar!`;
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
      const { alternativas, motivo } = escolherAlternativas(filtros, produtos);
      const mostrados = [...produtos, ...alternativas];

      // Guarda o que foi mostrado (encontrados e sugeridos) pra que a próxima mensagem
      // possa dizer só "quero o unicórnio" e a gente saber do que ela fala.
      if (mostrados.length > 0) {
        salvarUltimosProdutosMostrados(from, mostrados);
      }

      // A busca é do código; só o texto é da IA. Se a geração falhar, cai no template.
      const gerado = await gerarRespostaBusca(produtos, alternativas, conversa, motivo);

      return {
        texto: gerado ?? montarRespostaBusca(produtos),
        resumo: resumirBusca(produtos),
        // Cada peça vira uma mensagem própria, com foto quando existir. Encontrados e
        // alternativas entram na mesma leva: os dois foram oferecidos pro cliente.
        produtos: mostrados
      };
    }

    case "ver_catalogo": {
      const { produtos, texto, resumo } = montarRespostaCatalogo(filtros, catalog);

      // Mesma memória que o carrinho usa: depois de navegar pelo catálogo, o cliente
      // pode dizer só "quero o unicórnio" — não precisa ter vindo de uma busca filtrada.
      if (produtos.length > 0) {
        salvarUltimosProdutosMostrados(from, produtos);
      }

      return { texto, resumo, produtos };
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
  // Se o pedido acabou de fechar, a mensagem que chega agora é a resposta de "como
  // você prefere pagar?" — não um pedido novo. Isso corre antes de interpretarPedido:
  // além de mais confiável, economiza a chamada à API.
  const confirmacaoPagamento = tratarRespostaDePagamento(from, textoCliente);
  if (confirmacaoPagamento) {
    adicionarMensagem(from, "user", textoCliente);
    adicionarMensagem(from, "assistant", confirmacaoPagamento);
    return confirmacaoPagamento;
  }

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
  const { texto, resumo, produtos = [] } = await montarResposta(from, filtros, conversa);

  // A apresentação é prefixada pelo código, não pedida ao modelo: assim ela acontece
  // sempre na primeira mensagem, e nunca se repete no meio da conversa.
  const textoFinal = primeiraMensagem ? `${SAUDACAO} ${texto}` : texto;

  // Guardamos as duas pontas da troca pra que a próxima mensagem desse cliente
  // chegue à Claude API já com o contexto do que foi conversado.
  adicionarMensagem(from, "user", textoCliente);
  adicionarMensagem(from, "assistant", resumo);

  // Contrato: string quando é só conversa (confirmação de carrinho, recusa, dúvida), e
  // { texto, produtos } quando há peças pra mostrar — o canal manda uma mensagem por
  // produto, com foto. Quem só sabe texto usa achatarResposta.
  return produtos.length > 0 ? { texto: textoFinal, produtos } : textoFinal;
}