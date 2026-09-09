# Ana: Atendimento Inteligente via WhatsApp

Bot de atendimento automatizado para lojas de roupa, integrado ao WhatsApp, capaz de interpretar pedidos em linguagem natural, navegar por catálogo, montar carrinho e conduzir o cliente até o fechamento do pedido.

Projeto desenvolvido como estudo de caso real: automatizar o atendimento de uma loja de pijamas, unindo IA generativa (Claude API), integração com WhatsApp e boas práticas de engenharia de software.

## Objetivo

A maioria dos bots de WhatsApp disponíveis no mercado funciona como árvore de decisão fixa: menus numerados, sem interpretação real do que o cliente escreve. Este projeto resolve isso de outra forma: o modelo interpreta pedidos como "queria um pijama de inverno pra minha filha, uns 8 anos" ou "e vocês tem em azul?", mantém o contexto ao longo da conversa, sugere alternativas quando não há correspondência exata, e conduz o fechamento do pedido, incluindo endereço e forma de pagamento.

O sistema foi construído de forma incremental, com cada decisão de arquitetura documentada em `docs/CHANGELOG.md` conforme foi tomada.

## Funcionalidades

- interpretação de pedidos em linguagem natural, sem menus fixos: categoria, tamanho, cor, tecido, estação e faixa de preço extraídos de frases livres;
- memória de conversa por cliente, com correção de informações ao longo da conversa sem perda do restante do contexto;
- busca no catálogo com reconhecimento de famílias de cores semelhantes;
- sugestão de produtos semelhantes quando não há correspondência exata, por categoria, estação, cor e faixa de preço;
- navegação por catálogo completo, não só buscas filtradas;
- carrinho de compras com resolução de produto por referência indireta ("quero o unicórnio");
- checkout completo: endereço de entrega, recibo formatado, forma de pagamento e confirmação;
- recusa alinhada à marca quando o pedido foge da faixa de preço praticada, citando diferenciais reais da loja em vez de inventar promoções;
- envio de fotos reais dos produtos, uma mensagem por peça, com legenda formatada;
- tratamento de mensagens que não são texto (áudio, imagem, figurinha), com resposta apropriada em vez de silêncio.

## Arquitetura

O projeto separa três camadas, o que permite trocar ou adicionar canais de mensagem sem alterar a lógica de negócio.

```
Canal de mensagem  ->  Motor de conversa  ->  Dados
(Meta, Twilio,          (interpretação,        (catálogo,
 Baileys)                memória, carrinho,      pedidos)
                         catálogo, checkout)
```

Três canais estão implementados em paralelo: Meta Cloud API (oficial, aguardando verificação de empresa), Twilio WhatsApp Sandbox e Baileys (conexão direta via protocolo WhatsApp Web). Um mesmo cliente mantém a mesma sessão de conversa independentemente do canal usado, porque o número é normalizado para um formato comum antes de chegar ao motor de conversa.

## Decisões de design

**Separação entre interpretação e geração de linguagem.** A Claude API é chamada duas vezes por mensagem: uma para extrair filtros estruturados do pedido, outra para gerar a resposta em linguagem natural. As duas chamadas recebem apenas dados já validados pelo código (produtos reais do catálogo, preços reais). O modelo nunca decide sozinho quais produtos existem; ele descreve, com as próprias palavras, uma lista que o código já determinou.

**Validação de filtros contra o catálogo antes de aceitar.** Um campo extraído pela IA (cor, tecido) só é aceito se corresponder a algo que existe de fato no catálogo. Sem essa validação, um erro de extração persistiria na sessão inteira, já que os filtros são acumulados entre mensagens.

**Mesclagem determinística de filtros, não delegada à IA.** A cada mensagem, o modelo extrai apenas o que é novo ou mudou; o código decide o que herdar da mensagem anterior. Campos como intenção, produto mencionado e quantidade nunca são herdados, para evitar que uma ação (adicionar ao carrinho, finalizar pedido) se repita indevidamente em mensagens seguintes.

**Checkout registrado apenas quando completo.** Uma versão anterior registrava o pedido antes de perguntar a forma de pagamento, o que exigia um mecanismo separado para completar a informação depois e abria espaço para inconsistência caso o cliente insistisse em finalizar no meio do processo. A versão atual só grava o pedido quando endereço e forma de pagamento já foram informados.

## Limitações conhecidas

- o catálogo de demonstração combina produtos fictícios (sem foto) com produtos reais fornecidos posteriormente; não reflete ainda o estoque completo da loja;
- o canal oficial (Meta Cloud API) está implementado mas inativo, bloqueado por uma restrição de país que depende de verificação de empresa aprovada pela Meta;
- o canal Twilio está implementado mas também sujeito à mesma classe de restrição em contas de teste, e não foi validado com tráfego real;
- não há transcrição de áudio; mensagens de voz recebem uma resposta padrão pedindo texto;
- o pagamento é apenas registrado na conversa (Pix, cartão ou entrega); não há integração com gateway de pagamento nem confirmação automática;
- catálogo e pedidos são armazenados em memória, não em banco de dados; o histórico se perde ao reiniciar o processo.

## Como executar

Requer Node.js 18 ou superior.

```bash
npm install
```

Configurar variáveis de ambiente:

```bash
cp .env.example .env
```

Preencher `ANTHROPIC_API_KEY` e as variáveis correspondentes ao canal desejado.

```bash
npm run dev
```

Ao rodar, um QR code é exibido no terminal e salvo como `baileys-qr.png`. Basta escanear pelo WhatsApp, em Aparelhos conectados, Conectar um aparelho, para ativar o canal de teste via Baileys.

## Testes

O projeto inclui uma suíte de scripts de teste isolados, cobrindo desde a integração com a Claude API até fluxos completos de conversa.

```bash
node src/test-conversation.js
node src/test-contexto.js
node src/test-carrinho.js
node src/test-checkout.js
node src/test-similares.js
node src/test-precobaixo.js
node src/test-catalogo.js
node src/test-fotos.js
```

Os testes cobrem:

- integração com a Claude API e tratamento de erro de autenticação e de requisição;
- acúmulo determinístico de filtros entre mensagens;
- validação de filtros extraídos contra o catálogo;
- normalização de acentuação e caixa nas comparações de texto;
- busca e sugestão de produtos semelhantes;
- carrinho de compras e resolução de produto por referência indireta;
- checkout completo, incluindo casos de insistência do cliente no meio do fluxo;
- geração de resposta com persona e regra de não invenção de dados de produto;
- recusa por preço citando apenas diferenciais reais, sem prometer desconto ou parcelamento;
- envio de produtos como mensagens individuais com foto.

## Tecnologias

- Node.js
- Express
- Anthropic Claude API
- Meta WhatsApp Cloud API
- Twilio API
- Baileys (protocolo WhatsApp Web)
- Git e GitHub

## Estrutura

```text
whatsapp-loja-bot/
│
├── src/
│   ├── server.js              servidor Express e webhooks (Meta e Twilio)
│   │
│   ├── channels/
│   │   └── baileysWhatsapp.js conexão direta via WhatsApp Web
│   │
│   ├── services/
│   │   ├── claude.js          interpretação e geração via Claude API
│   │   ├── whatsapp.js        envio via Meta Cloud API
│   │   └── twilioWhatsapp.js  envio via Twilio
│   │
│   ├── bot/
│   │   ├── conversation.js    orquestração da conversa
│   │   ├── catalogSearch.js   busca e filtros no catálogo
│   │   ├── similarProducts.js sugestão de produtos semelhantes
│   │   ├── cart.js            lógica de carrinho
│   │   ├── checkout.js        fluxo de fechamento de pedido
│   │   ├── sessionStore.js    memória de conversa por cliente
│   │   ├── filtrosState.js    mesclagem de filtros entre mensagens
│   │   ├── colorFamilies.js   agrupamento de cores semelhantes
│   │   └── persona.js         nome, tom de voz e diferenciais da marca
│   │
│   ├── data/
│   │   ├── catalog.js         catálogo de produtos
│   │   ├── orders.js          registro de pedidos
│   │   └── images/            fotos dos produtos
│   │
│   ├── utils/
│   │   └── normalizarTexto.js normalização de acentuação e caixa
│   │
│   └── test-*.js              suíte de testes
│
├── docs/
│   └── CHANGELOG.md           histórico de decisões técnicas
│
├── .env.example
├── package.json
└── README.md
```

## Objetivos de aprendizado

- integração com API de LLM e prompt engineering para extração estruturada de dados;
- separação entre interpretação e geração de linguagem para reduzir alucinação;
- integração com webhooks e com protocolo WhatsApp Web;
- arquitetura de múltiplos canais de mensageria com lógica de negócio desacoplada;
- gerenciamento de estado e sessão de conversa;
- testes automatizados de fluxos de conversa e regras de negócio;
- versionamento com Git, commits atômicos e changelog documentado.

## Próximos passos

- transcrição de mensagens de áudio;
- integração com gateway de pagamento real, com confirmação automática via Pix;
- migração de catálogo e pedidos de memória para banco de dados.
