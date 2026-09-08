import { catalog } from "../data/catalog.js";
import { encontrarFamiliaDeCor } from "./colorFamilies.js";

// Campos de texto livre ("tecido", "cor") são os que a IA mais inventa: ela já
// devolveu tecido: "pijama", que não é tecido nenhum. Com os filtros persistindo na
// sessão, um valor desses passa a zerar todas as buscas seguintes da conversa — então
// descartamos o que não corresponde a nada do catálogo ANTES de mesclar.
// Campos de domínio fechado (categoria, estacao, intencao) já são restringidos pelo
// prompt, e tamanho/preco_maximo variam legitimamente sem existir no catálogo.

function tecidoExisteNoCatalogo(tecido, catalogo) {
  const alvo = String(tecido).toLowerCase().trim();
  if (!alvo) return false;

  // Correspondência parcial nos dois sentidos: "algodão" bate com "algodão egípcio",
  // e "malha fria" bate com "malha".
  return catalogo.some((produto) => {
    const tecidoProduto = produto.tecido.toLowerCase();
    return tecidoProduto.includes(alvo) || alvo.includes(tecidoProduto);
  });
}

function corExisteNoCatalogo(cor, catalogo) {
  const alvo = String(cor).toLowerCase().trim();
  if (!alvo) return false;

  // Mesma regra da busca: a cor vale se algum produto tiver uma cor da mesma família.
  const familiaCores = encontrarFamiliaDeCor(alvo);
  return catalogo.some((produto) => {
    const corProduto = produto.cor.toLowerCase();
    return familiaCores.some((corDaFamilia) => corProduto.includes(corDaFamilia));
  });
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

export function buscarProdutos(filtros) {
  return catalog.filter((produto) => {
    if (filtros.categoria && produto.categoria !== filtros.categoria) {
      return false;
    }

    if (filtros.tamanho && !produto.tamanhos.includes(String(filtros.tamanho))) {
      return false;
    }

    if (filtros.cor) {
      const familiaCores = encontrarFamiliaDeCor(filtros.cor);
      const corDoProduto = produto.cor.toLowerCase();
      const corBate = familiaCores.some((cor) => corDoProduto.includes(cor));
      if (!corBate) return false;
    }

    if (filtros.tecido && !produto.tecido.toLowerCase().includes(filtros.tecido.toLowerCase())) {
      return false;
    }

    if (filtros.estacao && produto.estacao !== filtros.estacao) {
      return false;
    }

    if (filtros.preco_maximo && produto.preco > filtros.preco_maximo) {
      return false;
    }

    return true;
  });
}