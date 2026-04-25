# Análise do Projeto WhatsApp Bot

## Visão geral

Este projeto implementa um bot de WhatsApp que recebe leads de anúncios, pergunta informações ao usuário em etapas e grava dados em um banco SQLite.

O fluxo principal é:
1. Iniciar banco de dados
2. Conectar ao WhatsApp com Baileys
3. Receber mensagens e processar conforme estado do usuário
4. Salvar informações de lead e formulário no banco
5. Expor um painel básico via Express para consulta de leads e fichas

## Dependências principais

- `@whiskeysockets/baileys`: cliente WhatsApp para Node.js
- `better-sqlite3`: banco de dados SQLite embutido
- `express`: servidor HTTP para monitoramento
- `pino`: logger usado pelo Baileys
- `dotenv`: presente nas dependências, mas não usada nos arquivos mostrados
- `qrcode-terminal` e `whatsapp-web.js`: também estão no `package.json`, mas não são usados no código existente

## Arquivo de entrada

### `index.js`

Este arquivo é o ponto de partida do bot.

O que faz:
- importa funções de `database.js` e `connection.js`
- inicializa o banco de dados com `initDb()`
- cria conexão com WhatsApp via `connectToWhatsApp()`
- configura um servidor Express em `http://localhost:3000`
- expõe rotas:
  - `GET /leads`: retorna todos os leads cadastrados
  - `GET /ficha/:phone`: retorna os campos salvos para um número específico
  - `GET /`: health check com `{ status: 'Bot rodando' }`
- trata erros não capturados com `process.on('unhandledRejection', ...)`

> Observação: o `package.json` define `start` como `node src/index.js`, mas o único `index.js` presente está na raiz. Isso indica uma inconsistência entre a configuração do `package.json` e os arquivos atuais.

## Conexão WhatsApp

### `src/connection.js`

Responsável por criar a sessão do WhatsApp usando Baileys.

Principais ações:
- importa `makeWASocket`, `useMultiFileAuthState`, `DisconnectReason` e `fetchLatestBaileysVersion`
- usa `useMultiFileAuthState('./sessions')` para carregar credenciais salvas em disco
- obtém a versão mais recente do protocolo WhatsApp com `fetchLatestBaileysVersion()`
- instância o socket com `makeWASocket({ ... })`
- configura logger `pino({ level: 'silent' })`
- habilita exibição de QR code no terminal com `printQRInTerminal: true`
- mantém a instância em `sock` e exporta `connectToWhatsApp()` e `getSock()`

Eventos registrados:
- `creds.update`: salva credenciais sempre que mudam
- `connection.update`: trata os estados:
  - mostra QR quando necessário
  - indica conexão aberta
  - se desconectar, tenta reconectar automaticamente, exceto se a sessão foi encerrada (`loggedOut`)
- `messages.upsert`: recebe mensagens novas e chama `handleIncomingMessages(sock, messages)`

## Tratamento de mensagens

### `src/messageHandler.js`

Este arquivo contém o roteador de mensagens e o fluxo de conversa com o lead.

Componentes principais:
- importa estados e lógica de controle de fluxo de `stateManager.js`
- importa funções de envio e normalização de `./helpers`
- importa funções de gravação do banco de dados de `./database`
- define `AD_TRIGGER` como mensagem esperada do anúncio
- define palavras positivas em `POSITIVE`

Fluxo de `handleIncomingMessages(sock, messages)`:
1. Itera cada mensagem recebida
2. Ignora mensagens enviadas pelo próprio bot (`msg.key.fromMe`)
3. Ignora mensagens de grupos (`@g.us`)
4. Extrai texto de diferentes formatos de mensagem
5. Normaliza o texto para comparação
6. Busca estado atual do usuário com `getState(jid)`
7. Se o usuário estiver em `IDLE`, aceita apenas o texto exato do anúncio (`AD_TRIGGER`)
   - se bater, envia mensagem de boas-vindas e avança para `AWAITING_CITY`
   - caso contrário, ignora
8. Se o usuário já terminou (`COMPLETED`), não faz nada
9. Se estiver em estado de conversa, chama a função apropriada:
   - `AWAITING_CITY` → `handleCity`
   - `AWAITING_FICHA` → `handleConfirm`
   - `FILLING_FORM` → `handleForm`

### `sendWelcome(sock, jid)`

Manda o texto inicial pedindo cidade e CNPJ.

Define o estado para `AWAITING_CITY`.

### `handleCity(sock, jid, text)`

- salva a cidade/CNPJ no banco com `saveCity(jid, text)`
- envia uma imagem chamada `tabela-precos.jpg`
- envia o texto de exemplo explicando o crédito
- define estado para `AWAITING_FICHA`

### `handleConfirm(sock, jid, text)`

- checa se a resposta contém palavra positiva
- se não for positiva, responde educadamente e volta para `IDLE`
- se for positiva, inicia a ficha cadastral perguntando o nome completo
- define estado como `FILLING_FORM` e `form_step = 0`

### `handleForm(sock, jid, rawText, msg, step)`

- identifica o campo atual com base em `FORM_STEPS[step]`
- decide se o conteúdo é mídia (`imageMessage` ou `videoMessage`)
- salva no banco com `saveFormField(jid, currentField, valueToSave)`
- se for o último campo, envia mensagem de conclusão e define `COMPLETED`
- caso contrário, envia a próxima pergunta de `NEXT_QUESTION[step]` e avança `form_step`

> Nota: o código usa `[MIDIA:imagem]` ou `[MIDIA:video]` para representar mídia, mas não baixa ou armazena o arquivo físico.

## Gerenciamento de estados

### `src/stateManager.js`

Define os estados possíveis da conversa:
- `idle`
- `awaiting_city`
- `awaiting_ficha`
- `filling_form`
- `completed`

Define a ordem dos campos do formulário em `FORM_STEPS`.

Funções:
- `getState(phone)`: busca a linha de estado do usuário em `user_state`
- `setState(phone, state, formStep = 0)`: insere ou atualiza o estado do usuário no banco

A tabela `user_state` contém:
- `phone`
- `state`
- `form_step`
- `updated_at`

## Banco de dados

### `src/database.js`

Responsável por criar e ler dados do SQLite.

Funções:
- `initDb()`: abre `./bot.db`, cria as tabelas se não existirem e retorna o objeto de banco
- `getDb()`: retorna a instância do banco ou lança erro se não inicializado
- `saveCity(phone, cityCnpj)`: insere ou atualiza a tabela `leads` com `city_cnpj`
- `saveFormField(phone, field, value)`: insere ou atualiza um campo de formulário em `form_fields`
- `getFormData(phone)`: retorna todos os campos salvos para um telefone como objeto
- `getAllLeads()`: retorna todos os registros de `leads`

Tabelas criadas:
- `user_state`
- `leads`
- `form_fields`

## Helpers

### `src/helper.js`

Arquivo presente mas sem conteúdo. Isso significa que as funções `sendMsg`, `sendImage` e `normalize` importadas em `messageHandler.js` não estão definidas neste arquivo.

Sem esse arquivo implementado, o bot não conseguirá enviar mensagens ou normalizar texto corretamente.

## Fluxo completo de conversa

1. Usuário envia mensagem inicial exatamente igual a `"ola, tenho interesse e queria mais informações."`
2. Bot responde com saudação e pede cidade/CNPJ
3. Usuário envia cidade/CNPJ
4. Bot salva o lead, envia imagem de tabela de preços e envia texto explicativo
5. Bot pergunta se o usuário quer prosseguir
6. Se resposta for negativa, o bot volta ao estado `idle`
7. Se resposta for positiva, inicia o formulário de dados
8. Usuário responde pergunta a pergunta
9. Bot salva cada resposta em `form_fields`
10. Após a última pergunta, o bot envia confirmação de recebimento e define `completed`

## Pontos importantes e recomendações

- `package.json` e `index.js` parecem desincronizados com o layout real do projeto.
- `src/helper.js` está vazio, então funções essenciais de envio/normaização faltam.
- `whatsapp-web.js` e `qrcode-terminal` não são usados no código atual.
- O fluxo depende de uma mensagem inicial exata; qualquer variação será ignorada enquanto o estado estiver `idle`.

## Conclusão

O projeto implementa um bot de WhatsApp com fluxo de coleta de leads e formulário guiado, usando Baileys para conexão e SQLite para persistência. A maior parte da lógica de fluxo está em `src/messageHandler.js`, enquanto `src/database.js` garante armazenamento e `src/stateManager.js` mantém o estado de cada contato.


## Ajustes realizados

- Corrigido `package.json` para iniciar `index.js` na raiz.
- Atualizado `index.js` para importar `./src/database` e `./src/connection`.
- Removido import não utilizado `markCompleted` de `src/messageHandler.js`.
- Implementado `src/helper.js` com funções `sendMsg`, `sendImage` e `normalize`.
