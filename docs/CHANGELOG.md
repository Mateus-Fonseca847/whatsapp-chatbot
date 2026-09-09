# Changelog

Registro das mudanças relevantes do `whatsapp-loja-bot`.

## [Não lançado]

### Adicionado

- **Sugestão de peças parecidas** (`src/bot/similarProducts.js`, novo).
  Busca sem resultado terminava a conversa: o cliente pedia, não tinha, fim. Agora o bot
  oferece o que o catálogo tem de mais próximo — sempre com dados reais.

  - `sugerirSemelhantes(filtros, catalogo, jaEncontrados)` pontua cada produto por
    critério que bate: `categoria` e `estacao` valem 3 (mudam a peça de prateleira),
    `cor` da mesma família e `tecido` valem 2 (são preferência), preço até 20% acima do
    `preco_maximo` vale 1 (desempate). Devolve os 3 melhores acima do piso.
  - `tamanho` não pontua de propósito: peça parecida em outro tamanho ainda vale ser
    mostrada, e quem decide se serve é o cliente.
  - Piso de 3 pontos: um critério forte, ou cor + tecido juntos. Sem piso, "não achei"
    viraria "toma qualquer coisa" e o cliente para de confiar no que o bot diz. Nada
    atingindo o piso devolve array vazio — um "não temos nada parecido" honesto.
  - Quanto pior o resultado da busca, mais espaço pra sugestão: nada encontrado sugere
    até 3; 1 ou 2 encontrados sugerem no máximo 1, e só com pontuação alta (dois
    critérios fortes), pra não poluir a resposta de quem já tem opção; 3 ou mais não
    sugerem nada.
  - `corBate` e `tecidoBate` foram exportados de `catalogSearch.js` e reaproveitados
    aqui: o que conta como "bate" precisa ser a mesma coisa na busca e na sugestão.

- `src/test-similares.js`: tamanho em minúscula, busca sem resultado que rende
  alternativa (confere que o texto usa a cor e o preço reais da peça sugerida) e busca
  fora do catálogo (confere que não sugere nem inventa nada).

### Corrigido

- **Tamanho em minúscula não encontrava nada.** `buscarProdutos` comparava
  `produto.tamanhos.includes(String(filtros.tamanho))` sem normalizar: cliente digitando
  "gg" não achava o Pijama Curto Listrado, cadastrado como `"GG"`. Agora usa
  `normalizarTexto` nos dois lados, como o resto das comparações.

- **Especulação sobre o estoque na busca vazia.** O modelo escrevia coisas como "temos
  opções, mas saem um pouco acima disso" ou "às vezes a gente tem com outro nome" sem
  ter recebido nada do catálogo naquela chamada. `gerarRespostaBusca` agora aceita
  `(produtosEncontrados, alternativas, historico)` e o system prompt cobre os três
  cenários explicitamente — encontrados, encontrados/vazio com alternativas, e vazio sem
  nada. No último, a instrução lista as frases proibidas: nada que sugira ou descarte a
  existência de outras peças, porque nessa chamada o modelo não tem essa informação.

- **Persona e resposta em linguagem natural** (`src/bot/persona.js`, novo).
  As respostas de busca eram templates fixos — sempre o mesmo texto engessado, com
  cara de listagem de resultado, não de atendimento.

  - `persona.js` concentra `NOME_BOT` ("Ana"), `NOME_LOJA` ("Loja de Pijamas"),
    `TOM_DE_VOZ` e `SAUDACAO`. **Os nomes são provisórios** — a dona da loja escolhe os
    de verdade depois, e trocar as constantes já muda saudação e prompts.
  - `gerarRespostaBusca(produtosEncontrados, historico)` em `services/claude.js`: uma
    segunda chamada à API, separada da extração, que escreve o texto usando a persona.
    Recebe a lista de produtos **já filtrada pelo código** — a IA escreve, mas nunca
    decide o que existe. O system prompt manda mencionar só os produtos da lista, com
    os preços, cores e tamanhos exatos, e nunca inventar ou sugerir outros. Mesmo
    princípio anti-alucinação da extração, agora na geração.
  - Busca vazia: a mesma função gera uma resposta empática, com instrução explícita de
    não citar nem sugerir produto nenhum (sugerir alternativas fica pra depois).
  - Saudação na primeira mensagem de cada sessão é **determinística**, prefixada pelo
    código quando `obterHistorico(from)` está vazio. Pedir ao modelo que se apresente
    daria "quase sempre"; assim é sempre — e nunca no meio da conversa.
  - `resumirBusca` continua gravando no histórico o resumo curto e sem formatação. O
    cliente lê linguagem natural, o modelo lê o resumo enxuto: propósitos diferentes,
    textos diferentes.
  - Se a geração falhar, a resposta cai no template determinístico de antes
    (`montarRespostaBusca`): feio, mas sempre correto. Só o `buscar_produto` gera texto
    por IA; os outros branches seguem com texto fixo.
  - `formatarPreco` saiu de `conversation.js` pra `src/utils/formatarPreco.js`, porque
    agora também formata os preços que vão no prompt — o modelo recebe "R$ 59,90"
    pronto, em vez de ter que formatar número.

- `src/test-persona.js`: primeira mensagem com 1 resultado (confere saudação, nome e
  preço exatos do catálogo, e ausência dos outros produtos) e segunda mensagem sem
  resultado (confere que a saudação não se repete e que nenhum produto é sugerido).

- **Filtros acumulados por conversa** (`src/bot/filtrosState.js` + `sessionStore`).
  Passar o histórico pra Claude a cada chamada já ajudava, mas depender só disso é
  frágil: quanto mais a conversa cresce, mais tokens custa e mais chance do modelo
  perder ou reinterpretar uma informação antiga. Agora quem acumula somos nós.

  - `sessionStore` ganhou um segundo estado por cliente, separado do histórico de
    mensagens: `obterFiltros(from)` e `salvarFiltros(from, filtros)` guardam o último
    conjunto de filtros conhecidos da conversa. `limparHistorico(from)` zera os dois,
    já que descrevem a mesma conversa.
  - `mesclarFiltros(anteriores, novos)`: cada campo não nulo em `novos` sobrescreve o
    anterior; campo nulo significa "a mensagem atual não fala disso" e preserva o que
    já se sabia. `intencao` é a exceção — nunca é herdada, porque descreve o que o
    cliente quer agora, não o que queria duas mensagens atrás.

  Com isso, "prefiro tamanho 8" não apaga mais o "inverno" dito antes, e "na verdade,
  quero tamanho 6" corrige só o tamanho.

- `src/test-contexto.js`: simula três mensagens do mesmo número (informação inicial,
  informação adicional, correção) e confere os filtros mesclados a cada passo.

- **Memória de conversa por cliente** (`src/bot/sessionStore.js`).
  Até agora cada mensagem era interpretada de forma isolada: o bot não sabia nada
  do que o cliente tinha acabado de dizer, então perguntas de acompanhamento
  ("prefiro tamanho 8") chegavam à Claude API sem contexto nenhum e eram
  interpretadas no vácuo.

  O `sessionStore` guarda, em um `Map` em memória e indexado pelo número do
  cliente (`from`), o histórico de mensagens no formato
  `{ role: "user" | "assistant", content: string }`, expondo `obterHistorico(from)`
  e `adicionarMensagem(from, role, content)`.

  - Sem banco de dados por enquanto — o projeto está em fase de demo, e perder as
    conversas ao reiniciar o servidor não é um problema nesse estágio. Quando for
    pra produção, trocar por Redis ou Postgres.
  - Limite de **10 mensagens por cliente** (5 trocas). Sem esse limite, conversas
    longas fariam cada chamada à Claude API carregar todo o histórico, encarecendo
    o atendimento sem ganho de qualidade.

- `src/test-session.js`: script de teste isolado que simula duas mensagens seguidas
  do mesmo número e mostra tanto o histórico acumulado quanto as `messages`
  efetivamente enviadas na segunda chamada à API.

### Alterado

- `interpretarPedido` aceita um terceiro parâmetro `filtrosConhecidos`, injetado no
  system prompt como "Filtros já confirmados nesta conversa: {json}. Extraia da
  mensagem atual apenas informações novas ou que contradigam o que já foi dito; use
  null pro que não mudou." A IA deixa de ser responsável por lembrar tudo — ela só
  aponta o que mudou. (`intencao` e campos nulos ficam de fora desse JSON: o primeiro
  induziria o modelo a repetir a intenção anterior, os outros são ruído.)
- `processarMensagem` mescla a resposta da Claude com os filtros da sessão, salva o
  merge de volta e usa **o merge** — não a resposta crua da API — pra chamar
  `buscarProdutos`. Se a chamada à API falhar, os filtros da sessão ficam intactos,
  pra não perder o que o cliente já confirmou por causa de um erro passageiro.
- O turno `assistant` gravado no histórico deixou de ser o texto formatado do WhatsApp
  (com `*negrito*`, quebras de linha e preços) e passou a ser um resumo sem formatação
  — ex: `"Resultado: 1 produto encontrado — Pijama Infantil Unicórnio"`. Resolve a
  incoerência de alimentar um prompt que exige JSON com texto de vitrine, e corta
  tokens de cada chamada seguinte.
- `interpretarPedido(textoCliente)` agora aceita um segundo parâmetro
  `historico` (array, opcional), incluído nas `messages` da requisição **antes**
  da mensagem atual do cliente.
- `processarMensagem(textoCliente)` passou a ser `processarMensagem(from, textoCliente)`:
  busca o histórico da sessão, repassa pra `interpretarPedido` e, depois de montar
  a resposta, grava no `sessionStore` tanto a mensagem do cliente quanto a resposta
  do bot.
- `src/server.js` passa o `from` extraído do payload do webhook junto com o texto
  na chamada a `processarMensagem` — antes o número era apenas logado. O envio da
  resposta de volta pelo WhatsApp continua pendente (`src/services/whatsapp.js`).

### Corrigido

- **Busca insensível a acento** (`src/utils/normalizarTexto.js`, novo). O catálogo grava
  `estacao: "verão"`, mas o `SYSTEM_PROMPT` instrui o modelo a devolver `"verao"`, e
  `buscarProdutos` comparava com `!==` exato — resultado: nenhuma busca por roupa de
  verão encontrava o Pijama Curto Listrado. A mesma fragilidade valia pra `cor` e
  `tecido`, cujos `.includes()` só baixavam a caixa.

  `normalizarTexto(texto)` remove acentos (`NFD` + faixa de diacríticos) e baixa a
  caixa. Passou a ser aplicado **nos dois lados** de toda comparação de texto:

  - `catalogSearch.js`: igualdade de `estacao` e `categoria`, e as comparações parciais
    de `cor` e `tecido` — tanto na busca quanto na validação contra o catálogo.
  - `colorFamilies.js`: `encontrarFamiliaDeCor` normaliza a cor buscada e as listas de
    `FAMILIAS_DE_COR` (normalizadas uma vez na carga do módulo, não a cada busca).
    As listas continuam escritas com acento, que é o que se lê melhor ao editar.

  Só pra comparação: o texto exibido ao cliente continua vindo do catálogo, com acento.

  Dois ajustes que vieram junto, por consistência:

  - `buscarProdutos(filtros, catalogo = catalog)` aceita um catálogo por parâmetro, como
    `validarContraCatalogo` já fazia, pra poder ser testado sem depender do catálogo real.
  - A comparação de `tecido` na busca passou a ser bidirecional, que era como a validação
    já comparava. Antes um tecido podia ser aceito na validação e não bater na busca.

- `src/test-persona.js` passou a usar "plus size" na segunda mensagem. A pergunta antiga
  ("tem alguma coisa até 20 reais?") agora rende uma alternativa legítima — o teste
  cobria "vazio sem alternativas" e continua cobrindo, com uma busca que de fato não tem
  nada parecido. O caso com alternativa é o `test-similares.js`.

- `src/test-session.js` passou a separar as chamadas de interpretação das de geração
  antes de conferir o payload: agora cada mensagem gera duas chamadas à API, e o teste
  olhava pelo índice.

- `src/test-normalizacao.js`: cobre o caso do enunciado
  (`buscarProdutos({ estacao: "verao" }, catalog)` acha o Pijama Curto Listrado) e os
  equivalentes de `cor`, `tecido` e `categoria`. Não chama a API.

- **Filtro inventado pela IA não entra mais na sessão** (`validarContraCatalogo`, em
  `src/bot/catalogSearch.js`). Resolve o "Problema conhecido" registrado junto com os
  filtros acumulados: em "quero um pijama de inverno" o modelo devolvia
  `tecido: "pijama"` — pijama não é tecido, nenhum produto casava com isso, e como o
  valor persistia na sessão ele zerava todas as buscas seguintes da mesma conversa.

  Agora `conversation.js` valida a resposta da Claude contra o catálogo **antes** de
  `mesclarFiltros`, então um valor sem correspondência nunca chega a ser guardado:

  - `tecido`: aceito só se algum produto tiver um tecido que bata por correspondência
    parcial nos dois sentidos (`"algodão"` bate com `"algodão egípcio"` e vice-versa).
  - `cor`: aceita só se algum produto tiver cor da mesma família, reaproveitando
    `encontrarFamiliaDeCor` — a mesma regra que a busca já usa.
  - Sem correspondência, o campo vira `null` e simplesmente não sobrescreve nada.

  A validação cobre só os campos de texto livre. `categoria` e `estacao` já têm domínio
  fechado no prompt, e `tamanho`/`preco_maximo` variam legitimamente sem existir no
  catálogo (pedir tamanho GG que a loja não tem é uma busca vazia válida, não um erro
  de extração).

  Efeito colateral visível: "oi, voces vendem pijama?" passou a listar os 3 produtos
  do catálogo, em vez de não encontrar nada.

- `src/test-validacao.js`: teste de `validarContraCatalogo` com o objeto do bug real
  (`{ tecido: "pijama", estacao: "inverno", cor: "arco-íris" }`). Não chama a API, pra
  não depender da variabilidade da IA.
