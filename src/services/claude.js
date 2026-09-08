import axios from "axios";
import { NOME_BOT, NOME_LOJA, TOM_DE_VOZ } from "../bot/persona.js";
import { formatarPreco } from "../utils/formatarPreco.js";

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
  "intencao": "buscar_produto" | "ver_carrinho" | "finalizar_pedido" | "duvida_geral"
}

Regras importantes:
- Para categoria "infantil", se o cliente mencionar a idade da criança (ex: "8 anos", "uns 6 anininhos"), use esse número como "tamanho", já que roupas infantis geralmente são numeradas por idade.
- Para categoria "feminino", "masculino" ou "plus size", use os tamanhos padrão (PP, P, M, G, GG) quando mencionados.
- Use null nos campos que não estiverem claros na mensagem. Nunca invente informação que o cliente não disse além do que essas regras permitem.`;

function montarSystemPrompt(filtrosConhecidos) {
  // Só interessa ao modelo o que de fato está preenchido. `intencao` fica de fora:
  // ela vale só pra mensagem em que foi dita e induziria o modelo a repeti-la.
  const confirmados = Object.fromEntries(
    Object.entries(filtrosConhecidos ?? {}).filter(
      ([campo, valor]) => campo !== "intencao" && valor !== null && valor !== undefined
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

function montarSystemPromptResposta(produtos) {
  const base = `Você é a ${NOME_BOT}, atendente da ${NOME_LOJA} no WhatsApp.

${TOM_DE_VOZ}

Escreva a resposta para a última mensagem do cliente. Responda apenas com o texto da mensagem, sem aspas e sem comentários seus.
Não se apresente nem diga o seu nome: quando a apresentação é necessária, ela já é feita antes da sua resposta.`;

  // Quem decide o que existe é o código, não o modelo: a lista abaixo é o resultado da
  // busca no catálogo. Sem essa amarra, a IA "ajuda" inventando produto e preço.
  if (produtos.length === 0) {
    return `${base}

A busca no catálogo não encontrou nenhum produto com os critérios que o cliente pediu.
Reconheça isso com empatia e convide o cliente a descrever o que procura de outro jeito.
Você não tem nenhum produto pra oferecer nesta resposta: nunca invente, cite ou sugira um produto específico, nem prometa avisar depois.`;
  }

  return `${base}

Produtos encontrados na busca (esta é a lista completa do que existe pra oferecer agora):
${listarProdutosParaPrompt(produtos)}

Mencione apenas os produtos listados acima, com exatamente os preços, cores e tamanhos fornecidos. Nunca invente ou sugira produtos que não estejam nesta lista.
Informe o preço de todo produto que mencionar, copiando o valor exatamente como está na lista.`;
}

// Gera a resposta em linguagem natural para o resultado de uma busca.
// `produtosEncontrados` já vem filtrado pelo código — a IA escreve o texto, mas nunca
// decide quais produtos existem. `historico` são as mensagens da conversa terminando na
// mensagem atual do cliente (a API exige que a última seja do cliente).
// Devolve null se a chamada falhar, pra quem chamou cair no texto de fallback.
export async function gerarRespostaBusca(produtosEncontrados, historico = []) {
  garantirApiKey();

  const produtos = produtosEncontrados ?? [];
  const messages =
    historico.length > 0 ? historico : [{ role: "user", content: "Oi, o que vocês têm?" }];

  try {
    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: MODEL,
        max_tokens: 500,
        system: montarSystemPromptResposta(produtos),
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