import axios from "axios";

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

function limparRespostaJSON(texto) {
  // Às vezes o modelo envolve o JSON em ```json ... ``` mesmo quando pedimos pra não fazer isso.
  // Essa função remove essa "casca" antes de tentar interpretar.
  return texto.replace(/```json\n?|```\n?/g, "").trim();
}

export async function interpretarPedido(textoCliente) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY não encontrada. Verifique se o arquivo .env existe na raiz do projeto e se a chave está preenchida."
    );
  }

  try {
    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: textoCliente }]
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );

    const textoResposta = response.data.content[0].text;
    return JSON.parse(limparRespostaJSON(textoResposta));

  } catch (erro) {
    // Erro de resposta da própria API (ex: 401, 400, 429)
    if (erro.response) {
      console.error("Erro da API Claude:", erro.response.status, erro.response.data);
    } else {
      console.error("Erro ao chamar a API Claude:", erro.message);
    }
    return null;
  }
}