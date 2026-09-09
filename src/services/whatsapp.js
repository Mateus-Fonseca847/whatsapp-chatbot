import axios from "axios";

// A versão vem do painel da Meta (os exemplos de curl de lá usam v25.0). O fallback
// existe pra que um .env antigo não quebre o envio.
const VERSAO_PADRAO = "v21.0";

// Conta ainda sem permissão pra mandar mensagem pra esse país. Enquanto a Verificação
// da Empresa (Etapa 3) não for aprovada, é a resposta esperada pra números brasileiros.
const ERRO_RESTRICAO_PAIS = 130497;

// As variáveis de ambiente são lidas dentro das funções, não no topo do módulo: os
// imports são avaliados antes do dotenv.config() de quem importa, e no topo elas ainda
// estariam vazias.
function urlMensagens() {
  const versao = process.env.WHATSAPP_API_VERSION || VERSAO_PADRAO;
  return `https://graph.facebook.com/${versao}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

function faltaConfiguracao() {
  const faltando = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"].filter(
    (nome) => !process.env[nome]
  );
  return faltando.length > 0 ? faltando : null;
}

// Mesmo padrão do claude.js: loga o que a API respondeu (erro.response.data), não o
// objeto inteiro do axios, que despeja request, headers e config no console.
function registrarErro(erro, paraNumero) {
  if (!erro.response) {
    console.error("Erro de rede ao enviar mensagem pelo WhatsApp:", erro.message);
    return;
  }

  const detalhe = erro.response.data?.error ?? erro.response.data;

  if (detalhe?.code === ERRO_RESTRICAO_PAIS) {
    console.error(
      `WhatsApp recusou o envio para ${paraNumero}: erro ${ERRO_RESTRICAO_PAIS} (restrição de país).\n` +
        "Isso é esperado enquanto a Verificação da Empresa (Etapa 3) estiver pendente — não é falha do código.\n" +
        `Mensagem da Meta: ${detalhe.message}`
    );
    return;
  }

  console.error(
    "Erro da API do WhatsApp:",
    erro.response.status,
    detalhe?.message ?? detalhe,
    detalhe?.code !== undefined ? `(código ${detalhe.code})` : ""
  );
}

// Envia uma mensagem de texto pelo WhatsApp Cloud API.
// Devolve os dados da resposta em caso de sucesso e null em caso de falha — nunca lança,
// pra que uma falha de envio não derrube o handler do webhook.
export async function enviarMensagem(paraNumero, texto) {
  const faltando = faltaConfiguracao();
  if (faltando) {
    console.error(
      `Não dá pra enviar pelo WhatsApp: ${faltando.join(" e ")} sem valor no .env.`
    );
    return null;
  }

  try {
    const response = await axios.post(
      urlMensagens(),
      {
        messaging_product: "whatsapp",
        to: paraNumero,
        type: "text",
        text: { body: texto }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data;

  } catch (erro) {
    registrarErro(erro, paraNumero);
    return null;
  }
}
