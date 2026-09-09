// Prova o que o canal vai mandar pro WhatsApp: uma mensagem de abertura e, depois, uma
// mensagem por peça — com foto quando o produto tem imagem cadastrada, com a mesma ficha
// em texto quando não tem. Reproduz aqui a lógica de envio do baileysWhatsapp.js, sem
// conectar ao WhatsApp.

import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs";
import path from "node:path";

import { processarMensagem, montarLegendaProduto } from "./bot/conversation.js";
import { limparHistorico } from "./bot/sessionStore.js";

const FROM = "5511911111111";
limparHistorico(FROM);

const PERGUNTA = "queria um pijama de frio rosa choque para minha sobrinha de 6 anos";

const resultados = [];
const verificar = (descricao, condicao) => {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
};

console.log(`cliente: ${PERGUNTA}\n`);
const resposta = await processarMensagem(FROM, PERGUNTA);

// Mesmo caminho de enviarResposta/enviarProduto no canal
const mensagens = [];
if (typeof resposta === "string") {
  mensagens.push({ tipo: "texto", conteudo: resposta });
} else {
  mensagens.push({ tipo: "texto", conteudo: resposta.texto });

  for (const produto of resposta.produtos) {
    const caminho = produto.foto ? path.resolve(produto.foto) : null;
    const temFoto = Boolean(caminho && fs.existsSync(caminho));
    mensagens.push({
      tipo: temFoto ? "imagem + legenda" : "texto (produto sem foto cadastrada)",
      produto: produto.nome,
      arquivo: temFoto ? produto.foto : null,
      bytes: temFoto ? fs.statSync(caminho).size : 0,
      conteudo: montarLegendaProduto(produto)
    });
  }
}

mensagens.forEach((mensagem, i) => {
  console.log(`--- mensagem ${i + 1} (${mensagem.tipo}) ---`);
  if (mensagem.arquivo) console.log(`[foto: ${mensagem.arquivo}, ${mensagem.bytes} bytes]`);
  console.log(mensagem.conteudo);
  console.log("");
});

verificar("resposta veio no formato { texto, produtos }", typeof resposta === "object");
verificar("mais de uma mensagem: abertura + peças", mensagens.length > 1);
verificar("a primeira mensagem é só a frase de abertura", mensagens[0].tipo === "texto");
verificar("a abertura não repete preço", !mensagens[0].conteudo.includes("R$"));
verificar(
  "a abertura não repete nome de produto",
  !mensagens.slice(1).some((m) => mensagens[0].conteudo.includes(m.produto))
);
verificar(
  "as mensagens seguintes são as peças",
  mensagens.slice(1).every((m) => Boolean(m.produto))
);
verificar(
  "peça com foto cadastrada tem o arquivo em disco",
  mensagens.slice(1).every((m) => m.arquivo === null || m.bytes > 0)
);
verificar("cada ficha traz o preço", mensagens.slice(1).every((m) => m.conteudo.includes("R$")));

console.log("=== Resultado ===");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
process.exit(todosOk ? 0 : 1);
