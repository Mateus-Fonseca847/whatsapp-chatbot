# Changelog

Registro das mudanças relevantes do `whatsapp-loja-bot`.

## [Não lançado]

### Adicionado

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
