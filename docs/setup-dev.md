# TCC Web App — Setup do Ambiente de Desenvolvimento

Stack: clasp (CLI) + VS Code + conta Google Workspace institucional (UFAM)

---

## Estrutura de Pastas do Projeto

Flat — todos os `.gs` em `src/`, raiz reservada para arquivos de configuração do toolchain.

```plaintext
tcc-webapp/
  assets/
    logo*.png        <- identidade visual (ver arch.md)
  docs/
    img/
      *.png          <- arquivos de imagens usados na documentação
    features/
      *.md           <- um arquivo por funcionalidade (login, setup, dashboards...)
    diagrams/
      *.md           <- um diagrama mermaid por fluxo
    arch.md
    checkpoint.md
    data-structure.md
    deploy-joomla.md
    roadmap.md
    setup-dev.md
    specs.md
  src/
    appsscript.json
    *.js
    main.js  <- ponto de entrada (doGet())
    ui_*.html
  tests/
    *.test.cjs       <- testes locais em Node (ver "Testes locais")
  tools/
    md2doc.sh        <- gera HTML/PDF a partir dos .md (ver abaixo)
  AGENTS.md  <- orientações para agentes de IA (qualquer ferramenta)
  CLAUDE.md  <- só importa o AGENTS.md, para o Claude Code
  .clasp.json
  .gitignore
```

> Apps Script não tem módulos: todos os arquivos em `src/` compartilham o mesmo escopo global. A pasta não cria namespace — é apenas organização local.

> **Só `src/` sobe.** O `"rootDir": "src"` do `.clasp.json` é o que limita o
> push — não há `.claspignore` no projeto. `clasp status` lista exatamente o que
> seria enviado, e `docs/`, `tools/` e `assets/` não estão lá.

---

## Pré-requisitos

- Node.js 18+
- Conta Google Workspace UFAM
- VS Code

---

## Passo 1 — Habilitar a Apps Script API no perfil pessoal

A Apps Script API precisa estar ativada na conta que irá usar o clasp.

1. Acesse: <https://script.google.com/home/usersettings>
2. Ative **Google Apps Script API**

---

## Passo 2 — Google Cloud Console: criar o projeto

1. Acesse: <https://console.cloud.google.com>
2. No seletor de projetos (topo), clique em **Novo Projeto**
3. Nome: `tcc-webapp` → **Criar**
4. Aguarde a criação e selecione o projeto

---

## Passo 3 — Habilitar as APIs necessárias

No projeto `tcc-webapp`, acesse **APIs e Serviços → Biblioteca** e habilite:

| API | Finalidade |
| --- | --- |
| Google Drive API | Criar planilhas e Google Docs |
| Google Calendar API | Se precisar configurar eventos |
| Google Sheets API | Acesso às planilhas |
| Gmail API | Envio de e-mails |
| Apps Script API | Deploy e execução remota |

Para cada API: pesquise pelo nome → clique → **Ativar**.

---

## Passo 4 — Configurar a tela de consentimento OAuth

1. Acesse **APIs e Serviços → Tela de permissão OAuth**
2. Tipo de usuário: **Interno** (disponível pois é conta Workspace — não exige verificação do Google)
3. Preencha:
   - Nome do app: `TCC Web App`
   - E-mail de suporte: seu e-mail institucional
   - E-mail do desenvolvedor: seu e-mail institucional
4. Escopos: deixe em branco por enquanto (o `appsscript.json` os declara)
5. Clique em **Salvar e continuar** até concluir

---

## Passo 5 — Criar credenciais OAuth para o clasp

1. Acesse **APIs e Serviços → Credenciais**
2. Clique em **Criar credenciais → ID do cliente OAuth**
3. Tipo: **Aplicativo para computador**
4. Nome: `clasp-dev`
5. Clique em **Criar**
6. Faça o download do JSON → salve como `~/.clasprc-ufam.json` (não coloque dentro do repositório)

---

## Passo 6 — Instalar o clasp

```bash
npm install -g @google/clasp
```

Verifique a instalação:

```bash
clasp --version
```

---

## Passo 7 — Login do clasp com a conta UFAM

```bash
clasp login --creds ~/.clasprc-ufam.json
```

O browser abrirá uma tela de autorização OAuth. Faça login com a conta UFAM e autorize.

> Se a conta UFAM tiver políticas de OAuth restritivas (admin bloqueando apps externos), será necessário que o administrador do Workspace autorize o app `tcc-webapp` no Google Admin Console. Verifique com o TI da UFAM se necessário.

---

## Passo 8 — Criar o projeto Apps Script

```bash
mkdir tcc-webapp && cd tcc-webapp
mkdir src
clasp create --type standalone --title "TCC Web App" --rootDir ./src
```

Isso cria:

- O script no Google Drive da conta UFAM
- O arquivo `.clasp.json` na raiz com o `scriptId`

Abra `.clasp.json` e confirme que `rootDir` aponta para `./src`:

```json
{
  "scriptId": "<ID_GERADO>",
  "rootDir": "./src"
}
```

---

## Passo 9 — Vincular o projeto Apps Script ao projeto GCP

Este passo associa as APIs habilitadas no passo 3 ao script.

1. Acesse: <https://script.google.com>
2. Abra o projeto `TCC Web App`
3. Vá em **Configurações do projeto** (ícone de engrenagem)
4. Em **Projeto do Google Cloud Platform**, clique em **Alterar projeto**
5. Informe o **Número do projeto** — encontrado no Cloud Console em **IAM e Admin → Configurações**, campo "Número do projeto" (ex.: `837825562634`)
6. Clique em **Definir projeto**

---

## Passo 10 — Criar o `appsscript.json` inicial

Substitua o conteúdo de `src/appsscript.json` gerado pelo clasp:

```json
{
  "timeZone": "America/Manaus",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE"
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
}
```

> O escopo `script.send_mail` é o do `MailApp`, usado pelas notificações de cada etapa (`ServiceNotification.js`) e pelo envio da senha do membro externo. O escopo `drive` (sem `.file`) é necessário para criar a planilha de registro, as planilhas de período letivo e as cópias do documento modelo da proposta dentro da pasta configurada. O escopo `documents` é necessário para editar o Google Doc duplicado da proposta (`ServiceProposal.js`, `_createProposalDoc`) — ver `data-structure.md` ("Template da Proposta").
>
> **Os escopos `classroom.*` e o serviço avançado do Classroom saíram** na fatia B (20/Ago/2026), junto com o `DaoClassroom.js`. Trocar a lista de escopos **obriga a reautorizar o app** no próximo acesso. Este bloco reflete o `src/appsscript.json` atual do projeto; se estiver bootstrapando um projeto novo do zero, confira o arquivo real do repositório.

---

## Passo 11 — Criar o `.claspignore`

O `.clasp.json` já define `rootDir: ./src`, então o clasp ignora tudo fora de `src/` automaticamente. O `.claspignore` serve para filtrar arquivos *dentro* de `src/` que não devem ser enviados (ex.: arquivos de teste ou temporários).

Se `src/` contiver apenas `.gs` e `appsscript.json`, o arquivo pode ser omitido. Caso queira criá-lo explicitamente para incluir apenas os tipos válidos:

```plaintext
**/**
!**/*.gs
!**/*.html
!appsscript.json
```

---

## Passo 12 — Criar o `.gitignore`

O `~/.clasprc-ufam.json` já fica fora do repositório (na home), mas adicione a regra por precaução caso alguém acidentalmente copie o arquivo para dentro do projeto. Não há `node_modules/` local pois o clasp foi instalado globalmente.

```plaintext
# Credenciais OAuth — não commitar
*.clasprc*.json
.env
```

---

## Passo 13 — Primeiro push

```bash
clasp push
```

Acesse <https://script.google.com> e confirme que os arquivos aparecem no projeto.

Para push automático a cada save:

```bash
clasp push --watch
```

---

## Passo 14 — Fazer o deploy do Web App

1. No Apps Script, acesse **Implantar → Nova Implantação**
2. Clique no ícone de engrenagem e selecione tipo: **Aplicativo da Web**
3. Configure:
   - Descrição: `TCC Web App dev`
   - Executar como: **Eu** (sua conta UFAM)
   - Quem tem acesso: **Qualquer pessoa** — o sistema hoje suporta login com
     contas fora do domínio ufam.edu.br (usado para testar Aluno/Orientador
     com contas Gmail pessoais, ver "Contas de teste recomendadas" abaixo e
     `features/login.md`). Restringir ao domínio ufam.edu.br é uma
     mudança de segurança planejada, mas ainda não implementada — ver
     `roadmap.md`.
4. Clique em **Implantar** e autorize as permissões solicitadas
5. Copie a URL gerada e acesse no browser — a tela de configuração inicial do sistema abrirá

> Para testes rápidos após cada `clasp push`, use **Implantar → Testar implantações** — a URL de teste sempre executa o código mais recente sem precisar criar nova implantação.

---

## Passo 15 — Bootstrap: Setup Inicial do sistema

Na primeira execução, `doGet()` (via `isSystemSetup()`) detecta que falta a
planilha de registro e/ou o documento modelo da proposta, e exibe a tela de
Configuração Inicial (`ui_app_initial_setup.html`) mostrando só o que falta
— ver `features/setup.md`:

1. Acesse a URL do deploy no browser.
2. Se faltar a planilha de registro: informe o ID da pasta do Drive onde os
   arquivos serão criados/editados. O sistema cria a planilha
   (`TCC_WebApp_Registry`), salva `REGISTRY_SHEET_ID` e `DATA_DIR_ID` em
   Script Properties.
3. Se faltar o documento modelo da proposta: cole o link ou o ID de um
   Google Doc criado manualmente com os marcadores `{{TITULO}}`,
   `{{NOME_ALUNO}}`, `{{MATRICULA}}` e as seções Resumo/Objetivos/
   Metodologia/Referências (ver "Template da Proposta" em
   `data-structure.md`). O sistema salva `PROPOSAL_TEMPLATE_DOC_ID`.
4. Clique em **Salvar Configuração** — o sistema confirma e libera o acesso.

---

## Passo 16 — Iniciar o primeiro período letivo

Após o bootstrap (Passo 15), a Planilha-Registro existe mas não possui
nenhum período letivo (`Semester`) com status `Ativo`. O sistema então
mostra a tela de Setup do Período Letivo (`ui_app_semester_setup.html`)
automaticamente após o login (a mesma tela aparece sempre que não houver
período letivo ativo, inclusive após encerrar todos os períodos de um
ciclo):

1. Acesse a URL do deploy e faça login com o e-mail do professor
   Responsável.
2. A tela de setup do período letivo aparece.
3. Preencha:
   - **Período Letivo (Semester)** — texto livre, ex.: `2026.2`
   - **Responsável da Turma (E-mail)** — pré-preenchido com o e-mail de
     login, somente leitura
4. Clique em **Criar Período Letivo**.
5. `startSemester()` cria a planilha do período (`Students`, `Proposals`,
   `Committees`, `Defenses`, `Events`), sorteia o **código de matrícula** e
   registra a linha na planilha de registro.
6. Pressione **F5** (ou clique em "Acessar o sistema" na tela de sucesso) —
   o sistema entra no fluxo normal.
7. No painel do Responsável, abra **Professores** para ver o código de
   matrícula do período e cadastrar os orientadores.

---

## Fluxo de desenvolvimento

```bash
# Editar arquivos localmente em src/
# Push para o Apps Script
clasp push

# Ver logs de execução
clasp logs --watch

# Pull para sincronizar mudanças feitas no editor online
clasp pull
```

### Gerar HTML/PDF da documentação

```bash
tools/md2doc.sh docs/deploy-joomla.md          # -> docs/deploy-joomla.html
tools/md2doc.sh docs/deploy-joomla.md pdf      # -> docs/deploy-joomla.pdf
tools/md2doc.sh docs/diagrams/*.md pdf         # um PDF por diagrama
```

Requer `pandoc` e `google-chrome`. Os diagramas mermaid são renderizados de
verdade: o script gera o HTML com o mermaid do CDN e manda o Chrome imprimir em
PDF, então a primeira geração precisa de rede. O pandoc sozinho (`pandoc x.md -o
x.pdf --pdf-engine=xelatex`) serve para os documentos sem diagrama — ele deixa a
cerca `mermaid` como código literal.

A saída é ignorada pelo git (`docs/**/*.html`, `docs/**/*.pdf`): o fonte é o
`.md`, o resto é derivado.

---

## Contas de teste recomendadas

Para testar os três papéis, use contas distintas:

| Papel | Conta |
| --- | --- |
| Responsável | Conta UFAM principal (a que publicou o app) |
| Orientador | Cadastrado em **Professores**. Se for uma conta gmail.com de teste, marque **externo** e use a senha que o sistema gera |
| Aluno | Conta que entra por **?page=enrollment** com o código do período |

> **Conta Gmail no papel de Aluno**: o auto-cadastro exige uma conta que o
> Google identifique, o que na prática significa `@ufam.edu.br`. Para testar sem
> uma segunda conta institucional, defina a Script Property
> `TEST_LOGIN_ENABLED=true` — ela libera o auto-cadastro para contas não
> identificadas, mas continua recusando qualquer e-mail já cadastrado como
> professor. **Deixe-a desligada na implantação real** (ver `features/login.md`).

### Script Properties úteis no desenvolvimento

| Propriedade | Efeito |
| --- | --- |
| `NOTIFICATIONS_ENABLED=false` | Silencia as notificações de fluxo, para depurar em nuvem sem disparar e-mails reais |
| `TEST_LOGIN_ENABLED=true` | Permite o auto-cadastro de aluno com conta que o Google não identifica |
| `PUBLIC_URL=https://feec.ufam.edu.br/tccweb` | URL de divulgação usada nos links dos e-mails. Vazia em desenvolvimento: aí o app usa a URL da implantação que está rodando |

---

## Publicação na página da FEEC

A URL que o app divulga é `https://feec.ufam.edu.br/tccweb`, servida pelo Joomla
do site da Faculdade. Ela **não** hospeda o app: é um item de menu que leva à
implantação de produção no `script.google.com`.

### Por que não embutir o app num iframe do Joomla

Foi a primeira ideia e ela não funciona. Dentro de um iframe em outro domínio,
os cookies de sessão do Google viram *third-party*: o Safari bloqueia por padrão
e o Firefox particiona por padrão, e nos dois o usuário aparece deslogado. Pior,
não há como relogar ali dentro — o `accounts.google.com` responde
`X-Frame-Options: DENY`, então nem a tela de login nem a de consentimento OAuth
renderizam num iframe. Some-se a isso que a navegação do app é toda por
`window.top.location` e `target="_top"` (ver `features/login.md`), que num
iframe aninhado jogaria o usuário para fora da página da FEEC no primeiro
clique. Nenhum refactor do app resolve os dois primeiros pontos.

### As duas implantações

O projeto tem uma implantação de **produção** — a que o Joomla aponta — e uma de
**teste**, usada no desenvolvimento. Cada implantação tem ID e URL fixos: um
`clasp deploy --deploymentId <ID>` cria uma nova versão e **repõe a mesma
implantação** nela, sem trocar a URL. É o que mantém o link do Joomla válido
para sempre.

```bash
clasp push -f                                                    # só atualiza o HEAD
clasp deploy --deploymentId <ID_TESTE> --description "teste: ..."  # cria a versão N
clasp deploy --deploymentId <ID_PRODUCAO> -V <N> --description "PRODUÇÃO: vN"
```

O `-V <N>` é o que faz "promover" significar promover: a produção passa a
servir **a mesma** versão que foi testada. Sem ele, o segundo comando tira um
snapshot novo do HEAD, e qualquer edição feita durante o teste vai para a
produção sem ter sido testada. `clasp push` sozinho não publica nada: o `/exec`
serve a versão implantada, não o HEAD.

> **Nunca rode `clasp deploy` sem `--deploymentId`.** A forma nua cria uma
> implantação nova, com URL nova — e aí o link publicado na página da FEEC
> passa a servir código congelado.

### O que as duas implantações compartilham

Tudo, menos a URL: mesmo projeto Apps Script, mesmas Script Properties, mesma
planilha de registro, mesma pasta no Drive. Duas consequências:

- Testar na implantação de teste **escreve no registro real**. Isolar de verdade
  exigiria um segundo projeto Apps Script, com o seu próprio `REGISTRY_SHEET_ID`.
- `TEST_LOGIN_ENABLED` vale para as duas ao mesmo tempo. Com o app divulgado
  publicamente, deixá-la ligada permite que **qualquer conta Gmail** se
  auto-cadastre como aluno. Mantenha-a desligada e teste o papel de Aluno com
  uma segunda conta `@ufam.edu.br`.

### Item de menu no Joomla

Artigo de porta de entrada + item de menu com alias `tccweb`, no nível superior.
O roteiro completo — artigo, item de menu, `PUBLIC_URL`, verificação e como
desfazer — está em `deploy-joomla.md`.

### O que a URL amigável não carrega

Parâmetros. Nem o alias de menu nem o `com_redirect` do Joomla repassam a query
string, então `PUBLIC_URL` só entra em links sem `?`: o "Abra o sistema" no
rodapé das notificações (`ServiceNotification`). Os links com token — assinatura
de Ata (`ServiceDefense`) e convite de professor (`ServicePeople`) — continuam
apontando direto para a implantação, e é proposital: são de uso único e clicados
na hora. Ver `getPublicAppUrl()` em `utils.js`.


## Testes locais

Com Node.js 18 ou superior, sem instalar dependências:

```bash
node --test tests/
```

Rode antes de todo `clasp push`. As suítes:

| Arquivo | O que garante |
| --- | --- |
| `public-surface.test.cjs` | Nenhuma função chamável pelo navegador além das aprovadas em `PUBLIC` ([rationale 2.2](rationale.md#22-função-global-é-endpoint-público)) |
| `cell-safe.test.cjs` | Texto digitado nunca é gravado como fórmula ([rationale 5.7](rationale.md#57-texto-digitado-nunca-vira-fórmula)) |
| `performance-cache.test.cjs` | Cache de leitura e de autenticação (detalhe abaixo) |
| `semester-report.test.cjs` | Regras do consolidado do período |

A suíte de cache simula execuções isoladas do Apps Script compartilhando planilhas e
cache. Verifica reutilização de leituras, escrita agrupada, leitura após escrita,
isolamento de identidades, timeout de cinco minutos, invalidação, troca de papel
e período, indisponibilidade do cache e notificações de invalidação durante
requisições concorrentes. Os contadores representam chamadas ao serviço simulado;
a latência real deve ser medida na implantação do Apps Script.
