// Teste da sugestão de peças parecidas.
// A pontuação é testada direto (sem IA); a resposta gerada é conferida contra os dados
// reais do catálogo, pra garantir que a IA não inventa nem especula.

import dotenv from "dotenv";
dotenv.config();

import { buscarProdutos } from "./bot/catalogSearch.js";
import { sugerirSemelhantes } from "./bot/similarProducts.js";
import { gerarRespostaBusca } from "./services/claude.js";
import { montarLegendaProduto } from "./bot/conversation.js";
import { catalog } from "./data/catalog.js";
import { formatarPreco } from "./utils/formatarPreco.js";

const resultados = [];

function verificar(descricao, condicao) {
  console.log(`  ${condicao ? "OK   " : "FALHA"} ${descricao}`);
  resultados.push(condicao);
}

const nomes = (produtos) => produtos.map((p) => p.nome).join(", ") || "(nenhum)";
const listrado = catalog.find((p) => p.nome === "Pijama Curto Listrado");

console.log("=== 1. Tamanho em minúscula ===");
const gg = buscarProdutos({ tamanho: "gg" });
console.log(`buscarProdutos({ tamanho: "gg" }): ${nomes(gg)}`);
verificar(
  'tamanho "gg" encontra o produto cadastrado como "GG"',
  gg.some((p) => p.nome === listrado.nome)
);

console.log("\n=== 2. Masculino de verão em vermelho (não existe) ===");
const filtros2 = { categoria: "masculino", estacao: "verao", cor: "vermelho" };
const exatos2 = buscarProdutos(filtros2);
const alternativas2 = sugerirSemelhantes(filtros2, catalog, exatos2);
console.log(`Busca exata: ${nomes(exatos2)}`);
console.log(`Alternativas: ${nomes(alternativas2)}`);

verificar("busca exata não encontra nada", exatos2.length === 0);
// O catálogo cresceu: agora existem outras peças de verão. O que importa é o Listrado
// vir sugerido e vir na frente — ele é o único que bate categoria E estação.
verificar(
  "sugere o Pijama Curto Listrado como parecido",
  alternativas2.some((p) => p.id === listrado.id)
);
verificar(
  "Listrado é a alternativa mais bem pontuada",
  alternativas2[0]?.id === listrado.id
);
verificar("no máximo 3 alternativas", alternativas2.length <= 3);

const resposta2 = await gerarRespostaBusca(exatos2, alternativas2, [
  { role: "user", content: "tem pijama masculino de verão vermelho?" }
]);
console.log(`\n${resposta2}\n`);

// A frase gerada agora é só a abertura: nome, cor, tamanhos e preço vão na ficha de
// cada peça, que o canal manda em mensagem própria com a foto.
verificar("frase de abertura não repete preço", !resposta2.includes("R$"));

const legenda = montarLegendaProduto(listrado);
console.log(`legenda: ${legenda}`);
verificar("ficha cita o nome real", legenda.includes(listrado.nome));
// A cor certa importa: o cliente pediu vermelho e a peça é azul e branco.
verificar(`ficha descreve a cor real (${listrado.cor})`, legenda.includes(listrado.cor));
verificar(
  `ficha usa o preço real (${formatarPreco(listrado.preco)})`,
  legenda.includes(formatarPreco(listrado.preco))
);

console.log("=== 3. Categoria que não existe no catálogo ===");
const filtros3 = { categoria: "plus size" };
const exatos3 = buscarProdutos(filtros3);
const alternativas3 = sugerirSemelhantes(filtros3, catalog, exatos3);
console.log(`Busca exata: ${nomes(exatos3)}`);
console.log(`Alternativas: ${nomes(alternativas3)}`);

verificar("busca exata não encontra nada", exatos3.length === 0);
verificar("não força nenhuma sugestão", alternativas3.length === 0);

const resposta3 = await gerarRespostaBusca(exatos3, alternativas3, [
  { role: "user", content: "vocês têm pijama plus size?" }
]);
console.log(`\n${resposta3}\n`);

for (const produto of catalog) {
  verificar(`não cita "${produto.nome}"`, !resposta3.includes(produto.nome));
}
verificar("não cita preço nenhum", !resposta3.includes("R$"));

console.log("\n=== Resultado ===");
const todosOk = resultados.every(Boolean);
console.log(todosOk ? "Todas as verificações passaram." : "Houve verificações que falharam.");
console.log("Revise os textos acima: a alternativa fica clara como 'parecida', não como o pedido?");
process.exit(todosOk ? 0 : 1);
