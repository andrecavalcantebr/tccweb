# TCC Web App — Visão do Responsável

O Responsável de um período letivo é o `InchargeEmail` daquele período. Ele é
**também Orientador** — criar o período o cadastra como professor — e o seletor
do cabeçalho troca entre as duas visões.

## Painel de gestão do período

Depois do cabeçalho padrão:

- **Métricas do período**: alunos matriculados, aguardando homologação (proposta
  e banca), sem proposta, e TCCs finalizados.
- **Tabela mestra**: uma linha **por aluno matriculado** — não por proposta, para
  que quem ainda não propôs também apareça. Traz aluno, orientador, título,
  status e as ações possíveis naquele status.
  - Ao lado do status, um indicador rápido com o **último comentário** em
    tooltip, mostrando em que ponto está o vai e vem entre Aluno e Orientador.
  - **⚠ não cadastrado** marca o orientador que o aluno indicou e que ainda não
    existe no sistema. É a única pendência da tabela que só o Responsável
    resolve, e ela trava a submissão do aluno.
  - **Detalhes** abre o andamento completo: a linha do tempo inteira (ver
    [event-log.md](event-log.md)) e o link do Doc da proposta.

## Menu "Ações do período"

As ações de gestão ficam num menu no cabeçalho da tabela mestra, e não numa
fileira de botões: **Exportar consolidado**, **Professores**, **Período
Letivo**, **Configuração do Sistema** (só para a conta que publicou o app) e,
separado e em vermelho, **Encerrar Período**. É um menu e não um `<select>`: o
select serve para escolher valor — a opção fica marcada, repetir a mesma não
dispara nada, e as setas do teclado disparam sem querer.

## Consolidado do período

**Exportar consolidado** baixa um CSV (`consolidado-<período>-<data>.csv`) com
uma linha por aluno matriculado e os totais no fim. Gerado por
`getSemesterReport` (`ServiceReport.js`); as regras são funções puras, testadas
em `tests/semester-report.test.cjs`.

**Formato**: separador `;`, BOM UTF-8 e CRLF, para o Excel em português abrir
com dois cliques. Texto sempre entre aspas, com a aspa interna dobrada — `;` ou
quebra de linha num título não quebram a tabela. Números e datas sem aspas,
notas com vírgula decimal, datas `dd/mm/aaaa`. Texto que comece com `=`, `+`,
`-` ou `@` ganha um `'` na frente, para o Excel não o executar como fórmula.

**Cabeçalho**: período, início e fim das aulas, criação e encerramento no
sistema, data e hora da geração.

| Coluna | Regra |
| --- | --- |
| Matrícula, Nome | `Students` |
| Fase, Status | A fase do status e o status exato |
| Entregou projeto? | **Sim** se a proposta foi submetida ao menos uma vez (devolvida conta) |
| Título do Projeto | Só quando entregou — o título de um rascunho levaria a ler o resto errado |
| Título Final | `Committees.FinalTitle`, o que sai na Ata |
| Banca formada? | Vazio sem proposta entregue; **Não** até a homologação da banca; **Sim** a partir dela |
| Data da banca, Tipo da data | **Prevista** (`DefensePrediction`) até a homologação; **Real** (`DefenseDatetime`) depois; vazio sem proposta entregue |
| Resultado da banca | O parecer |
| Nota membro 1–5 | Na ordem da banca, congelada quando a Ata é gerada |
| Média final | A gravada na Ata; no aproveitamento, a nota única |
| Entrega final (RIU) | `RiuSubmittedAt`; em registros anteriores à coluna, o evento "TCC Final Submetido" |
| Finalizou?, Motivo | Ver abaixo |

Notas, média e parecer só saem **depois que o Orientador assina a Ata** — antes
disso são rascunho.

**Desfecho**: `TCC Finalizado` → Sim / Aprovado; `Finalizado por Aproveitamento`
→ Sim / Aproveitamento; `Não Finalizado` → Não / Desistência; parecer
**Reprovado** com a defesa já homologada (ou encerrado como Não Finalizado) →
Não / Reprovado por nota; em andamento → vazio. A reprovação vem do parecer e
não do status porque o fluxo ainda não tem estado terminal de reprovação.

Nos dois desfechos alternativos o status apagou o caminho; "entregou projeto" e
"banca formada" vêm então do log: Aluno → Orientador é a submissão, Responsável
→ Orientador é a homologação da banca.

**Totais**: matriculados; em andamento por fase; encerrados; entregaram projeto;
bancas formadas; encerrados por motivo; média, menor e maior média dos
**aprovados pela banca** (o aproveitamento fica de fora: não é nota de banca).

## Professores

Opção **Professores** do menu de ações. Só a entrada de
professores: a de alunos (código de matrícula) mora na guia **Período
Letivo**, abaixo — não é assunto de professor, é assunto de período, e o
Orientador precisa dela sem passar por aqui.

Dois gestos, e a diferença é quem digita:

- **Convidar por e-mail** — o Responsável informa só o endereço. A pessoa recebe
  um link e preenche nome, titulação, instituição e telefone: dados que saem na
  Ata e na Folha de Aprovação, e que o dono deles sabe melhor. O cadastro fica
  **pendente** até ela completar, e a tabela marca isso.
- **Cadastrar direto** — o Responsável digita tudo e o professor já nasce ativo.
  Útil para quem ele conhece de cor, e para não travar uma indicação urgente
  atrás de um e-mail que a pessoa pode demorar a ler.

O convite é **individual**: vale para um e-mail só, uma vez só, por 14 dias, e em
conta institucional só funciona na própria conta Google. Não é um link de turma —
ver [rationale 2.3](../rationale.md#23-auto-cadastro-de-professor-é-escalada-de-privilégio).

**Reenviar convite** gera um token novo e mata o anterior. **Nova senha**
substitui a credencial de quem é externo. Nenhum dos dois reexibe a senha
antiga: só o hash fica guardado.

### O tipo de acesso é deduzido, não escolhido

Não há caixa "é externo". O sistema decide pelo **domínio do e-mail**, e a tela
diz o que decidiu enquanto o Responsável digita:

| E-mail | Como entra | Pode orientar? |
| --- | --- | --- |
| Do domínio da instituição | Conta Google, sem senha | Sim |
| De fora | Conta Google qualquer **mais** senha gerada | Não — compõe banca e assina Ata |

Ver [rationale 3.2](../rationale.md#32-isexternal-é-deduzido-do-domínio-não-perguntado).

**Desativar** tira o professor das listas sem apagar a linha: ele pode estar
nomeado numa banca de período anterior.

Cadastrar um professor **é** conceder o papel de Orientador — por isso não há
auto-cadastro, e por isso toda indicação de orientador passa por aqui. Ter e-mail
institucional não prova ser professor: alunos também têm.

## Homologações

- **Homologar Proposta** — direto na linha da tabela, quando o Orientador já
  aprovou. O aluno passa a `Em Desenvolvimento`; não existe estado de repouso
  `Proposta Homologada`.
- **Homologar Banca** — a linha mostra `Ver Banca`, que abre título final, data e
  hora, modo e a lista de membros. Homologar move para `Banca Homologada`, abre a
  fase de Defesa e **dispara os convites** aos membros que o sistema ainda não
  conhece.

Toda transição notifica por e-mail quem passa a ter a bola — ver
[notifications.md](notifications.md).

## Período Letivo

Opção **Período Letivo** do menu de ações. Três coisas, porque são gestão do
período — não de professor nem de aluno:

### Código de matrícula do período corrente

- **Código de matrícula**, em destaque, com "Gerar novo" — é o que o aluno
  digita no primeiro acesso, e o que vai impresso no Plano de Ensino. Gerar
  outro invalida o anterior na hora; o uso é justamente esse, quando o código
  vaza para fora da turma. Só o Responsável regenera: soltar esse botão para
  qualquer Orientador deixaria qualquer um invalidar o código de todo mundo.
- **Link de matrícula**, pronto para copiar. Leva ao mesmo cadastro com o
  código já preenchido. Muda junto quando o código é regenerado.
- O mesmo código e link aparecem, **em leitura**, na guia **Convite aos
  Alunos** da visão do Orientador — ver
  [dashboard-advisor.md](dashboard-advisor.md#convite-aos-alunos). É dali que
  cada Orientador repassa aos próprios alunos, sem depender do Responsável.

### Datas do período corrente

Início e fim das aulas, editáveis a qualquer momento — o período costuma ser
criado antes de o calendário sair. Abaixo, em leitura, quando foi criado e
encerrado no sistema. Ver [data-structure.md](../data-structure.md).

### Novo Período Letivo / Encerrar Período

- **Novo Período Letivo** — o período (ex.: `2027.1`), as datas de aula
  (opcionais), o **e-mail** e o **nome** do Responsável. Deixando o próprio e-mail ele continua responsável; informando
  outro, **passa a responsabilidade**. Não há mais nada a transferir: o papel é
  decidido comparando o e-mail com `Semesters.InchargeEmail`. Quem for indicado é
  cadastrado como professor automaticamente. O código de matrícula é sorteado na
  criação.
- **Encerrar Período** — marca `Inativo` e grava `EndDate`. O período some do
  seletor e ninguém mais entra nele; os dados ficam onde estão.

**Períodos coexistem** — criar um não encerra os outros. Dois ativos ao mesmo
tempo é o caso normal (o seguinte é preparado antes de o atual acabar), e três
acontece em períodos curtos ou especiais.

Quem pode criar ou encerrar: a conta que publicou o app, ou o Responsável de um
período em andamento — é essa segunda porta que faz a passagem de bola funcionar
sem depender do dono.

## Configuração do Sistema

Opção do menu de ações visível **apenas para a conta que publicou o app**, levando a
`?page=setup`: pasta do Drive e documentos modelo. Ver [setup.md](setup.md).

## Defesa e encerramento

- **Homologar Defesa** — na linha do aluno, depois do de acordo. Fecha a fase e
  abre a revisão: `Defesa Homologada`.
- **Finalizar TCC** — depois de o aluno entregar o PDF final e o comprovante do
  RIU. O Responsável confere no "Detalhes", transfere a média para o e-campus à
  mão e finaliza: `TCC Finalizado`.
- **Encerrar sem banca** — no "Detalhes", disponível em qualquer status não
  terminal, com dois desfechos: `TCC Finalizado por Aproveitamento` (parecer +
  nota) e `Não Finalizado` (parecer). O parecer vai para o registro com o e-mail
  de quem encerrou.
- **Os dois PDFs** — Ata e Folha de Aprovação, no "Detalhes". O Responsável é
  quem reemite depois de o período encerrar: dali em diante ninguém mais entra
  nele.

Ver [defense.md](defense.md) para o mecanismo de assinatura e verificação.
