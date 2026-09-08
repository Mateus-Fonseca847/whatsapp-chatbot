// Agrupamentos de cores que "conversam" entre si visualmente.
// Ajuste essas listas conforme os produtos reais da loja forem cadastrados —
// isso é uma regra de negócio, não uma verdade absoluta de teoria das cores.
const FAMILIAS_DE_COR = [
  ["lilás", "roxo", "violeta", "lavanda", "azul", "azul claro", "azul marinho", "anil"],
  ["vermelho", "rosa", "pink", "coral", "vinho", "magenta"],
  ["amarelo", "laranja", "mostarda", "dourado"],
  ["verde", "verde claro", "verde escuro", "oliva", "menta"],
  ["branco", "preto", "cinza", "bege", "nude", "marrom"]
];

export function encontrarFamiliaDeCor(corBuscada) {
  const corNormalizada = corBuscada.toLowerCase().trim();

  const familiaEncontrada = FAMILIAS_DE_COR.find((familia) =>
    familia.some((cor) => corNormalizada.includes(cor) || cor.includes(corNormalizada))
  );

  // Cor que não está em nenhuma família cadastrada: mantém o comportamento
  // antigo (só bate com ela mesma), em vez de quebrar a busca.
  return familiaEncontrada || [corNormalizada];
}