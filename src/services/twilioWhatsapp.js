import axios from "axios";

// Canal alternativo ao Meta Cloud API, pra destravar os testes enquanto a Verificação
// da Empresa na Meta não sai. A lógica de conversa é a mesma nos dois: muda só como a
// mensagem chega e como ela sai.

const API_URL = "https://api.twilio.com/2010-04-01";

// A Twilio quer o número em E.164 com o prefixo do canal: "whatsapp:+5524974012668".
// Aceita o número em qualquer formato (com ou sem "whatsapp:", com ou sem "+") pra que
// quem chama não precise se preocupar com isso.
function paraEnderecoWhatsapp(numero) {
  return `whatsapp:+${normalizarNumeroWhatsapp(numero)}`;
}

// "whatsapp:+5524974012668" -> "5524974012668".
// A Meta identifica o cliente só pelos dígitos; deixando os dois canais no mesmo
// formato, a mesma pessoa testando pelos dois cai na mesma sessão do sessionStore.
export function normalizarNumeroWhatsapp(numeroTwilio) {
  if (numeroTwilio === null || numeroTwilio === undefined) return "";
  return String(numeroTwilio).replace(/\D/g, "");
}

// Env lido dentro das funções, não no topo: os imports são avaliados antes do
// dotenv.config() de quem importa, e no topo essas variáveis ainda estariam vazias.
function faltaConfiguracao() {
  const faltando = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_NUMBER"].filter(
    (nome) => !process.env[nome]
  );
  return faltando.length > 0 ? faltando : null;
}

// Mesmo padrão do claude.js e do whatsapp.js: loga o que a API respondeu, não o objeto
// inteiro do axios, que despeja request, headers e config no console.
function registrarErro(erro, paraNumero) {
  if (!erro.response) {
    console.error("Erro de rede ao enviar mensagem pela Twilio:", erro.message);
    return;
  }

  const detalhe = erro.response.data;

  console.error(
    `Erro da API Twilio ao enviar para ${paraNumero}:`,
    erro.response.status,
    detalhe?.message ?? detalhe,
    detalhe?.code !== undefined ? `(código ${detalhe.code})` : "",
    detalhe?.more_info ? `— ${detalhe.more_info}` : ""
  );
}

// Envia uma mensagem de texto pelo WhatsApp via Twilio.
// Devolve os dados da resposta em caso de sucesso e null em caso de falha — nunca lança,
// pra que um erro de envio não derrube o handler do webhook.
export async function enviarMensagemTwilio(paraNumero, texto) {
  const faltando = faltaConfiguracao();
  if (faltando) {
    console.error(`Não dá pra enviar pela Twilio: ${faltando.join(", ")} sem valor no .env.`);
    return null;
  }

  const corpo = new URLSearchParams({
    From: paraEnderecoWhatsapp(process.env.TWILIO_WHATSAPP_NUMBER),
    To: paraEnderecoWhatsapp(paraNumero),
    Body: texto
  });

  try {
    const response = await axios.post(
      `${API_URL}/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      corpo,
      {
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      }
    );

    return response.data;

  } catch (erro) {
    registrarErro(erro, paraNumero);
    return null;
  }
}
