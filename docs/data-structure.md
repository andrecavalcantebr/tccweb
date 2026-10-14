# TCC Web App - Estrutura de Dados

A persistência de dados do TCC Web App ocorre exclusivamente no Google Sheets, dividida em duas planilhas conceituais: a **Planilha de Registro Mestre** e as **Planilhas de Período Letivo**.

Os nomes de colunas são em inglês no banco de dados e acessados via constantes `DB_COLS_*` definidas em `utils.js`. A interface com o usuário usa os termos em português.

## 1. Planilha de Registro Mestre (`TCC_WebApp_Registry`)

Mantém o apontamento para as turmas ativas e o histórico. Criada durante o Setup de Sistema.

**Aba: `Semesters`** — constante `DB_SHEETS.SEMESTERS`

| Coluna (`DB_COLS_SEMESTER.*`) | Valor na planilha | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `SEMESTER` → `Semester` | PK | Texto | Ex: `"2026.2"` |
| `FOLDER_ID` → `FolderId` | | Texto | ID da pasta própria do período letivo (subpasta da pasta do sistema — ver "Organização no Drive" abaixo) |
| `ENROLLMENT_CODE` → `EnrollmentCode` | | Texto | Código que o aluno digita no primeiro acesso para se matricular no período (ver "Aba: `Students`") |
| `SHEET_ID` → `SheetId` | | Texto | ID da Planilha do período letivo |
| `INCHARGE_EMAIL` → `InchargeEmail` | | E-mail | E-mail do professor Responsável |
| `STATUS` → `Status` | | Enum | `Ativo` \| `Inativo` |
| `START_DATE` → `StartDate` | | Timestamp | ISO 8601 |
| `END_DATE` → `EndDate` | | Timestamp | ISO 8601 |
| `CLASSES_START` → `ClassesStart` | | Texto `yyyy-MM-dd` | Início das aulas (calendário acadêmico) |
| `CLASSES_END` → `ClassesEnd` | | Texto `yyyy-MM-dd` | Fim das aulas |

`StartDate`/`EndDate` dizem quando o período foi **criado e encerrado no
sistema**; `ClassesStart`/`ClassesEnd`, quando as aulas começam e terminam. Quase
nunca coincidem — o período é preparado antes e encerrado depois —, e o
consolidado traz as quatro. As datas de aula são gravadas como **texto** (com o
`'` na frente, como o nome do período), ao contrário das datas de formulário da
seção 3: a planilha de registro não tem o fuso alinhado ao do script, e a linha
do período passa pelo `CacheService` em JSON, onde uma data viraria um instante
UTC e voltaria um dia antes em Manaus. Podem ficar vazias na criação e ser
preenchidas depois na guia Período Letivo (`cmdUpdateSemesterDates`).

### Organização no Drive

A pasta raiz do projeto (Script Property `DATA_DIR_ID`, informada no Setup
Inicial) é mantida manualmente pelo Responsável: nela ficam os templates e o
próprio projeto do Apps Script. O sistema acrescenta ali a planilha de
registro e **uma subpasta por período letivo**, criada por
`ServiceSetup.startSemester` e nomeada com o próprio período:

```plaintext
TCC-WebApp-Files/                  pasta raiz do projeto (DATA_DIR_ID)
├── TCC-Webapp                     projeto do Apps Script
├── projeto-modelo                 template da proposta
├── ata-modelo                     template da Ata (Fase 4)
├── folha-aprovacao-modelo         template da Folha de Aprovação (Fase 4)
├── TCC_WebApp_Registry            planilha de registro (aba Semesters)
├── 2026.1/                        pasta do período
│   ├── 2026.1                     planilha do período (mesmo nome da pasta)
│   └── Proposta TCC - <aluno>     um Google Doc por aluno
└── 2026.2/
    └── ...
```

**Aba: `Teachers`** — constante `DB_SHEETS.TEACHERS` (Professores)

> **Por que fica no registro, e não na planilha do período**: o professor é
> cadastrado **uma vez** e atravessa os períodos seguintes, ao contrário do
> aluno, que se matricula período a período. Guardar a lista por período
> obrigaria a redigitar o corpo docente inteiro a cada semestre — exatamente a
> tarefa que o Google Classroom deveria ter poupado e nunca poupou (a turma
> sempre foi montada à mão; ver `roadmap.md`).

| Coluna (`DB_COLS_TEACHER.*`) | Valor na planilha | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `EMAIL` → `Email` | PK | E-mail | Identifica a pessoa; é o que casa com `Proposals.AdvisorEmail` |
| `NAME` → `Name` | | Texto | Nome oficial, o que sai nos documentos |
| `TITULACAO` → `Titulacao` | | Texto | Dr., Dra., MSc. — exigido pela Folha de Aprovação |
| `INSTITUICAO` → `Instituicao` | | Texto | UFAM ou a instituição do convidado externo |
| `PHONE` → `Phone` | | Texto | Contato |
| `IS_EXTERNAL` → `IsExternal` | | Booleano | Quem o Google não identifica — o único caso que recebe senha |
| `PASSWORD_HASH` → `PasswordHash` | | Texto | SHA-256 salgado, só para externos |
| `PASSWORD_SALT` → `PasswordSalt` | | Texto | UUID por pessoa |
| `INVITE_TOKEN` → `InviteToken` | | Texto | Convite pendente: token de uso único do link `?page=teacher_signup`. Apagado quando a pessoa completa o cadastro |
| `INVITE_SENT_AT` → `InviteSentAt` | | Timestamp | Envio do último convite; o link vale `TEACHER_INVITE_TTL_DAYS` (14) dias a partir daqui |
| `IS_ACTIVE` → `IsActive` | | Booleano | Desativado some das listas, mas a linha **nunca é apagada** |
| `CREATED_AT` → `CreatedAt` | | Timestamp | ISO 8601 |

**Só o Responsável cria linhas aqui.** Não há auto-cadastro de professor: se
ele pudesse conceder `ORIENTADOR`, seria a escalação de privilégio recusada em
10/Ago — o aluno indicaria um cúmplice, que passaria a poder aprovar a proposta
dele. Cadastrar um professor **é** conceder o papel, então é ato do Responsável.
O professor só edita a **própria** linha, já existente: ao completar o convite
(nome, titulação, instituição, telefone) e depois em "Meus Dados". O e-mail e
os campos de controle nunca são editáveis por ele.

Desativar não apaga: o professor pode estar nomeado numa banca de um período
anterior, e uma linha faltando deixaria esse registro apontando para ninguém.

Sobre a senha: ela existe **só** para quem o Google não consegue identificar
(membro externo de banca hoje; supervisor de estágio no v3). Contas
`ufam.edu.br` são autenticadas pelo próprio Google, e guardar senha para elas
seria trocar uma autenticação forte por uma mais fraca, feita em casa. O Apps
Script não oferece KDF (bcrypt/scrypt/PBKDF2), então o hash é um SHA-256
salgado, rápido — o que o mantém honesto é a senha **nunca ser escolhida por
uma pessoa**: ela é gerada com ~60 bits de entropia, e não há dicionário a
rodar contra isso. O sal por pessoa impede que uma tabela vazada seja atacada
de uma vez só.

**Aba: `Active_Sessions`** — constante `DB_SHEETS.ACTIVE_SESSIONS` (Cache de Login)

> **Por que fica no registro, e não na planilha do período**: mais de um período
> pode estar ativo ao mesmo tempo (ver "Períodos simultâneos" abaixo), e é a
> sessão que diz em qual deles a pessoa está. Procurar essa linha dentro da
> planilha de um período seria circular — e procurar em todas custaria uma
> abertura de planilha por período ativo. A sessão também é, por natureza,
> sobre a pessoa, não sobre o período.

| Coluna (`DB_COLS_SESSION.*`) | Valor na planilha | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `SESSION_ID` → `SessionId` | PK | Texto | Chave de identidade do usuário — ver "Identidade de Sessão" abaixo |
| `EMAIL` → `Email` | | E-mail | E-mail efetivo do usuário (atributo de exibição, não é mais a chave de busca) |
| `NAME` → `Name` | | Texto | Nome fornecido pelo usuário no login |
| `ROLE` → `Role` | | Enum | `Aluno` \| `Orientador` \| `Responsável` |
| `SEMESTER` → `Semester` | | Texto | Período letivo que a pessoa está vendo agora (trocável pelo seletor do cabeçalho) |
| `LAST_ACTIVITY` → `LastActivity` | | Timestamp | Controle de timeout (5 min) |

### Identidade de Sessão

`Session.getActiveUser().getEmail()` só resolve para contas do mesmo
Workspace do script (`ufam.edu.br`); para qualquer outra conta Google (ex.:
Gmail pessoal, usada para testar Aluno/Orientador) ele retorna `''` — e isso
vale pra **toda execução do servidor**, não só no login. Usar o e-mail como
chave de busca de `Active_Sessions` (abordagem original) quebrava qualquer
ação pós-login pra essas contas, porque cada `google.script.run` roda numa
execução nova que não tem como recuperar o e-mail digitado no formulário de
login.

A chave `SessionId` passou a ser preenchida com:

```js
Session.getActiveUser().getEmail() || Session.getTemporaryActiveUserKey()
```

`Session.getTemporaryActiveUserKey()` é entregue automaticamente pelo Apps
Script em toda execução, é estável por usuário+script (mesmo sem domínio) e
não exige nenhum plumbing cliente↔servidor (cookie, `localStorage`,
parâmetro extra etc.). `Email`/`Name`/`Role` continuam sendo atributos
normais da linha, resolvidos a partir do e-mail efetivo
(`Session.getActiveUser().getEmail()` ou o digitado no login) — só
deixaram de ser a chave de busca. Ver `ServiceAuth.js` (`_getIdentityKey_`,
`getCurrentProfile`/`getCurrentRole`/`getValidCurrentSession`) e
`features/login.md`.

> **Implementado na fatia B (20/Ago/2026)**: o e-mail digitado deixou de ser
> aceito sozinho. Quando o Google identifica a conta, o campo é somente leitura
> e nada mais é pedido; quando não identifica, o e-mail é uma alegação e só vale
> acompanhado da **senha** conferida contra `Teachers` (membro externo). A chave
> de identidade acima não mudou — `getTemporaryActiveUserKey()` continua no
> código e continua sendo a chave de sessão dos externos, que por definição não
> têm e-mail resolvido pelo Google.

### Períodos simultâneos

**Vários períodos podem estar `Ativo` ao mesmo tempo.** Não é acidente: o
período seguinte é preparado antes de o atual terminar, e um período pode se
estender além do início do próximo. Criar um período **não encerra** os outros —
encerrar é ato explícito (`cmdEndSemester`, que grava `Inativo` e `EndDate`).

Consequências:

- Uma pessoa pode participar de mais de um período ativo. Um professor com duas
  turmas; um aluno que desistiu num período e se matriculou no seguinte
  enquanto o primeiro ainda não foi encerrado. Quem tem papel de professor em
  algum período ganha um **seletor de período** no cabeçalho
  (`?page=switch_semester`).
- **Quem é apenas aluno não escolhe**: fica preso ao período mais recente em que
  está matriculado (`getSelectableSemesters`). Quem desistiu de um período e se
  matriculou no seguinte não tem mais nada a fazer no anterior — que será
  encerrado pelo Responsável, com o aluno marcado como não finalizado. O limite
  vale também no servidor, não só na tela: `switchSemester` recusa um período
  fora dessa lista, porque a URL da troca é adivinhável.
- "Mais recente" é o maior `StartDate` (gravado na criação do período), com o
  nome do período como critério de desempate.
- **Os papéis são por período**: `INCHARGE` vem do `InchargeEmail` daquela
  linha, `ADVISOR`/`STUDENT` do roster daquela turma. A mesma pessoa pode ser
  Responsável num período e Orientador em outro, e trocar de período recalcula
  o papel (`ServiceAuth._rolesInSemester`).
- Cada período tem sua própria planilha, então o aluno em dois períodos tem uma
  proposta independente em cada um — sem colisão.
- `Semester` continua sendo a chave primária do registro: criar um período com
  nome já existente é recusado, porque duas linhas com o mesmo nome tornariam
  toda busca ambígua.

## 2. Planilha do Período Letivo (`<Semester>`)

Armazena as transações acadêmicas de uma turma. Uma por período letivo.

`Semesters.FolderId` aponta para a subpasta do período, e é ela que
`ServiceProposal._createProposalDoc` usa como destino da cópia do template.
Antes, `FolderId` recebia a própria pasta raiz e os documentos dos alunos se
acumulavam junto dos templates e das planilhas. Rodar o setup do mesmo período
de novo reaproveita a pasta existente em vez de criar uma duplicata.

O nome do período é normalizado (`trim`) antes de ser usado: ele nomeia a
pasta **e** é a chave primária da linha em `Semesters` (onde é gravado com o
prefixo `'`, para o Sheets não interpretar `2026.1` como número).

**Aba: `Students`** — constante `DB_SHEETS.STUDENTS` (Alunos matriculados)

| Coluna (`DB_COLS_STUDENT.*`) | Valor na planilha | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `STUDENT_ID` → `StudentId` | PK | Texto | Matrícula UFAM |
| `NAME` → `Name` | | Texto | Nome oficial, o que sai nos documentos |
| `EMAIL` → `Email` | | E-mail | Identidade no sistema |
| `PHONE` → `Phone` | | Texto | Contato |
| `ENROLLED_AT` → `EnrolledAt` | | Timestamp | Data da matrícula no período |

O aluno se cadastra sozinho, digitando o **código do período**
(`Semesters.EnrollmentCode`) no primeiro acesso — é o único gesto preservado do
Google Classroom, e o que evita o Responsável digitar 40 linhas por período. O
código concede `ALUNO` e nada mais.

A **matrícula é a chave**, então recadastrar a mesma pessoa atualiza a linha em
vez de duplicá-la. Cadastrar uma matrícula que já pertence a **outro e-mail** é
recusado: ou é erro de digitação, ou é um aluno reivindicando o registro de
outro, e os dois terminam com duas pessoas disputando uma linha.

Ter a matrícula aqui é o que elimina o campo de texto livre que o aluno
redigitava **a cada proposta** (`Proposals.StudentId`).

**Aba: `Proposals`** — constante `DB_SHEETS.PROPOSALS`

| Coluna (`DB_COLS_PROPOSAL.*`) | Valor na planilha | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `PROPOSAL_ID` → `ProposalId` | PK | UUID | Chave da proposta |
| `STUDENT_ID` → `StudentId` | | Texto | Matrícula UFAM do aluno |
| `STUDENT_EMAIL` → `StudentEmail` | | E-mail | E-mail do aluno |
| `STUDENT_PHONE` → `StudentPhone` | | Texto | Contato do aluno |
| `ADVISOR_EMAIL` → `AdvisorEmail` | FK | E-mail | E-mail do orientador |
| `ADVISOR_PHONE` → `AdvisorPhone` | | Texto | Contato do orientador |
| `TITLE` → `Title` | | Texto | Título do projeto (metadado de listagem — gravado no Doc só na criação, não ressincroniza se editado só lá) |
| `DOC_ID` → `DocId` | | Texto | ID do Google Doc da proposta (Resumo/Objetivos/Metodologia/Referências vivem lá — ver seção "Template da Proposta" abaixo) |
| `DEFENSE_PREDICTION` → `DefensePrediction` | | Data | Data prevista para a defesa |
| `STATUS` → `Status` | | Enum | `TccStatus.*` — **o único status do ciclo de vida do TCC**, ver "Status Único" abaixo |
| `ITERATIONS` → `Iterations` | | Numérico | Contagem de retornos para ajustes |
| `WORK_FILE_ID` → `WorkFileId` | | Drive ID | O TCC em PDF, enviado pelo aluno para concluir o Desenvolvimento. Gravado na pasta do período e **pertencente ao app**, que é o que permite ao sistema compartilhá-lo com a banca por conta própria |
| `WORK_UPLOADED_AT` → `WorkUploadedAt` | | Timestamp | Data do envio |
| `CREATED_AT` → `CreatedAt` | | Timestamp | Criação |
| `UPDATED_AT` → `UpdatedAt` | | Timestamp | Última edição |

### Template da Proposta (Google Docs)

O conteúdo rico da proposta (Resumo, Objetivos, Metodologia, Referências —
inclusive tabelas, o que editores de texto rico embutidos não suportam bem)
vive num Google Doc por aluno, duplicado a partir de um template configurado
pelo Responsável no Setup Inicial do sistema (Script Property
`PROPOSAL_TEMPLATE_DOC_ID`).

O template é criado manualmente (não gerado por código) e deve conter:

- Os logos da UFAM e do TCC-WebApp já posicionados
- Os marcadores `{{TÍTULO}}`, `{{NOME_ALUNO}}` e `{{MATRÍCULA}}`, substituídos
  na cópia gerada para cada aluno (`ServiceProposal._createProposalDoc`).
  As grafias **com e sem acento** são aceitas (`{{TITULO}}`/`{{TÍTULO}}`,
  `{{MATRICULA}}`/`{{MATRÍCULA}}`), porque o template é escrito à mão em
  português e um marcador que não casa fica no documento em silêncio, sem
  erro. A substituição alcança corpo, cabeçalho e rodapé, e o que sobrar é
  registrado num aviso no log (`_warnAboutLeftoverPlaceholders_`).

- As seções Resumo, Objetivos, Metodologia e Referências como texto fixo,
  preenchidas pelo aluno diretamente no Doc

> O nome do aluno gravado no documento vem da **tabela `Students`**
> (`getPersonName_`), não do nome digitado na tela de login — este é apenas um
> nome de exibição, texto livre. A mesma regra vale para o presidente da banca
> (que vem de `Teachers`) e para todo dado que vá parar em documento oficial.
>
> A garantia mudou de natureza com a saída do Classroom: antes o nome vinha do
> perfil Google, agora vem do que o aluno declarou na matrícula e o Responsável
> confere na tabela mestra. O erro se denuncia cedo, porque o aluno vê o próprio
> nome no Doc da proposta que ele mesmo abre.

Ao salvar o primeiro rascunho, o sistema duplica o template para a pasta do
período letivo, compartilha o Doc com o aluno (edição) e o orientador
(comentário — revisão nativa do Docs, complementar ao log de atividades da
aba `Events`), e grava o ID resultante em `DocId`.

O acesso do aluno acompanha o status: ao **submeter** ele é rebaixado a
comentarista (`_setStudentDocAccess`), e ao ter a proposta **devolvida** volta
a editor. Aprovação e homologação mantêm o rebaixamento — a partir daí a
proposta é somente leitura.

> **Quem é o dono do arquivo**: o Web App roda com
> `executeAs: USER_DEPLOYING`, então todo Doc criado pertence à conta que
> publicou a implantação, e não ao aluno. Essa conta edita qualquer proposta do
> período independentemente do compartilhamento — proprietário não é rebaixável.
> É o que faz o fluxo parecer "sempre editável" quando ele é testado inteiro por
> uma conta só.

### Templates da Ata e da Folha de Aprovação (Google Docs)

Mesma convenção do template da proposta: documentos criados à mão pelo
Responsável, informados em `?page=setup` e guardados em `ATA_TEMPLATE_DOC_ID` e
`APPROVAL_SHEET_TEMPLATE_DOC_ID`. O sistema duplica, substitui e exporta em PDF.

Marcadores aceitos nos dois (as variantes com acento existem porque o template é
escrito à mão em português e um marcador que não casa fica visível no documento
sem erro nenhum):

| Marcador | Conteúdo |
| --- | --- |
| `{{ALUNO}}` | Nome do aluno, vindo da tabela `Students` |
| `{{MATRICULA}}` / `{{MATRÍCULA}}` | Matrícula |
| `{{TITULO}}` / `{{TÍTULO}}` | Título final, vindo de `Committees.FinalTitle` |
| `{{DATA_DEFESA}}` | Data da defesa (`dd/MM/yyyy`) |
| `{{HORA_DEFESA}}` | Hora da defesa (`HH:mm`) |
| `{{MODO}}` | Presencial, Remoto ou Híbrido |
| `{{PARECER}}` | Aprovado / Aprovado com Restrições / Reprovado |
| `{{MEDIA}}` / `{{MÉDIA}}` | Média final calculada |
| `{{OBSERVACOES}}` / `{{OBSERVAÇÕES}}` | Observações da banca |
| `{{DE_ACORDO_ALUNO}}` | Data e hora do de acordo do aluno |
| `{{CHAVE_VALIDACAO}}` / `{{CHAVE_VALIDAÇÃO}}` | Chave de conferência |

A via **Ficha de apoio à defesa** reutiliza o template da Ata. Preenche
os dados do aluno e da banca, substitui notas, média, parecer e observações por
espaços sublinhados e esvazia assinaturas, datas de assinatura, de acordo e
chave de validação. Acrescenta um aviso de via de apoio no início. Textos fixos
do template são preservados.

**A lista de membros vem de uma linha-modelo de tabela.** A banca tem de 3 a 5
pessoas, então o template traz **uma** linha com os marcadores abaixo; ela é
copiada por membro e depois removida. Fixar cinco linhas deixaria linhas vazias
nas bancas de três.

| Marcador da linha | Conteúdo |
| --- | --- |
| `{{MEMBRO_NOME}}` | Nome |
| `{{MEMBRO_TITULACAO}}` | Titulação |
| `{{MEMBRO_INSTITUICAO}}` | Instituição |
| `{{MEMBRO_NOTA}}` | Nota — **vazio na Folha de Aprovação**, que atesta aprovação e não desempenho |
| `{{MEMBRO_ASSINATURA}}` | Carimbo de auditoria: "assinado digitalmente — " e o prefixo do HMAC |
| `{{MEMBRO_DATA}}` | Data e hora da assinatura |

Não há linha em branco para assinatura manuscrita: o documento nasce completo.
Quem receber confere pela chave, em `?page=verify&key=…`.

### Status Único (`TccStatus`)

Existe **um único status por aluno**, guardado em `Proposals.Status`, e ele
avança por todas as fases do fluxo. As abas `Committees` e `Defenses`
guardam apenas os dados das suas fases — **não têm coluna `Status` própria**.
`Semesters.Status` (`Ativo`/`Inativo`) é outra coisa: descreve o período
letivo, não o aluno.

A tabela abaixo é a definição em `utils.js` (`TccStatus` + `TCC_STATUS_META`);
a fase alimenta a barra de fluxo icônica (`ui_comp_flow_steps.html`) e o badge
alimenta a cor do status nos painéis. O servidor entrega `phaseIndex` e
`badgeClass` já resolvidos em cada payload de dashboard, de modo que nenhuma
view refaz esse mapeamento.

| Constante (`TccStatus.*`) | Valor na planilha | Fase |
| :--- | :--- | :--- |
| `NO_PROPOSAL` | Sem Proposta | 1 — Proposta |
| `PROPOSAL_DRAFT` | Proposta Em Elaboração | 1 — Proposta |
| `PROPOSAL_SUBMITTED` | Proposta Submetida | 1 — Proposta |
| `PROPOSAL_RETURNED` | Proposta Retornada Para Ajustes | 1 — Proposta |
| `PROPOSAL_APPROVED` | Proposta Aprovada | 1 — Proposta |
| `IN_DEVELOPMENT` | Em Desenvolvimento | 2 — Desenvolvimento |
| `TCC_CONCLUDED` | TCC Concluído | 3 — Banca (é o fim do Desenvolvimento, mas a ação seguinte é formar a banca) |
| `COMMITTEE_SUBMITTED` | Banca Submetida | 3 — Banca |
| `COMMITTEE_HOMOLOGATED` | Banca Homologada | 3 — Banca |
| `MINUTES_CREATED` | Ata Gerada | 4 — Defesa |
| `MINUTES_IN_SIGNATURES` | Ata Em Assinaturas | 4 — Defesa |
| `MINUTES_SIGNED` | Ata Assinada | 4 — Defesa |
| `DEFENSE_HOMOLOGATED` | Defesa Homologada | 5 — Encerramento |
| `FINAL_WORK_SUBMITTED` | TCC Final Submetido | 5 — Encerramento |
| `FINISHED` | TCC Finalizado | 5 — Encerramento |
| `FINISHED_BY_CREDIT` | TCC Finalizado por Aproveitamento | terminal (fluxo alternativo) |
| `NOT_FINISHED` | Não Finalizado | terminal (fluxo alternativo) |

Quem pode fazer o quê em cada status fica em `ServiceTccState.js`
(`TccStateFactory`), consultado tanto pelos serviços de comando
(`ServiceProposal.js`, `ServiceCommittee.js`) quanto pelos payloads dos
painéis (`ServiceDashboard.js`), para que permissão exibida e permissão
aplicada nunca divirjam.

**Aba: `Committees`** — constante `DB_SHEETS.COMMITTEES` (Bancas)

| Coluna (`DB_COLS_COMMITTEE.*`) | Valor na planilha | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `COMMITTEE_ID` → `CommitteeId` | PK | UUID | Chave da banca |
| `PROPOSAL_ID` → `ProposalId` | FK | UUID | Proposta associada (uma banca por proposta) |
| `FINAL_TITLE` → `FinalTitle` | | Texto | Título final do TCC |
| `DEFENSE_DATETIME` → `DefenseDatetime` | | Timestamp | Data e hora da defesa — ver "Datas" abaixo |
| `DEFENSE_MODE` → `DefenseMode` | | Enum | `DefenseMode.*`: `Presencial` \| `Remoto` \| `Híbrido` |
| `MEMBERS_COUNT` → `MembersCount` | | Numérico | 3 a 5 (`COMMITTEE_MIN_MEMBERS`/`COMMITTEE_MAX_MEMBERS`) |
| `MEMBERS_DATA` → `MembersData` | | JSON Text | `[{"nome":"X","titulo":"Dr.","inst":"UFAM","email":"z@ufam.edu.br","telefone":"...","isPresidente":true}]` |
| `CREATED_AT` → `CreatedAt` | | Timestamp | Criação |
| `UPDATED_AT` → `UpdatedAt` | | Timestamp | Última edição |

**Aba: `Defenses`** — constante `DB_SHEETS.DEFENSES` (Atas de Defesa)

| Coluna (`DB_COLS_DEFENSE.*`) | Valor na planilha | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `DEFENSE_ID` → `DefenseId` | PK | UUID | Chave da ata |
| `COMMITTEE_ID` → `CommitteeId` | FK | UUID | Banca associada |
| `PROPOSAL_ID` → `ProposalId` | FK | UUID | **Só na linha do aproveitamento**, que não tem banca — sem ela a nota não diria de quem é. As demais chegam à proposta pela banca |
| `MEMBERS_GRADES` → `MembersGrades` | | JSON Text | `[{"email":"...","nota":X,"assinadoEm":"ISO"}]` — nota, assinatura e data da assinatura são do mesmo membro e moram juntas |
| `BANK_OBSERVATIONS` → `BankObservations` | | Texto longo | Parecer descritivo da banca |
| `FINAL_GRADE` → `FinalGrade` | | Numérico | Média calculada |
| `ADVISOR_SIGNED_AT` → `AdvisorSignedAt` | | Timestamp | O Orientador fecha o lançamento assinando (specs 4.2); é o que abre a ata para os demais |
| `STUDENT_AGREEMENT` → `StudentAgreement` | | Booleano | Ciência do aluno |
| `STUDENT_AGREEMENT_AT` → `StudentAgreementAt` | | Timestamp | Data e hora do "de acordo" |
| `SIGNATURE_TOKENS` → `SignatureTokens` | | JSON Text | `[{"email":"...","token":"...","enviadoEm":"ISO","usadoEm":"ISO"}]` — um token de uso único por membro, enviado no link de assinatura. Separado de `MembersGrades` de propósito: é credencial, não registro acadêmico |
| `VALIDATION_KEY` → `ValidationKey` | | Texto | Chave de validação impressa nos dois PDFs (specs, "Funcionalidades gerais") |
| `MINUTES_PDF_ID` → `MinutesPdfId` | | Drive ID | Ata da Defesa em PDF |
| `APPROVAL_SHEET_PDF_ID` → `ApprovalSheetPdfId` | | Drive ID | Folha de Aprovação em PDF |
| `APPROVAL_STATUS` → `ApprovalStatus` | | Enum | `VerdictStatus.*` (veredito da banca, não é status de ciclo de vida) |
| `FINAL_WORK_FILE_ID` → `FinalWorkFileId` | | Drive ID | Versão final do TCC (Fase 5). **Não** é o mesmo campo que `Proposals.WorkFileId`: esta é a que vai ao RIU, com a Folha de Aprovação inserida, e sobrescrever apagaria a versão que a banca julgou |
| `RIU_RECEIPT_URL` → `RiuReceiptUrl` | | URL | Comprovante de depósito no RIU |
| `RIU_SUBMITTED_AT` → `RiuSubmittedAt` | | Timestamp | Quando o comprovante chegou — a "entrega final" do consolidado. Muda só quando o link muda |

Colunas acrescentadas depois que as planilhas já existiam (`ProposalId`,
`RiuSubmittedAt` aqui; `ClassesStart`/`ClassesEnd` em `Semesters`) entram no
cabeçalho na primeira gravação que precisa delas (`ensureColumns_`, em
`DaoSheets.js`): o `SheetDao` descarta em silêncio o campo sem coluna.

### Assinaturas da ata

Membros internos entram pelo login institucional de sempre. O **membro externo**
(convidado de outra instituição) entra com a **credencial própria** criada no
cadastro dele em `Teachers` (fatia B), e recebe por e-mail um **link com token
de uso único** — `SignatureTokens` guarda um por membro — que o leva direto à
ata certa.

O papel do token mudou com a inversão da ordem do rollout: ele era a *única*
prova de identidade do externo, o que obrigaria a abrir o deployment inteiro
para acesso anônimo. Com a credencial, o token continua útil como atalho (uma
ação, uma vez, sem procurar nada) sem carregar sozinho o peso da autenticação —
e nenhum deployment anônimo precisa existir. Ver `roadmap.md`.

O specs também previa status por membro ("Ata Assinada Membro 1", "Membro 2").
Isso **não** foi seguido: a banca tem de 3 a 5 membros, então seriam status em
quantidade variável, e a barra de fluxo viraria uma lista de assinaturas — o
mesmo motivo que barrou um 6º passo para `TCC Concluído`. O status fica em
`Ata Em Assinaturas` e o progresso ("2 de 4 assinaram", com quem falta nomeado)
sai do JSON.

**Aba: `Events`** — constante `DB_SHEETS.EVENTS` (Log de Atividades)

Registro append-only do andamento de cada TCC: o que o sistema anotou (uma
transição de status) e o que as pessoas escreveram. Substituiu a coluna
`Proposals.Notes`, um array JSON que tinha três tetos — 50 mil caracteres por
célula; escrita por ler-alterar-regravar, que perde uma mensagem quando duas
ações acontecem juntas; e, por ser coluna de `Proposals`, nenhum lugar para
registrar algo da Banca ou da Defesa.

| Coluna (`DB_COLS_EVENT.*`) | Valor na planilha | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `EVENT_ID` → `EventId` | PK | UUID | Chave da entrada |
| `PROPOSAL_ID` → `ProposalId` | FK | UUID | TCC a que a entrada pertence |
| `PHASE` → `Phase` | | Numérico | Fase (`TccPhase.*`) em que a entrada foi registrada |
| `TYPE` → `Type` | | Enum | `EventType.*` — `Sistema` (transição) ou `Comentário` (pessoa) |
| `ROLE` → `Role` | | Enum | Papel de quem agiu |
| `EMAIL` → `Email` | | E-mail | **Quem** agiu — é o que responde "quem homologou" quando o Responsável muda no meio do período |
| `TO_ROLE` → `ToRole` | | Enum | Destinatário, ou vazio quando não há ninguém esperando |
| `MESSAGE` → `Message` | | Texto | Descrição do evento ou texto do comentário |
| `TIMESTAMP` → `Timestamp` | | Timestamp | ISO 8601 |

O destinatário não é digitado. Numa ação ele vem da transição, que é a única
que o conhece; num comentário avulso é derivado do status, pela tabela
`TCC_STATUS_RESPONSIBLE` (`utils.js`): a mensagem vai para quem o fluxo está
esperando, e fica sem destinatário quando quem escreve já é o responsável da
vez — nesse caso é uma nota pública na linha do tempo.

`ToRole` é também o que dispara a **notificação por e-mail**: entrada com
destinatário avisa quem precisa agir; entrada sem destinatário não avisa
ninguém. Ver `features/notifications.md`.

| Ação | Direção |
| :--- | :--- |
| Aluno submete/reenvia a proposta | Aluno → Orientador |
| Orientador devolve para ajustes | Orientador → Aluno |
| Orientador aprova a proposta | Orientador → Responsável |
| Responsável homologa a proposta | Responsável → Aluno |
| Aluno conclui o TCC | Aluno → Orientador |
| Orientador submete/corrige a banca | Orientador → Responsável |
| Responsável homologa a banca | Responsável → Orientador |

Escrever no log **nunca derruba a ação**: `EventLogService._append` captura o
erro e registra no console. Perder uma transição de status porque o log falhou
seria pior do que uma linha faltando nele — o log é o registro do processo, não
parte dele. Pelo mesmo motivo nada aqui é editado ou apagado: um log alterável
não serve para auditoria, que é o valor principal.

## 3. Datas

Datas informadas pelo usuário (`Proposals.DefensePrediction`,
`Committees.DefenseDatetime`) são gravadas como **valores de data reais** do
Sheets, não como texto: assim a coluna continua ordenável, filtrável e
utilizável em cálculos na própria planilha (ex.: a regra de "pelo menos 15
dias antes do encerramento do período" prevista em `specs.md`).

Os campos HTML, por outro lado, só trocam strings: `input[type=date]` usa
`YYYY-MM-DD` e `input[type=datetime-local]` usa `YYYY-MM-DDTHH:mm`. A
conversão nos dois sentidos fica centralizada em `utils.js`:

| Função | Uso |
| :--- | :--- |
| `parseDateInput(valor)` | String do formulário → `Date`, na gravação |
| `formatDateInput(valor)` | Valor da planilha → `YYYY-MM-DD`, na leitura |
| `formatDatetimeInput(valor)` | Valor da planilha → `YYYY-MM-DDTHH:mm`, na leitura |

Duas armadilhas que essas funções existem para evitar:

1. `new Date('2026-08-20')` é interpretado como **UTC** pela especificação do
   JavaScript, o que em `America/Manaus` (UTC−4) devolve o dia anterior. Por
   isso `parseDateInput` monta a data componente a componente.
2. Ler o valor de volta e fazer `String(data).substring(0, 10)` produz
   `"Thu Aug 20"`, que o `input[type=date]` rejeita em silêncio (campo em
   branco). A formatação correta usa `Utilities.formatDate` com o fuso do
   script.

Para que gravação e leitura concordem, `ServiceSetup.startSemester` alinha o
fuso da planilha do período letivo ao fuso do script
(`Session.getScriptTimeZone()`, `America/Manaus` em `appsscript.json`).

Carimbos internos de auditoria (`CreatedAt`, `UpdatedAt`, `LastActivity`,
`StartDate`, `EndDate`) continuam gravados como texto ISO 8601 — nunca são
editados por formulário, então não passam por essas conversões.
