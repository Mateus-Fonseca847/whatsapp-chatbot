import { catalog } from "../data/catalog.js";
import { encontrarFamiliaDeCor } from "./colorFamilies.js";

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