import { normalizarTexto } from "../utils/normalizarTexto.js";

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

// As listas acima são escritas com acento, pra ficarem legíveis pra quem edita.
// A comparação, porém, é sempre sem acento — "lilás" e "lilas" precisam bater.
// Normalizamos uma vez na carga do módulo, não a cada busca.
const FAMILIAS_NORMALIZADAS = FAMILIAS_DE_COR.map((familia) =>
  familia.map((cor) => normalizarTexto(cor))
);

// Devolve as cores da família já normalizadas: o retorno serve só pra comparação,
// nunca pra exibir ao cliente — o texto mostrado vem do catálogo.
export function encontrarFamiliaDeCor(corBuscada) {
  const corNormalizada = normalizarTexto(corBuscada);

  // Cor vazia casaria com qualquer família (todo texto "inclui" string vazia)
  if (!corNormalizada) return [];

  const familiaEncontrada = FAMILIAS_NORMALIZADAS.find((familia) =>
    familia.some((cor) => corNormalizada.includes(cor) || cor.includes(corNormalizada))
  );

  // Cor que não está em nenhuma família cadastrada: mantém o comportamento
  // antigo (só bate com ela mesma), em vez de quebrar a busca.
  return familiaEncontrada || [corNormalizada];
}