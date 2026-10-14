# TCC Web App — Rationale das Decisões

Este documento guarda **por que** o sistema é como é. Cada entrada registra uma
decisão e o que acontecia do outro jeito — normalmente porque o outro jeito foi
tentado e falhou em produção.

As demais páginas descrevem o sistema **como ele é hoje**; quando uma delas
parecer arbitrária, a explicação está aqui. O histórico completo, com datas e
diffs, está no `git log`.

---

## 1. Identidade e autenticação

### 1.1 Conta Google é obrigatória, mas não precisa ser institucional

**Decisão**: ninguém entra sem estar logado numa conta Google. Qualquer uma —
não precisa ser do domínio da instituição, nem ser o e-mail do cadastro.

**Por quê**: sem conta Google, `Session.getActiveUser().getEmail()` e
`Session.getTemporaryActiveUserKey()` devolvem os dois `''`. A linha de sessão é
indexada por essa chave e o `SheetDao` compara de forma frouxa, então `'' == ''`
casava: **o visitante anônimo seguinte herdava a sessão do anterior**. Um membro
externo que tivesse acabado de entrar entregava a própria sessão a quem abrisse
a URL depois dele.

A guarda é dupla de propósito — `webapp.access: ANYONE` no manifesto e
`_requireGoogleIdentity_()` no código. Configuração de implantação não é lugar de
decisão de autorização: o manifesto vale para implantações novas, e uma já
publicada conserva o que escolheram na interface quando nasceu.

### 1.2 Conta institucional não tem senha

**Decisão**: quem o Google resolve entra sem senha; só quem ele não resolve
recebe credencial própria.

**Por quê**: guardar senha para uma conta que o Google já autentica seria trocar
uma autenticação forte por outra mais fraca, mantida por nós, com recuperação e
superfície de vazamento próprias.

### 1.3 A sessão é indexada por chave de identidade, não pelo e-mail digitado

**Decisão**: `SessionId` é `getActiveUser().getEmail()` ou, quando este não
resolve, `getTemporaryActiveUserKey()`.

**Por quê**: o e-mail digitado não está disponível num F5 sem formulário, então
o "pular login por 5 min" não funcionava para contas fora do domínio. A chave
temporária existe em toda execução do servidor, inclusive num recarregamento
simples.

### 1.4 Senha gerada, nunca escolhida — e com fonte forte

**Decisão**: a senha do externo é gerada pelo sistema, com `Utilities.getUuid()`
(SecureRandom do Java) por trás, e amostragem por rejeição para não enviesar o
alfabeto.

**Por quê**: o Apps Script não oferece KDF (bcrypt/scrypt/PBKDF2), então o hash é
um SHA-256 salgado e rápido. Isso só é defensável porque não há dicionário a
rodar contra uma senha aleatória de ~58 bits. O argumento **depende** da fonte
ser forte: `Math.random()` estava ali antes e é um PRNG comum, cuja próxima
saída decorre das anteriores — fatal para o único fator de autenticação de
alguém.

### 1.5 Tentativas de senha são limitadas por conta Google, não por e-mail

**Decisão**: 8 tentativas erradas por conta logada, 15 minutos de espera.

**Por quê**: um contador por e-mail digitado deixaria qualquer um trancar um
membro externo real fora do sistema, só repetindo o endereço dele. Contar por
conta Google obriga o atacante a queimar contas, e só é possível porque a
guarda de identidade (1.1) garante que exista uma.

### 1.6 O timeout de sessão vale para escritas, não só para navegação

**Decisão**: entrada de página, comandos de escrita e resolução de contexto dos
painéis conferem o timeout existente de cinco minutos.

**Por quê**: enquanto o timeout guardava só a entrada de página, uma aba
esquecida aberta numa máquina compartilhada continuava aprovando proposta e
cadastrando professor horas depois. Perder um refresh de painel é incômodo;
perder uma transição para a mão de outra pessoa não é. A atualização de painel
também não pode renovar uma sessão que já expirou.

### 1.7 Cache de autorização com validade limitada e invalidação explícita

**Decisão**: reutilizar a validação entre requisições por até
`SESSION_TIMEOUT_MINUTES`, sem renovar o prazo a cada acerto de cache. A sessão
continua usando seu timeout de inatividade e a persistência periódica de
`LastActivity`. A chave vincula o registro à identidade fornecida pelo Google,
nunca ao e-mail digitado pelo cliente.

**Por quê**: validar novamente todos os períodos e cadastros em cada chamada
repetia leituras de planilhas mesmo quando nada havia mudado. A invalidação por
escritas nos cadastros evita manter permissões antigas após uma alteração pelo
sistema. Uma revisão global e uma geração por identidade impedem que requisições
anteriores republiquem validações já invalidadas; a ausência do cache leva à
consulta das fontes. Os detalhes estão em [arch.md](arch.md#cache-e-acesso-a-dados).

### 1.8 Cache do DAO restrito à execução e escrita por células alteradas

**Decisão**: compartilhar as leituras de cada aba na execução, devolver cópias e
invalidar após gravação, inclusive quando houver falha parcial. Agrupar apenas
células adjacentes que realmente mudaram; manter `flush()` nas gravações.

**Por quê**: o mesmo registro era relido pelo serviço, pela notificação e pelo
painel reconstruído. Guardar os dados entre requisições exigiria invalidação
adicional para todo o fluxo; limitar o cache à execução elimina repetições sem
introduzir essa defasagem. Reescrever a linha inteira poderia substituir
fórmulas por resultados ou reinterpretar chaves textuais como `2026.2`.

---

## 2. Autorização

### 2.1 Allowlist de colunas, não confiança no que o cliente manda

**Decisão**: `saveDraft` grava apenas as colunas que o papel pode escrever
(`_proposalEditableColumns_`).

**Por quê**: o código gravava o objeto vindo do navegador, e o `SheetDao` escreve
toda chave que reconheça. Um aluno com rascunho — onde `canEdit` é
legitimamente verdadeiro — chamava
`cmdSaveDraft({ProposalId:'…', Status:'TCC Finalizado'})` e pulava a aprovação do
Orientador e a homologação do Responsável numa requisição. A máquina de estados
existia; o caminho de escrita simplesmente não passava por ela.

### 2.2 Função global é endpoint público

**Decisão**: todo acessor de dados que não é para o cliente termina em `_`.

**Por quê**: no Apps Script **toda** função global é chamável por
`google.script.run`, e o sufixo underscore é a única coisa que o impede. Sem
ele, `getRegisteredTeachers()` entregava o corpo docente com telefone a qualquer
aluno logado, e `getSemesterStudents(sheetId)` entregava a turma com matrícula.
A regra já estava escrita no cabeçalho de `diagnostics.js`; faltava aplicá-la ao
código de produção.

**O `_` no início não conta.** A convenção de "privado" de outras linguagens
(`_helper`) não esconde nada no Apps Script, e até out/2026 havia 71 funções
assim, todas públicas. Entre elas, `_signatureSecret` devolvia a chave das
assinaturas, `_signMinutes` assinava uma ata em nome de qualquer membro,
`_renderTemplateToPdf` e `_storePdf` gravavam no Drive do dono, e
`forceReauth` revogava a autorização do script, derrubando o app. Bastava uma
conta Google qualquer e o console do navegador, sem cadastro nem sessão. Todas
passaram a terminar em `_` (`_signMinutes_`), a chave foi trocada, e
`forceReauth` — que precisa continuar pública para aparecer no menu Executar do
editor — passou a recusar quem não é o dono.

Uma regra que depende de lembrança falha. Por isso
`tests/public-surface.test.cjs` lista as funções públicas aprovadas e falha com
qualquer outra: tornar algo chamável pelo navegador passou a ser uma decisão
explícita, revisada no diff.

### 2.3 Auto-cadastro de professor é escalada de privilégio

**Decisão**: aluno se auto-cadastra pelo código do período; professor só existe
se o Responsável o criar.

**Por quê**: ter e-mail institucional **não prova ser professor** — alunos também
têm um. Um cadastro aberto deixaria o aluno se declarar professor, ser indicado
na própria proposta e aprová-la. Por isso o link de convite de professor é
individual, de uso único e (em conta institucional) só funciona na própria conta
Google, enquanto o do aluno pode ser espalhado.

### 2.4 Duas listas: quem entra e quem orienta

**Decisão**: `getTeacherEmails_()` (concede o papel no login) inclui externos;
`getAdvisorEmails_()` (aceita a submissão da proposta) não.

**Por quê**: são perguntas diferentes e uma lista só respondia errado às duas. O
externo precisa entrar para assinar a Ata — tirá-lo da primeira lista o deixaria
sem papel nenhum, e `_startSession` recusaria o login dele. Mas mantê-lo na
segunda permitia que o aluno digitasse o e-mail de um convidado no campo do
Orientador e passasse a ter como aprovador da própria proposta alguém que não
orienta na instituição.

### 2.5 O Responsável do período é cadastrado como professor ao criar o período

**Decisão**: `startSemester` chama `ensureTeacher(inchargeEmail)`.

**Por quê**: o Responsável **é** também Orientador, mas `_rolesInSemester` faz as
duas checagens de forma independente — uma bate com `InchargeEmail`, a outra
procura em `Teachers`. Exigir que ele já fosse professor cadastrado travaria o
bootstrap (ninguém cadastra professor antes de existir período), então o caminho
é o inverso: criar o período cadastra.

### 2.6 O setup do sistema é do dono do script

**Decisão**: `_isAppOwner_()` compara `getActiveUser()` com `getEffectiveUser()`.

**Por quê**: no teste de 07/Ago um aluno que entrou antes do Responsável criou um
período letivo — sem e-mail de Responsável — e, como criar um período desativava
o anterior, derrubou o período real. Antes disso não havia checagem nenhuma, sob
o argumento de que no bootstrap não há o que verificar. Há: o app roda como
`USER_DEPLOYING`, então o usuário efetivo é sempre a conta que publicou.

### 2.7 Setup do sistema e setup do período são separados

**Decisão**: o do sistema é só do dono; o do período aceita o dono **ou** o
Responsável de um período em andamento.

**Por quê**: o dono nem sempre é o Responsável, e o Responsável atual precisa
conseguir abrir o próximo período sem depender de quem publicou o app. Não é
duplicação: são dois atos com donos diferentes.

---

## 3. Pessoas

### 3.1 O Google Classroom saiu

**Decisão**: alunos e professores vivem em tabelas próprias (`Students`,
`Teachers`).

**Por quê**: três fatos fecharam a questão.

1. **O motivo original deixou de existir.** O Classroom entrou porque o ciclo de
   vida do TCC era um conjunto de atividades com prazos lá. Esse ciclo migrou
   inteiro para o app — barra de fases, máquina de estados, log de eventos. O que
   restou era um roster, e o escopo `classroom.announcements` estava pedido no
   manifesto sem ser chamado em lugar nenhum.
2. **A turma sempre foi montada à mão.** O sistema acadêmico oficial é o
   e-campus, e integrar com ele exigiria CTIC e PROEG — fora do escopo. Sem essa
   sincronização, o Classroom nunca manteve lista nenhuma: alguém já digitava, só
   que numa UI fora do sistema e ao custo de uma dependência de API.
3. **Ele não sabia representar metade das pessoas.** O membro externo de banca não
   está em roster nenhum, e o supervisor de estágio (v3) é externo por definição.

E a tabela **ganha** o que o roster não tinha: matrícula, instituição e
titulação — exatamente o que a Ata e a Folha de Aprovação exigem.

### 3.2 `IsExternal` é deduzido do domínio, não perguntado

**Decisão**: `_isInstitutionalEmail_()` compara o domínio do e-mail com o da conta
que publicou o app.

**Por quê**: era uma caixinha marcada à mão, e errá-la em qualquer direção
estragava o cadastro em silêncio. Esquecer de marcar num convidado de fora criava
uma conta que **jamais conseguiria entrar** — o Google não resolve o e-mail dele
e, sem a marca, nenhuma senha era gerada para conferir. Marcar num professor da
casa lhe dava uma senha inútil e tirava dele o direito de orientar.

O domínio sai da conta do dono, e não de uma constante, porque o deploy roda como
`USER_DEPLOYING`: o conjunto de endereços que o Google resolve é exatamente o
domínio dessa conta.

### 3.3 Ninguém é apagado, só desativado

**Decisão**: `IsActive` em vez de remoção de linha.

**Por quê**: a pessoa pode estar nomeada numa banca de período passado, e uma
linha ausente deixaria aquele registro apontando para ninguém.

### 3.4 Nome oficial vem da tabela, nunca do login

**Decisão**: `getPersonName_()` lê de `Teachers`/`Students`; o nome digitado no
login é só rótulo de exibição.

**Por quê**: o nome sai em documento oficial (Doc da proposta, Ata, Folha de
Aprovação), e o do login é texto livre que a própria pessoa escreve.

---

## 4. Fluxo e estado

### 4.1 Um status por aluno, não um por entidade

**Decisão**: `TccStatus` único, guardado em `Proposals.Status`, atravessando
todas as fases.

**Por quê**: existiam três enums (`ProposalStatus`, `CommitteeStatus`,
`DefenseStatus`) para o que sempre foi um estado só — o próprio comentário do
código já chamava um deles de "status mestre". Três enums significam três
verdades que podem divergir, e a barra de fases teria de reconciliá-las.

### 4.2 Submeter exige rascunho salvo

**Decisão**: `submitProposal` recusa quando não existe proposta gravada.

**Por quê**: é o rascunho que cria o Google Doc a partir do template. Sem ele,
clicar direto em Submeter criava o Doc vazio e o mandava ao Orientador — e, como
submeter rebaixa o aluno a comentarista, ele nem podia mais escrever no
documento até a proposta ser devolvida.

### 4.3 Concluir o Desenvolvimento exige o PDF

**Decisão**: `concludeTcc` só aceita com o trabalho anexado.

**Por quê**: era a única transição do fluxo inteiro sem artefato por trás — a
fase terminava numa alegação, e o Orientador ia montar banca para um trabalho que
o sistema nunca tinha visto. O arquivo é gravado pelo app, e portanto pertence a
ele: é isso que permite ao sistema compartilhá-lo com a banca sozinho, coisa que
um link colado do Drive do aluno não permitiria.

### 4.4 O aluno é o último a assinar, mas quem fecha a fase é o Responsável

**Decisão**: o "de acordo" do aluno leva a `Ata Assinada`; a homologação do
Responsável leva a `Defesa Homologada` e abre a revisão.

**Por quê**: a assinatura do aluno é consentimento, não conferência — e vale ao
mesmo tempo para a Ata e para a Folha de Aprovação, porque é o mesmo
consentimento e pedi-lo duas vezes não acrescentaria nada. Fechar a fase é ato
administrativo, e esse é do Responsável.

### 4.5 Homologar a banca convida os membros que faltam

**Decisão**: `homologateCommittee` cria a linha e dispara o convite para cada
membro ainda desconhecido.

**Por quê**: os membros viviam só como JSON em `MembersData`, então a banca era
homologada com gente que o sistema não conhecia — e, na Defesa, essas pessoas não
teriam como assinar a Ata. Na prática esta é a porta de entrada mais movimentada
de professores no sistema.

### 4.6 Notas sem identificação do avaliador na visão do aluno

O aluno vê as notas individuais com rótulos “Membro 1”, “Membro 2” etc.
A identificação é removida no servidor, pois trocar apenas o texto da tela
manteria a associação entre nome e nota na resposta recebida pelo navegador.
As notas são ordenadas por valor para que a posição na lista não reproduza
a ordem nominal da banca; os dados de assinatura também não acompanham
essas linhas. Essa apresentação não altera os registros nem as demais visões.

---

## 5. Persistência

### 5.1 A planilha é o banco, com mapeamento dinâmico de cabeçalho

**Decisão**: `SheetDao` lê a primeira linha e mapeia nome de coluna → índice.

**Por quê**: faixas fixas (`A1:H1`) fazem o código e a planilha divergirem em
silêncio quando alguém insere uma coluna.

### 5.2 Sessões moram no registro, não na planilha do período

**Decisão**: `Active_Sessions` fica na planilha de registro.

**Por quê**: mais de um período pode estar ativo, e é a sessão que diz em qual o
usuário está — procurá-la dentro de uma planilha de período seria circular.

### 5.3 Só a aba de sessões se auto-recria

**Decisão**: `_ensureSessionsTab_` recria a aba faltante; nada parecido existe
para `Proposals` ou `Events`.

**Por quê**: linha de sessão é estado descartável, e uma aba vazia custa no
máximo um login novo. Recriar `Proposals` esconderia perda de dados.

O mesmo raciocínio, um nível abaixo: `_ensureTeacherColumns_` **acrescenta**
colunas faltantes ao cabeçalho, porque acrescentar cabeçalho é não destrutivo —
sem isso, um registro criado por versão anterior gravaria o convite pela metade,
sem erro nenhum.

### 5.4 Chave primária vazia é recusada

**Decisão**: `_isUsableKey_` barra `''`/`null` em `getById`, `insert`, `update` e
`upsert`.

**Por quê**: a comparação é frouxa de propósito (uma matrícula numérica gravada
como texto precisa achar a própria linha), e é isso que transforma a chave vazia
em curinga — foi o mecanismo do vazamento de sessão descrito em 1.1.

### 5.5 Período sem planilha é diagnóstico, não conserto

**Decisão**: `semesterUnavailableMessage` explica que falta o `SheetId` e manda
restaurar da lixeira; não oferece criar período novo.

**Por quê**: um `SheetId` ausente pode significar que a planilha do período foi
para a lixeira com o registro de todos os alunos dentro. Oferecer "criar um
período novo" maquiaria perda de dados.

### 5.6 Célula com apóstrofo não pode ser reescrita em bloco

**Decisão**: `update` escreve célula a célula, não a linha inteira.

**Por quê**: valores gravados como texto com apóstrofo à frente (`'2026.2`) voltam
do `getValues` sem ele, e reescrever a linha deixaria a planilha reinterpretá-los
como número.

### 5.7 Texto digitado nunca vira fórmula

**Decisão**: o `SheetDao` grava com `'` à frente todo texto que começa por `=`,
`+`, `-` ou `@` (`_cellSafe_`, em `insert` e `update`).

**Por quê**: `setValues` e `appendRow` interpretam essas strings como fórmula, e
quase tudo que se grava foi digitado por alguém. Um título
`=JOIN(";";Students!A2:E99)` trazia os dados da turma inteira para o painel do
aluno, porque a fórmula roda na planilha do período, que tem todas as abas. E
um telefone `+55 92 …` virava `#ERROR!`. O apóstrofo não volta na leitura, então
nada do lado de quem lê precisou mudar. É a mesma regra que o CSV do
consolidado já aplicava (`_csvText_`).

---

## 6. Documentos

### 6.1 O conteúdo rico da proposta vive num Google Doc

**Decisão**: Resumo, Objetivos, Metodologia e Referências ficam num Doc por
aluno, duplicado de um template; a planilha guarda só o link.

**Por quê**: esses campos precisam de formatação rica de verdade — inclusive
tabelas —, que editor JS leve não sustenta. De quebra vêm os comentários nativos
do Docs para a revisão do Orientador.

### 6.2 Os templates são criados à mão, nunca por código

**Decisão**: o Responsável cria os documentos modelo no Drive e informa o ID.

**Por quê**: são peças de identidade visual e exigência de banca — quem as define
é a instituição, não o programa.

### 6.3 Os modelos da Fase 4 não entram em `isSystemSetup()`

**Decisão**: exigidos só na hora de gerar o documento (`_requireTemplate_`).

**Por quê**: `isSystemSetup()` decide se o app mostra a tela de configuração **no
lugar de todo o resto**. Exigir ali o modelo da Ata travaria uma instalação que
só quer rodar as Fases 1 a 3 — inclusive instalações já em funcionamento.

### 6.4 Arquivo viaja como link, nunca como anexo

**Decisão**: as notificações mandam link.

**Por quê**: `MailApp` tem teto de 25 MB por mensagem e uma banca tem de 3 a 5
membros; anexar o trabalho o mandaria inteiro uma vez por pessoa.

---

## 7. Interface e navegação

### 7.1 O login é POST

**Decisão**: o formulário usa `doPost`, delegando ao mesmo roteador do `doGet`.

**Por quê**: com GET os dados digitados ficavam na barra de endereços e no
histórico, sobrevivendo à sessão — e agora haveria uma senha entre eles.
Critério geral: dado de usuário não trafega por GET; `?page=` continua GET porque
seleção de visão é o uso legítimo da query string.

### 7.2 Toda requisição reproduzível precisa de nonce ou de ordem correta

**Decisão**: o login consome um token de uso único; a troca de papel só é
aplicada **depois** da checagem de timeout.

**Por quê**: as duas são reproduzíveis pelo navegador. Sem o nonce, cada F5
renovava a sessão e o timeout nunca era alcançado. E `switchRole` grava
`LastActivity`: aplicado antes da checagem, ressuscitava sessão expirada sem
passar pela tela de login.

### 7.3 Redirecionamento vai na navegação, não no callback

**Decisão**: troca de papel e de período são rotas (`?page=switch_role`), não
comandos `google.script.run`.

**Por quê**: o app roda em iframe com
`allow-top-navigation-by-user-activation`, e a ativação transitória do Chrome
expira poucos segundos depois do clique. Redirecionar do callback de uma chamada
lenta era silenciosamente bloqueado — a página ficava parada com o cursor de
espera.

### 7.4 Diálogos são do app, não do navegador

**Decisão**: modal próprio no lugar de `confirm()`/`alert()`.

**Por quê**: dentro do iframe do Apps Script o navegador prefixa toda caixa
nativa com o host cru do iframe, o que parece golpe de phishing para o usuário.

### 7.5 O `include()` é global

**Decisão**: existe como função global, além da versão que `renderView` injeta.

**Por quê**: sem ela, `<?!= include('ui_styles') ?>` na página de erro lançava
"include is not defined", `renderError` caía no próprio catch e **toda** tela de
erro do app saía como um "Erro Crítico" cru, sem estilo.

### 7.6 O painel viaja dentro da página

**Decisão**: `initialPayload` embute os dados do painel no HTML, e o cliente
mantém o caminho `google.script.run` como alternativa.

**Por quê**: abrir o painel custava duas execuções do Apps Script em série, e cada
uma paga a partida do runtime de novo — metade do tempo medido entre o login e o
dado na tela. O caminho antigo continua sendo o do botão "Tentar novamente" e o
de toda ação.

### 7.7 Comando devolve o painel já atualizado

**Decisão**: cada `cmd*` retorna o payload recalculado na mesma execução.

**Por quê**: reler numa execução seguinte mostrava o estado **anterior** à ação —
uma escrita só é garantidamente visível para a execução que a fez. O Orientador
submetia a banca e a tela voltava como se nada tivesse acontecido.

### 7.8 Há um watchdog na carga do painel

**Decisão**: 20 segundos sem resposta mostram erro com botão de repetir.

**Por quê**: uma chamada `google.script.run` pode falhar sem acionar **nenhum** dos
dois handlers — o transporte cai e nada volta. Sem o watchdog o painel ficava em
"Carregando…" para sempre, sem como distinguir lento de morto.

### 7.9 `escHtml` não escapa aspa simples

**Decisão**: onde um valor entra em `onclick="f('…')"`, viaja o **índice**, nunca
o texto.

**Por quê**: `escHtml` escapa `&`, `<`, `>` e `"` — o suficiente para atributo com
aspas duplas, mas não para a string JS dentro dele. Um e-mail com apóstrofo
escaparia da string.

O mesmo vale para `<?= ?>` no sentido inverso: ele escapa apóstrofo como `&#39;`,
então um nome como "D'Ávila" interpolado numa string JS chega estragado — a fonte
confiável é o elemento HTML já renderizado.

### 7.10 `//` dentro de string só entre aspas duplas

**Decisão**: no JS das views, string que contenha `//` — URL, sobretudo — usa
aspas **duplas**.

**Por quê**: o que serve a página remove comentário de linha `//` do JS embutido,
e o removedor respeita aspas duplas e crase, mas **não** aspa simples. Escrita
assim:

```js
const url = 'https://drive.google.com/file/d/' + res.fileId + '/view';
```

o que chegava ao navegador era:

```js
const url = 'https:
```

Uma string aberta que nunca fecha. O `<script>` inteiro é descartado no parse, e
com ele todo o `ui_scripts.html`: sem `escHtml`, sem `beginBusy` e sem o watchdog
de 7.8 — que existe exatamente para a tela não ficar em "Carregando…" e morria
junto com o arquivo que o define. O painel do Responsável não executava uma linha
sequer, e o cabeçalho ficava no "Carregando..." estático do componente.

O que despistou: a mesma URL, dentro de `href="https://…"` num template literal,
passa intacta — está entre aspas duplas. Os logos em base64
(`AppAssets['logo1'] = "data:…"`, cheios de `//`) também, pelo mesmo motivo. Só a
aspa simples quebra, e só quando o `//` cai dentro dela.

Vale apenas para o JS **servido dentro do HTML**. Os `.js` de servidor
(`ServiceNotification.js` monta links de e-mail com aspa simples) não passam por
esse caminho.

Regra prática: procurar `//` dentro de string de aspa simples nos `ui_*.html`
antes de publicar. Sintoma típico é `Uncaught SyntaxError: Invalid or unexpected
token` apontando para o documento do frame `userHtmlFrame` — que, por ser
`about:blank`, herda a URL do pai e por isso aparece como
`userCodeAppPanel?…:<linha>`, número que não corresponde a arquivo nenhum seu.

### 7.11 Valor do servidor viaja em atributo, não dentro de string JS

**Decisão**: no `<script>` das views, nada de `'<?= valor ?>'`. O valor vai num
atributo (`data-app-url`, `data-student-name`) e o JS lê do DOM.

**Por quê**: o escape do scriptlet de impressão é **contextual**. Quando ele
conclui que está diante de um valor JS, devolve a string **já entre aspas** — e
dentro das aspas que o código tinha o resultado é:

```js
return ''https:\/\/script.google.com\/…\/exec'?page=enrollment&code=' + …
```

String vazia seguida do identificador `https`. O `<script>` inteiro é descartado,
e o painel do Responsável não executava uma linha.

O que torna isso traiçoeiro é que **o mesmo scriptlet acerta ou erra conforme a
posição no arquivo**: `enrollmentLinkFor` quebrou e `openSystemSetup`, 250 linhas
abaixo, saiu correto. O rastreador de contexto não entende template literal, e os
apóstrofos dentro deles — `onclick="abrir('${id}')"`, abundantes nestas views —
invertem a paridade. Ou seja: mexer em qualquer template literal pode quebrar uma
interpolação a centenas de linhas de distância.

Em atributo HTML o contexto é inequívoco e o escape é o correto. É a mesma
conclusão de 7.9 pelo outro lado: lá o problema era o apóstrofo de "D'Ávila"
escapando da string JS, aqui é o valor chegando com aspas a mais. Nos dois casos
a fonte confiável é o **elemento HTML já renderizado**.

`appUrl()` e `appSemester()` (ui_scripts.html) leem os atributos do cabeçalho.
Telas sem cabeçalho — `ui_app_sign_minutes.html` — carregam um `<div
id="serverData" hidden>` próprio.

Continua valendo `<?!= ?>` para JSON (`initialPayload`, `defenseJson`): ali não
há escape nenhum, o valor já sai de `JSON.stringify` e é um literal JS completo.

**Corolário, e ele já mordeu duas vezes**: um scriptlet de impressão **vazio**
não sobrevive nem dentro de comentário. O avaliador não sabe o que é comentário —
ele varre o arquivo inteiro atrás de marcadores — e compilar uma expressão vazia
faz o `evaluate()` lançar `Unexpected token ';'`. Se isso acontece num partial, o
`include` devolve `<!-- Erro do Include: … -->` e a tela perde o componente
inteiro em silêncio; se acontece na view, cai na página de "Erro de Renderização".

Ou seja: ao **documentar** esta regra, não se escreve o marcador. Escreve-se "o
scriptlet de impressão". Verificação antes de publicar:

```bash
grep -rn '<?= ?>' src/   # tem de sair vazio
```

---

## 8. Log e notificações

### 8.1 O log é aba própria, append-only

**Decisão**: a aba `Events`, uma linha por entrada, substituiu a coluna
`Proposals.Notes` (array JSON).

**Por quê**: a coluna tinha três tetos. Uma célula guarda 50 mil caracteres;
acrescentar exigia ler-modificar-gravar, então duas ações simultâneas perdiam uma
das mensagens; e, sendo coluna de `Proposals`, não tinha onde registrar nada sobre
Banca ou Defesa.

### 8.2 A notificação é enxertada no log

**Decisão**: `EventLogService` dispara o e-mail.

**Por quê**: ele já era o único lugar que sabia a fase e o **destinatário** de cada
transição. Notificar de dentro dele significa que nenhum serviço precisa lembrar
de avisar ninguém.

### 8.3 Log e e-mail nunca derrubam a transição

**Decisão**: os dois engolem exceção e escrevem no console.

**Por quê**: perder uma mudança de estado porque uma linha de log ou um e-mail
falhou seria muito pior do que a falta deles. O log é registro do processo, não
parte dele.

### 8.4 Uma ação de pessoa é um e-mail

**Decisão**: transição e comentário anexo produzem **uma** mensagem.

**Por quê**: são duas linhas na linha do tempo, mas um único gesto de uma pessoa
para a seguinte.
