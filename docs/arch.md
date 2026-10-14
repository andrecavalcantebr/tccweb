# TCC Web App — Arquitetura

Como o sistema é construído. O que ele faz está em [specs.md](specs.md); **por
que** cada escolha foi feita está em [rationale.md](rationale.md).

## Princípios

- MVC e componentes sempre que possível.
- Dados persistidos em planilha ou em Script Properties.
- CRUD genérico para planilha; serviços para a lógica de negócio.
- Nenhuma regra de autorização no cliente: a tela decide o que **mostrar**, o
  servidor decide o que **permitir**.

## Três apps em um

O sistema é três aplicações sobrepostas na mesma URL, cada uma com a sua
pergunta de entrada. Funcionalidade nova pertence a uma das três e herda a
guarda dela.

| | O que é | Quem entra | Onde está |
| --- | --- | --- | --- |
| **1. Configuração** | Setup do sistema (pasta do Drive, documentos modelo) e do período letivo | Sistema: só o dono do script. Período: dono **ou** Responsável de um período em andamento | `?page=setup`, `initial_setup`, `semester_setup` |
| **2. O app** | O fluxo do TCC: Aluno, Orientador, Responsável | Conta Google validada **e** estar em `Teachers`/`Students` | `login` → `dashboard_*` |
| **3. O externo** | Banca e assinatura da Ata pelo convidado | Conta Google validada **mais** e-mail e senha do cadastro | mesma tela de login; assina em `?page=sign` (`ui_app_sign_minutes`) |

A conta Google é pré-requisito das três — ver [rationale 1.1](rationale.md#11-conta-google-é-obrigatória-mas-não-precisa-ser-institucional).
O app 3 não é uma porta separada, é uma **prova de identidade** separada: a tela
de login é uma só.

## Quem é quem

Duas perguntas diferentes: **o que a pessoa é** (tipo, que decide como
autentica) e **o que ela faz** (papel, que decide o que vê).

### Tipos de usuário

| Tipo | Onde vive | Como autentica |
| --- | --- | --- |
| Teacher da instituição | `Teachers`, `IsExternal` falso | Conta Google institucional, sem senha |
| Student | `Students` do período | Conta Google institucional, sem senha |
| Externo à instituição | `Teachers`, `IsExternal` verdadeiro | Conta Google **qualquer** mais a senha gerada no cadastro |

`IsExternal` é deduzido do domínio do e-mail (`_isInstitutionalEmail_`), nunca
digitado — [rationale 3.2](rationale.md#32-isexternal-é-deduzido-do-domínio-não-perguntado).

### Papéis

`Responsável`, `Orientador` e `Aluno`, atribuídos **por período letivo**: a
mesma pessoa pode ser Responsável em 2026.1 e apenas Orientador em 2026.2.
Fora dessa lista existe o **dono do app**, que só aparece na camada 1.

`AuthService._rolesInSemester` resolve os três de forma independente:

- `Responsável` — o e-mail bate com `Semesters.InchargeEmail`;
- `Orientador` — o e-mail está em `Teachers` (ativo);
- `Aluno` — o e-mail está em `Students` daquele período.

Acumular é normal e esperado: o Responsável **também** orienta, e o seletor do
cabeçalho troca a visão.

### "Externo" quer dizer duas coisas

**Externo ao sistema** é quem ainda não está em `Teachers`. São dois casos,
separados pelo domínio do e-mail:

| Quem é | Critério | Depois de cadastrado |
| --- | --- | --- |
| Professor da instituição ainda desconhecido | **tem** e-mail do domínio | Teacher pleno: entra pelo Google, orienta, pode ser Responsável |
| **Externo à instituição** | **não tem** | Entra com senha, compõe banca, assina Ata; **nunca orienta** |

Daí duas listas em `ServicePeople.js`: `getTeacherEmails_()` responde "quem
entra?" e inclui externos; `getAdvisorEmails_()` responde "quem orienta?" e não
inclui — [rationale 2.4](rationale.md#24-duas-listas-quem-entra-e-quem-orienta).

### Toda indicação passa pelo Responsável

Ter e-mail da instituição não prova ser professor: alunos também têm. O domínio
decide apenas **como** a pessoa autentica; quem decide **quem ela é** é o
Responsável, e o gesto que registra a decisão é pôr a linha em `Teachers`.

## Entrada de pessoas

| Caminho | Para quem | Forma |
| --- | --- | --- |
| Link de matrícula | Aluno | `?page=enrollment&code=XXXXXX` — **compartilhável**, quantas vezes forem |
| Convite individual | Professor e externo | `?page=teacher_signup&token=…` — **um e-mail, uma vez**, 14 dias |
| Cadastro direto | Professor e externo | O Responsável digita tudo; nasce ativo |
| Homologação da banca | Membros da banca | O sistema convida sozinho quem ainda não conhece |

O link do aluno pode ser espalhado (auto-matrícula é o desenho, e o código do
período já vai impresso no Plano de Ensino). O do professor não pode — ver
[rationale 2.3](rationale.md#23-auto-cadastro-de-professor-é-escalada-de-privilégio).

Todo cadastro novo dispara um convite por e-mail: o link para todos, a senha só
para quem precisa dela. `cmdResendInvitation` reenvia e renova o token; a senha
nunca é reexibida, só substituída.

---

## As visões e como estão implementadas

Toda view é um `ui_app_*.html` renderizado por `renderView(nome, args)`
(`main.js`), que injeta os argumentos no template e serve a página com
`ui_styles` e `ui_scripts` incluídos. O controlador de cada view vive no
`<script>` dela — ver a convenção em [AGENTS.md](../AGENTS.md).

### Camada 1 — Configuração

| View | Rota | Guarda | O que faz |
| --- | --- | --- | --- |
| `ui_app_initial_setup.html` | `!isSystemSetup()` ou `?page=setup` | `_isAppOwner_()` | Pasta do Drive e os três documentos modelo. Campo em branco mantém o valor atual |
| `ui_app_semester_setup.html` | nenhum período ativo | `_isAppOwner_()` | Cria o primeiro período letivo |

O mesmo ato de criar período existe também **dentro** do app, no painel do
Responsável (`cmdCreateSemester`), guardado por `_assertCanManageSemesters_`.
Não é duplicação — [rationale 2.7](rationale.md#27-setup-do-sistema-e-setup-do-período-são-separados).

Só `REGISTRY_SHEET_ID` e `PROPOSAL_TEMPLATE_DOC_ID` fazem `isSystemSetup()`
verdadeiro. Os modelos da Ata e da Folha são cobrados na hora de gerar o
documento, por `_requireTemplate_`.

### Camada 2 — Entrada

| View | Rota | O que faz |
| --- | --- | --- |
| `ui_app_login.html` | `?page=login` (padrão) | Campo de senha só aparece quando o Google não resolve o e-mail. POST para `?page=validate_login` com nonce |
| `ui_app_enrollment.html` | `?page=enrollment[&code=]` | Auto-cadastro do aluno: nome, matrícula, e-mail, telefone. POST para `?page=validate_enrollment` |
| `ui_app_teacher_signup.html` | `?page=teacher_signup&token=` | O professor completa o próprio cadastro. Em conta institucional, a conta Google logada tem de ser a convidada |
| `ui_app_sign_minutes.html` | `?page=sign&token=` | Membro da banca assina a Ata. O token diz qual ata; quem pode assinar é decidido pela sessão |
| `ui_app_verify.html` | `?page=verify[&key=]` | Confere um documento pela chave impressa nele |
| `ui_error.html` | qualquer recusa | Tela de erro no tema do app |

As três telas de entrada postam para o mesmo roteador (`doPost` → `_route_`), com
token de uso único contra replay — [rationale 7.1](rationale.md#71-o-login-é-post)
e [7.2](rationale.md#72-toda-requisição-reproduzível-precisa-de-nonce-ou-de-ordem-correta).

### Camada 2 — Painéis

Os três recebem o payload **dentro da página** (`initialPayload`) e mantêm
`google.script.run` como alternativa, para o botão "Tentar novamente" e para
toda ação — [rationale 7.6](rationale.md#76-o-painel-viaja-dentro-da-página).

| View | Papel | Payload | Ações |
| --- | --- | --- | --- |
| `ui_app_dashboard_student.html` | Aluno | `getStudentDashboardData()` | `cmdSaveDraft`, `cmdSubmitProposal`, `cmdConcludeTcc`, `cmdStudentAgreement`, `cmdSubmitFinalWork`, `cmdAddComment` |
| `ui_app_dashboard_advisor.html` | Orientador | `getAdvisorDashboardData()` | `cmdApproveProposal`, `cmdReturnProposal`, `cmdSubmitCommittee`, `cmdCreateMinutes`, `cmdSaveMinutes`, `cmdSignMinutesAsAdvisor`, `cmdSignMinutes`, `cmdAddComment`, `cmdUpdateMyProfile` |
| `ui_app_dashboard_incharge.html` | Responsável | `getInchargeDashboardData()` | homologações (proposta, banca, defesa), `cmdFinalizeTcc`, `cmdCloseTcc`, gestão de professores e de períodos (`cmdUpdateSemesterDates`), consolidado em CSV (`getSemesterReport`) |

**O que cada painel mostra**

- **Aluno** — a barra de fases, o cartão da fase atual e a linha do tempo. O
  formulário da proposta aparece quando `permissions.canEdit`; os botões seguem
  `canSubmit`/`canConclude`. Um único TCC, o dele.
- **Orientador** — lista mestre-detalhe dos orientandos (as propostas em que o
  e-mail dele é `AdvisorEmail`), com aprovação, devolução, o formulário da banca
  e a Ata. Mais dois blocos separados: **"Atas aguardando a sua assinatura"**,
  com as bancas de outros orientadores em que ele é membro — a única porta de
  assinatura de quem não orienta ninguém — e **"Convite aos Alunos"**, o
  código/link de matrícula do período em leitura, para repassar aos próprios
  alunos sem depender do Responsável. Mais **"Meus Dados"**, onde o professor
  corrige o próprio cadastro (nome, titulação, instituição, telefone; o e-mail
  não) — a fonte única que preenche também o presidente da banca.
- **Responsável** — tabela mestra com **uma linha por aluno matriculado**
  (não por proposta: quem ainda não propôs também precisa aparecer), métricas,
  o painel de Professores (só gestão de professor), o painel de Período Letivo
  (código/link de matrícula do período corrente, criação e encerramento de
  período), e o botão de Configuração do Sistema — só renderizado para o dono
  do app.

Todo botão de ação nasce de `permissions`, calculado no servidor por
`TccStateFactory` — a mesma máquina de estados que os comandos consultam. A tela
nunca decide sozinha o que é permitido.

### Componentes compartilhados

| Arquivo | Papel |
| --- | --- |
| `ui_comp_page_header.html` | Banner: logo, descrição da visão, botão "Verificar documento", perfil, seletor de papel e de período |
| `ui_comp_flow_steps.html` | Barra de fases, dirigida por `phaseIndex` |
| `ui_comp_event_log.html` | Linha do tempo de um TCC; recolhida por padrão |
| `ui_comp_modal.html` | Diálogos no tema do app, no lugar de `confirm()`/`alert()` |
| `ui_styles.html` | CSS global |
| `ui_scripts.html` | `escHtml`, `beginBusy`, watchdog de carga, links de arquivo |
| `ui_asset_logo*.html` | Imagens em base64, uma por arquivo |

### Troca de papel e de período

Ambas são **rotas** (`?page=switch_role`, `?page=switch_semester`), não comandos
— [rationale 7.3](rationale.md#73-redirecionamento-vai-na-navegação-não-no-callback).
São aplicadas depois da checagem de timeout, e limitadas ao que a pessoa
realmente tem naquele período.

---

## Camadas do servidor

| Arquivo | Responsabilidade |
| --- | --- |
| `main.js` | `doGet`/`doPost` → `_route_`; renderização e includes |
| `DaoSheets.js` | CRUD genérico sobre planilha, com mapeamento dinâmico de cabeçalho |
| `ServiceAuth.js` | Identidade, sessão, papéis, períodos do usuário |
| `ServicePeople.js` | `Teachers` e `Students`; convites, senhas, nomes oficiais |
| `ServiceTccState.js` | Máquina de estados: quem pode o quê em cada status |
| `ServiceProposal.js` | Fases 1 e 2: proposta e desenvolvimento |
| `ServiceCommittee.js` | Fase 3: banca |
| `ServiceDefense.js` | Fases 4 e 5: Ata, assinaturas, PDFs, entrega final e encerramento sem banca |
| `ServiceEventLog.js` | Log de atividades (aba `Events`) |
| `ServiceNotification.js` | E-mail de cada transição, enxertado no log |
| `ServiceDashboard.js` | Agregação dos payloads dos painéis |
| `ServiceReport.js` | Consolidado do período em CSV: regras puras (`*_`) e o endpoint `getSemesterReport` |
| `ServiceSetup.js` | Configuração do sistema e dos períodos; endpoints de pessoas |
| `utils.js` | Enums, colunas, helpers de data, normalização |
| `diagnostics.js` | Diagnósticos para rodar no editor (Executar). Só escrevem no log; o único que altera estado, `forceReauth`, recusa quem não é o dono |

Um comando de escrita segue sempre o mesmo caminho: `cmd*` → `getContext()`
(identidade e sessão válida) → `assertActiveSession()` (atividade) → serviço → `TccStateFactory`
(permissão) → checagem de propriedade → escrita → log → notificação → payload
recalculado na mesma execução.

## Superfície pública

No Apps Script, **toda** função global cujo nome não termina em `_` pode ser
chamada pelo navegador via `google.script.run`, por qualquer conta Google, com
ou sem sessão. O `_` no início não esconde nada. Por isso:

- função interna termina em `_` (`_signMinutes_`, `getSheetManager_`);
- as públicas são só `doGet`/`doPost`, os comandos `cmd*`, as leituras dos
  painéis, as telas `render*` e helpers puros — cada uma resolve sozinha quem
  chama;
- `tests/public-surface.test.cjs` mantém a lista aprovada e falha com qualquer
  função pública nova.

Toda escrita em planilha passa pelo `SheetDao`, que grava como texto o que
começaria por `= + - @` (`_cellSafe_`). Ver
[rationale 2.2](rationale.md#22-função-global-é-endpoint-público) e
[5.7](rationale.md#57-texto-digitado-nunca-vira-fórmula).

## Cache e acesso a dados

`SheetDao` compartilha aba, cabeçalhos e linhas entre instâncias durante uma
execução, usando planilha + nome da aba como chave. As consultas devolvem cópias,
inclusive de datas. Escritas invalidam as linhas; a leitura seguinte consulta o
Sheets novamente. `update` agrupa somente células alteradas adjacentes, mantendo
intactas as demais células. `upsert` reaproveita a busca feita por `update`.

`AuthService` compartilha a instância na execução e mantém o contexto validado
no `CacheService` entre chamadas. A chave inclui a identidade Google e o registro;
o conteúdo não inclui senhas. A validade máxima reutiliza
`SESSION_TIMEOUT_MINUTES = 5`, limitada também pelo vencimento da sessão.
Acertos de cache não prolongam a validade da autorização. `LastActivity` continua
sendo persistido no intervalo já existente de metade do timeout; essa gravação
periódica pode acessar o Sheets mesmo com autorização em cache.

- `invalidateCurrentUserAuth_()` descarta a validação do usuário atual e força
  nova leitura na próxima consulta, inclusive na mesma execução.
- `invalidateAllUserAuth_()` descarta as validações de todos os usuários por uma
  revisão em Script Properties (`AUTH_CACHE_REVISION`, gerenciada pelo código).
- Escritas de sessão que alteram perfil, papel ou período invalidam o usuário.
  Escritas em `Teachers`, `Students` e `Semesters` invalidam todas as validações.
- Alterações manuais nas planilhas são percebidas na expiração ou após
  invalidação explícita. As funções de invalidação são internas ao servidor.
- Cache ausente, removido antecipadamente ou indisponível resulta em leitura das
  planilhas. Uma sessão expirada não é renovada por uma atualização de painel.

O painel do orientador reutiliza índices de propostas e alunos nas assinaturas
pendentes. O histórico individual filtra os eventos da proposta antes de montar
e ordenar a resposta. Dados de propostas, bancas, atas e eventos não são
armazenados em cache entre requisições.

## Estrutura de dados

Detalhe completo em [data-structure.md](data-structure.md). Em resumo:

- **Um único status por aluno** (`TccStatus` em `Proposals.Status`), atravessando
  todas as fases; `Committees` e `Defenses` guardam só os dados das suas.
- **Pessoas em tabelas próprias**: `Teachers` no registro (atravessa períodos),
  `Students` na planilha do período.
- **Nome oficial vem sempre da tabela** (`getPersonName_`), nunca do login.
- **Sessões no registro**, porque períodos coexistem e é a sessão que diz em qual
  o usuário está.
- **Conteúdo rico da proposta num Google Doc** por aluno; a planilha guarda o ID.

## Organização no Drive

Duas responsabilidades, e a fronteira importa:

- **A pasta raiz é mantida à mão pelo Responsável** (`DATA_DIR_ID`). Nela ficam o
  projeto Apps Script e os documentos modelo que ele mesmo cria. O sistema nunca
  cria template por código.
- **O sistema cria, dentro dela**, a planilha de registro e uma pasta por período
  (`2026.1`), com a planilha daquele período e os Docs de proposta dos alunos.

`Semesters.FolderId` é a única origem de destino para arquivo gerado: o
`ProposalService` o recebe pronto e falha explicitamente se faltar, em vez de
gravar em qualquer lugar.

## Funcionalidades

| Funcionalidade | Documentação |
| --- | --- |
| Login | [features/login.md](features/login.md) |
| Setup | [features/setup.md](features/setup.md) |
| Visão do Aluno | [features/dashboard-student.md](features/dashboard-student.md) |
| Visão do Orientador | [features/dashboard-advisor.md](features/dashboard-advisor.md) |
| Visão do Responsável | [features/dashboard-incharge.md](features/dashboard-incharge.md) |
| Visão do Externo | [features/dashboard-external.md](features/dashboard-external.md) |
| Formação da Banca | [features/committee.md](features/committee.md) |
| Defesa, Ata e Assinaturas | [features/defense.md](features/defense.md) |
| Log de Atividades | [features/event-log.md](features/event-log.md) |
| Notificações | [features/notifications.md](features/notifications.md) |

A tabela acima descreve **o que** cada funcionalidade faz. **Por onde** cada
uma passa — a sequência de chamadas entre View, `main.js`, serviços e
planilha, uma por ação — está em [diagrams/](diagrams/), um Mermaid por
funcionalidade.

## Identidade visual

Logos em [assets/](../assets/):

| Logo | Uso |
| --- | --- |
| `logo1` | Maior — cabeçalhos e modais. Ícone + sigla (FEEC) + nome por extenso |
| `logo2` | Médio — ícone + sigla |
| `logo3` | Menor — só o ícone |
| `logo4` | Médio — ícone + nome da aplicação (TCC-WebApp) |

- Paleta azul com apoio de amarelo.
- Texto em preto vivo ou branco, para contraste máximo.
- CSS global em `ui_styles.html` — nada de estilo espalhado por view sem motivo.

Estrutura da página:

```text
Banner   FEEC → TCC-WebApp (esq.) | descrição da visão (centro) | perfil (dir.)
Body     <div id="view">…</div>, substituível pela visão correta
Rodapé   informações secundárias comuns, quando houver
```
