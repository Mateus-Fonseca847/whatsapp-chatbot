import { catalog } from "../data/catalog.js";
import { encontrarFamiliaDeCor } from "./colorFamilies.js";
import { normalizarTexto } from "../utils/normalizarTexto.js";

// Campos de texto livre ("tecido", "cor") são os que a IA mais inventa: ela já
// devolveu tecido: "pijama", que não é tecido nenhum. Com os filtros persistindo na
// sessão, um valor desses passa a zerar todas as buscas seguintes da conversa — então
// descartamos o que não corresponde a nada do catálogo ANTES de mesclar.
// Campos de domínio fechado (categoria, estacao, intencao) já são restringidos pelo
// prompt, e tamanho/preco_maximo variam legitimamente sem existir no catálogo.

// Exportados pra que a sugestão de peças parecidas (similarProducts.js) use exatamente
// os mesmos critérios da busca — o que "bate" tem que ser a mesma coisa nos dois lugares.
export function tecidoBate(tecidoProduto, tecidoBuscado) {
  const alvo = normalizarTexto(tecidoBuscado);
  if (!alvo) return false;

  // Correspondência parcial nos dois sentidos: "algodão" bate com "algodão egípcio",
  // e "malha fria" bate com "malha".
  const doProduto = normalizarTexto(tecidoProduto);
  return doProduto.includes(alvo) || alvo.includes(doProduto);
}

export function corBate(corProduto, familiaCores) {
  const doProduto = normalizarTexto(corProduto);
  return familiaCores.some((corDaFamilia) => doProduto.includes(corDaFamilia));
}

function tecidoExisteNoCatalogo(tecido, catalogo) {
  return catalogo.some((produto) => tecidoBate(produto.tecido, tecido));
}

function corExisteNoCatalogo(cor, catalogo) {
  // Mesma regra da busca: a cor vale se algum produto tiver uma cor da mesma família.
  const familiaCores = encontrarFamiliaDeCor(cor);
  return catalogo.some((produto) => corBate(produto.cor, familiaCores));
}

// As categorias que o catálogo realmente tem, na ordem em que aparecem. Lida do
// catálogo em vez de fixada no código: quando os produtos reais da loja entrarem, a
// lista se ajusta sozinha, sem ninguém precisar lembrar de atualizar uma constante.
export function listarCategorias(catalogo = catalog) {
  return [...new Set((catalogo ?? []).map((produto) => produto.categoria).filter(Boolean))];
}

export function validarContraCatalogo(filtros, catalogo = catalog) {
  if (!filtros) return filtros;

  const validados = { ...filtros };

  if (validados.tecido && !tecidoExisteNoCatalogo(validados.tecido, catalogo)) {
    validados.tecido = null;
  }

  if (validados.cor && !corExisteNoCatalogo(validados.cor, catalogo)) {
    validados.cor = null;
  }

  return validados;
}

export function buscarProdutos(filtros, catalogo = catalog) {
  // A cor buscada é a mesma pra todos os produtos: resolve a família uma vez só.
  const familiaCores = filtros.cor ? encontrarFamiliaDeCor(filtros.cor) : null;

  return catalogo.filter((produto) => {
    // Toda comparação de texto passa por normalizarTexto nos DOIS lados: o catálogo
    // grava "verão" e o prompt manda a IA devolver "verao" — sem isso, nenhuma busca
    // por roupa de verão encontrava o Pijama Curto Listrado.
    if (
      filtros.categoria &&
      normalizarTexto(produto.categoria) !== normalizarTexto(filtros.categoria)
    ) {
      return false;
    }

    // Normalizado dos dois lados como o resto: o cliente digita "gg" e o catálogo grava "GG"
    if (filtros.tamanho) {
      const tamanhoBuscado = normalizarTexto(filtros.tamanho);
      const temTamanho = produto.tamanhos.some((t) => normalizarTexto(t) === tamanhoBuscado);
      if (!temTamanho) return false;
    }

    if (familiaCores && !corBate(produto.cor, familiaCores)) {
      return false;
    }

    if (filtros.tecido && !tecidoBate(produto.tecido, filtros.tecido)) {
      return false;
    }

    if (filtros.estacao && normalizarTexto(produto.estacao) !== normalizarTexto(filtros.estacao)) {
      return false;
    }

    if (filtros.preco_maximo && produto.preco > filtros.preco_maximo) {
      return false;
    }

    return true;
  });
}