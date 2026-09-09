import axios from "axios";
import { NOME_BOT, NOME_LOJA, TOM_DE_VOZ, DIFERENCIAIS_LOJA } from "../bot/persona.js";
import { formatarPreco } from "../utils/formatarPreco.js";
import { CAMPOS_POR_MENSAGEM } from "../bot/filtrosState.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // rápido e barato, ideal pra essa tarefa simples

const SYSTEM_PROMPT = `Você extrai informações de pedidos de uma loja de roupas a partir de mensagens de clientes no WhatsApp.

Responda APENAS com um JSON válido, sem nenhum texto antes ou depois, neste formato exato:
{
  "categoria": "feminino" | "masculino" | "infantil" | "plus size" | null,
  "tamanho": string ou null,
  "cor": string ou null,
  "tecido": string ou null,
  "estacao": "verao" | "inverno" | null,
  "preco_maximo": number ou null,
  "produto_mencionado": string ou null,
  "quantidade": number ou null,
  "intencao": "buscar_produto" | "ver_catalogo" | "adicionar_carrinho" | "ver_carrinho" | "finalizar_pedido" | "duvida_geral"
}

Regras importantes:
- Para categoria "infantil", se o cliente mencionar a idade da criança (ex: "8 anos", "uns 6 anininhos"), use esse número como "tamanho", já que roupas infantis geralmente são numeradas por idade.
- Para categoria "feminino", "masculino" ou "plus size", use os tamanhos padrão (PP, P, M, G, GG) quando mencionados.
- Use "ver_catalogo" quando o cliente quiser ver o que a loja tem sem dar critério ("o que vocês têm?", "me mostra as opções", "quero ver as opções de menina"). Nesse caso preencha "categoria" só se ele indicar um segmento, e deixe null quando ele pedir tudo de forma genérica. Se ele descrever características (cor, tamanho, estação, preço), é "buscar_produto", não "ver_catalogo".
- Use "adicionar_carrinho" quando o cliente quiser levar uma peça específica ("quero o infantil unicórnio", "vou levar dois desse", "pode colocar o floral"). Use "buscar_produto" quando ele estiver descrevendo o que procura, e não escolhendo.
- "produto_mencionado" é o nome, ou o pedaço do nome, que o cliente citou ("infantil unicórnio", "o floral"). Copie o que ele disse, sem completar com nome de produto que ele não falou.
- "quantidade" é quantas unidades ele pediu. Deixe null se ele não disser o número.
- Use null nos campos que não estiverem claros na mensagem. Nunca invente informação que o cliente não disse além do que essas regras permitem.`;

function montarSystemPrompt(filtrosConhecidos) {
  // Só interessa ao modelo o que de fato está preenchido, e só o que descreve o pedido
  // acumulado: intenção, produto citado e quantidade valem só pra mensagem em que foram
  // ditos, e listá-los como "confirmados" induziria o modelo a repeti-los.
  const confirmados = Object.fromEntries(
    Object.entries(filtrosConhecidos ?? {}).filter(
      ([campo, valor]) =>
        !CAMPOS_POR_MENSAGEM.includes(campo) && valor !== null && valor !== undefined
    )
  );

  // Primeira mensagem da conversa (ou nada confirmado ainda): prompt base.
  if (Object.keys(confirmados).length === 0) {
    return SYSTEM_PROMPT;
  }

  // Dizendo ao modelo o que já está confirmado, ele não precisa relembrar a conversa
  // inteira — só apontar o que mudou. O acúmulo em si é feito por mesclarFiltros.
  return `${SYSTEM_PROMPT}

Filtros já confirmados nesta conversa: ${JSON.stringify(confirmados)}.
Extraia da mensagem atual apenas informações novas ou que contradigam o que já foi dito; use null pro que não mudou.`;
}

function limparRespostaJSON(texto) {
  // Às vezes o modelo envolve o JSON em ```json ... ``` mesmo quando pedimos pra não fazer isso.
  // Essa função remove essa "casca" antes de tentar interpretar.
  return texto.replace(/```json\n?|```\n?/g, "").trim();
}

function garantirApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY não encontrada. Verifique se o arquivo .env existe na raiz do projeto e se a chave está preenchida."
    );
  }
}

function cabecalhos() {
  return {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  };
}

function registrarErro(contexto, erro) {
  // Erro de resposta da própria API (ex: 401, 400, 429)
  if (erro.response) {
    console.error(`Erro da API Claude (${contexto}):`, erro.response.status, erro.response.data);
  } else {
    console.error(`Erro ao chamar a API Claude (${contexto}):`, erro.message);
  }
}

export async function interpretarPedido(textoCliente, historico = [], filtrosConhecidos = null) {
  garantirApiKey();

  try {
    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: MODEL,
        max_tokens: 300,
        system: montarSystemPrompt(filtrosConhecidos),
        // O histórico vem antes da mensagem atual pra que o modelo entenda
        // perguntas de acompanhamento ("prefiro tamanho 8") no contexto certo.
        messages: [...historico, { role: "user", content: textoCliente }]
      },
      { headers: cabecalhos() }
    );

    const textoResposta = response.data.content[0].text;
    return JSON.parse(limparRespostaJSON(textoResposta));

  } catch (erro) {
    registrarErro("interpretarPedido", erro);
    return null;
  }
}

function listarProdutosParaPrompt(produtos) {
  return produtos
    .map(
      (p) =>
        `- ${p.nome} | cor: ${p.cor} | tamanhos: ${p.tamanhos.join(", ")} | preço: ${formatarPreco(p.preco)}`
    )
    .join("\n");
}

function montarSystemPromptResposta(produtos, alternativas, motivoAlternativas) {
  const partes = [
    `Você é a ${NOME_BOT}, atendente da ${NOME_LOJA} no WhatsApp.

${TOM_DE_VOZ}

Escreva a resposta para a última mensagem do cliente. Responda apenas com o texto da mensagem, sem aspas e sem comentários seus.
Não se apresente nem diga o seu nome, e não comece com saudação ("Oi", "Olá", "Bom dia"): quando a apresentação é necessária, ela já é feita antes da sua resposta, e cumprimentar de novo soa repetitivo. Vá direto ao assunto.`
  ];

  // Quem decide o que existe é o código, não o modelo: as listas abaixo saem da busca no
  // catálogo. Sem essa amarra, a IA "ajuda" inventando produto, preço e disponibilidade.
  if (produtos.length > 0) {
    partes.push(`Produtos encontrados na busca, exatamente o que o cliente pediu:
${listarProdutosParaPrompt(produtos)}`);
  } else if (motivoAlternativas !== "preco_baixo") {
    partes.push(
      "A busca no catálogo não encontrou nenhum produto com os critérios que o cliente pediu. Reconheça isso com empatia."
    );
  }

  if (alternativas.length > 0 && motivoAlternativas === "preco_baixo") {
    // O catálogo TEM o que ele pediu; o que não bate é o valor. Recusar sem explicar o
    // porquê soa arrogante, e deixar o modelo inventar o porquê é pior ainda — daí a
    // lista fechada de motivos reais.
    partes.push(`O cliente pediu uma peça por um valor abaixo do que a loja pratica. Não é que não exista o que ele quer: o que existe custa mais do que ele falou.

Reconheça isso com gentileza, sem soar defensiva e sem fazer o cliente se sentir mal pelo valor que falou.

Explique o porquê citando no máximo DOIS destes motivos, e nenhum outro. Escolha os dois que mais combinam com o que o cliente pediu e não mencione os demais — listar todos soa a discurso de vendedor. Nunca invente uma razão que não esteja nesta lista:
${DIFERENCIAIS_LOJA.map((diferencial) => `- ${diferencial}`).join("\n")}

Peças que atendem o resto do pedido, da mais barata para a mais cara:
${listarProdutosParaPrompt(alternativas)}

Ofereça essas peças como o que mais se aproxima do que ele pediu. Não prometa desconto, promoção, parcelamento nem nada que não esteja nesta mensagem.`);
  } else if (alternativas.length > 0) {
    partes.push(`Peças parecidas que existem no catálogo, para oferecer como alternativa:
${listarProdutosParaPrompt(alternativas)}

${produtos.length > 0 ? "Apresente primeiro o que foi encontrado e depois ofereça a alternativa." : "Ofereça essas peças como o que há de mais próximo."}
Deixe claro que são peças parecidas, e não exatamente o que o cliente pediu.`);
  } else if (produtos.length === 0) {
    // O modelo já especulou aqui ("temos opções, mas mais caras") sem ter recebido nada
    // do catálogo. Nesta chamada ele não sabe o que a loja tem — então não fala disso.
    partes.push(`Você não tem nenhuma peça pra oferecer nesta resposta.
Não cite, sugira nem invente produto nenhum, e não prometa avisar depois.
Não diga nada sobre o que a loja tem ou deixa de ter além do que está nesta mensagem, porque você não tem essa informação aqui: nada de "temos outras opções", "só temos mais caro", "às vezes temos com outro nome", "pode ser que tenha" ou qualquer frase que insinue ou descarte a existência de outras peças.
Convide o cliente a descrever o que procura de outro jeito, sem prometer nem sugerir disponibilidade.`);
  }

  if (produtos.length > 0 || alternativas.length > 0) {
    partes.push(`Mencione apenas os produtos listados acima, com exatamente os preços, cores e tamanhos fornecidos. Nunca invente ou sugira produtos que não estejam nessas listas.
Informe o preço de todo produto que mencionar, copiando o valor exatamente como está na lista.`);
  }

  return partes.join("\n\n");
}

// Gera a resposta em linguagem natural para o resultado de uma busca.
// `produtosEncontrados` e `alternativas` já vêm do catálogo, filtrados pelo código — a IA
// escreve o texto, mas nunca decide quais produtos existem. `historico` são as mensagens
// da conversa terminando na mensagem atual do cliente (a API exige que a última seja dele).
// `motivoAlternativas` diz por que as alternativas estão sendo oferecidas: "semelhante"
// (não achamos o que ele pediu) ou "preco_baixo" (achamos, mas custa mais que o teto dele).
// Devolve null se a chamada falhar, pra quem chamou cair no texto de fallback.
export async function gerarRespostaBusca(
  produtosEncontrados,
  alternativas = [],
  historico = [],
  motivoAlternativas = "semelhante"
) {
  garantirApiKey();

  const produtos = produtosEncontrados ?? [];
  const parecidas = alternativas ?? [];
  const messages =
    historico.length > 0 ? historico : [{ role: "user", content: "Oi, o que vocês têm?" }];

  try {
    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: MODEL,
        max_tokens: 500,
        system: montarSystemPromptResposta(produtos, parecidas, motivoAlternativas),
        messages
      },
      { headers: cabecalhos() }
    );

    return response.data.content[0].text.trim();

  } catch (erro) {
    registrarErro("gerarRespostaBusca", erro);
    return null;
  }
}