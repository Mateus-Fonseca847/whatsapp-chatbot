// Teste de envio pelo WhatsApp Cloud API.
//
// Enquanto a Verificação da Empresa (Etapa 3) estiver pendente, o esperado é a Meta
// recusar com o erro 130497 (restrição de país). O que este teste verifica é que a
// falha é tratada: log legível, sem objeto gigante do axios, sem exceção não tratada.
// Quando a verificação for aprovada, o mesmo script passa a entregar a mensagem sem
// nenhuma mudança no código.

import dotenv from "dotenv";
dotenv.config();

import { enviarMensagem } from "./services/whatsapp.js";

const NUMERO = process.env.WHATSAPP_TEST_NUMBER;

if (!NUMERO) {
  console.error(
    "Defina WHATSAPP_TEST_NUMBER no .env com o seu número de teste (DDI + DDD + número, só dígitos).\n" +
      "Exemplo: WHATSAPP_TEST_NUMBER=5531999999999"
  );
  process.exit(1);
}

console.log(`Enviando mensagem de teste para ${NUMERO}...\n`);

const resultado = await enviarMensagem(NUMERO, "Oi! Mensagem de teste do bot da loja.");

console.log("\n--- Resultado ---");
if (resultado) {
  console.log("Envio aceito pela Meta:", JSON.stringify(resultado));
  console.log("A mensagem deve chegar no WhatsApp desse número.");
} else {
  console.log("Envio não foi aceito. O motivo está logado acima, em texto legível.");
  console.log("Se o motivo for o erro 130497, é a Verificação da Empresa ainda pendente.");
}

console.log("\nO processo terminou sem exceção não tratada.");
