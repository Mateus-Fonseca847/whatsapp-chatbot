# Changelog

Registro das mudanças relevantes do `whatsapp-loja-bot`.

## [Não lançado]

### Adicionado

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
