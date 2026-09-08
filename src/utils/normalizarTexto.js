// Normalização para comparação de texto: tira acento e baixa a caixa.
//
// O cadastro dos produtos e o que a IA extrai da mensagem do cliente nem sempre
// concordam na acentuação ("verão" no catálogo, "verao" no prompt), e o cliente
// digitando no WhatsApp concorda menos ainda. Use só pra COMPARAR — o texto exibido
// ao cliente deve continuar vindo do catálogo, com acento.

// Faixa Unicode dos acentos que o NFD separa da letra (combining diacritical marks)
const ACENTOS = /[\u0300-\u036f]/g;

export function normalizarTexto(texto) {
  if (texto === null || texto === undefined) return "";

  return String(texto)
    .normalize("NFD") // separa a letra do acento: "á" vira "a" + acento solto
    .replace(ACENTOS, "") // descarta os acentos soltos
    .toLowerCase()
    .trim();
}
