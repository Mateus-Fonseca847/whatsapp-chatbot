// Sugestão de peças parecidas quando a busca exata não resolve.
//
// Tudo aqui sai do catálogo real: a IA recebe a lista pronta e só escreve o texto.
// A pontuação é o que impede o "já que não achei, mando qualquer coisa" — sem um piso,
// sugerir vira ruído e o cliente perde a confiança no que o bot diz.

import { catalog } from "../data/catalog.js";
import { corBate, tecidoBate } from "./catalogSearch.js";
import { encontrarFamiliaDeCor } from "./colorFamilies.js";
import { normalizarTexto } from "../utils/normalizarTexto.js";

// Categoria e estação mudam o produto de lugar na prateleira: quem pede pijama infantil
// de inverno não quer camisola feminina de verão. Cor e tecido são preferência, pesam
// menos. Preço é desempate.
const PESO_ALTO = 3;
const PESO_MEDIO = 2;
const PESO_BAIXO = 1;

// Piso pra entrar na lista: um critério forte (categoria OU estação), ou os dois médios
// juntos (cor + tecido) — que também é semelhança real, e cobre o caso do cliente que
// não disse categoria nem estação nenhuma.
export const PONTUACAO_MINIMA = PESO_ALTO;

// Piso mais alto, usado quando o cliente já tem opção na mão: só vale interromper com
// uma sugestão se ela for muito parecida (dois critérios fortes).
export const PONTUACAO_ALTA = PESO_ALTO * 2;

const MARGEM_PRECO = 1.2; // "quase dentro do orçamento": até 20% acima do teto pedido
const LIMITE_PADRAO = 3;

function pontuar(produto, filtros, familiaCores) {
  let pontos = 0;

  if (
    filtros.categoria &&
    normalizarTexto(produto.categoria) === normalizarTexto(filtros.categoria)
  ) {
    pontos += PESO_ALTO;
  }

  if (filtros.estacao && normalizarTexto(produto.estacao) === normalizarTexto(filtros.estacao)) {
    pontos += PESO_ALTO;
  }

  if (familiaCores && corBate(produto.cor, familiaCores)) {
    pontos += PESO_MEDIO;
  }

  if (filtros.tecido && tecidoBate(produto.tecido, filtros.tecido)) {
    pontos += PESO_MEDIO;
  }

  if (filtros.preco_maximo && produto.preco <= filtros.preco_maximo * MARGEM_PRECO) {
    pontos += PESO_BAIXO;
  }

  // `tamanho` fica de fora de propósito: peça parecida em outro tamanho ainda vale ser
  // mostrada — quem decide se serve é o cliente.
  return pontos;
}

export function sugerirSemelhantes(filtros, catalogo = catalog, jaEncontrados = [], opcoes = {}) {
  if (!filtros) return [];

  const { limite = LIMITE_PADRAO, pontuacaoMinima = PONTUACAO_MINIMA } = opcoes;

  const idsEncontrados = new Set(jaEncontrados.map((produto) => produto.id));
  const familiaCores = filtros.cor ? encontrarFamiliaDeCor(filtros.cor) : null;

  return catalogo
    .filter((produto) => !idsEncontrados.has(produto.id))
    .map((produto) => ({ produto, pontos: pontuar(produto, filtros, familiaCores) }))
    .filter(({ pontos }) => pontos >= pontuacaoMinima)
    .sort((a, b) => b.pontos - a.pontos) // empate mantém a ordem do catálogo
    .slice(0, limite)
    .map(({ produto }) => produto);
}
