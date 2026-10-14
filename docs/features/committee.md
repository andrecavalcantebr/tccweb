# TCC Web App - Funcionalidades - Formação da Banca

Fase 3 do fluxo do PFC. Começa quando o aluno clica em **Concluir TCC**
(status `TCC Concluído`) e termina com a homologação do Responsável
(status `Banca Homologada`), que abre a fase de Defesa.

## Fluxo

1. **Orientador monta a banca**: no Painel do Orientador, ao abrir o detalhe
   de um orientando em `TCC Concluído`, a barra de ações mostra **Formar
   Banca**. O painel inline pede título final, data/hora, modo da defesa e os
   membros.
2. **Submissão**: ao confirmar, o registro é gravado na aba `Committees` e o
   status único do aluno vai para `Banca Submetida`.
3. **Correções**: enquanto não homologada, o Orientador continua vendo o botão
   (agora **Editar Banca**) e pode reenviar; o status não muda. Conforme
   `specs.md`, não existe devolução da banca pelo Responsável — o ajuste é
   sempre iniciativa do Orientador.
4. **Homologação**: no Painel do Responsável, a linha do aluno mostra **Ver
   Banca**, que abre um painel inline com os dados e a lista de membros. O
   botão **Homologar Banca** leva o status para `Banca Homologada`.
5. **Convites**: homologar é também o momento em que os membros que o sistema
   ainda não conhece são cadastrados e convidados, com os dados que o Orientador
   digitou. Sem isso, a banca seria homologada com gente de fora do sistema, que
   na Defesa não teria como assinar a Ata. Na prática esta é a porta de entrada
   mais movimentada de professores — ver
   [rationale 4.5](../rationale.md#45-homologar-a-banca-convida-os-membros-que-faltam).

## Regras de negócio

- Uma banca por proposta (`ProposalId` é único na aba `Committees`).
- De 3 a 5 membros (`COMMITTEE_MIN_MEMBERS`/`COMMITTEE_MAX_MEMBERS` em
  `utils.js`).
- Exatamente um presidente, e ele **precisa ser o Orientador designado na
  proposta** — o formulário fixa a primeira linha com o **e-mail** do
  Orientador logado (não editável, não removível) e o servidor revalida
  comparando com `Proposals.AdvisorEmail`. O **nome** vem preenchido do
  cadastro, mas é editável: é texto que vai para a Ata e para a Folha de
  Aprovação, não a chave que o servidor confere — e travá-lo deixava sem saída
  quem estivesse cadastrado com um nome ruim.
- Nome e e-mail são obrigatórios em todos os membros; titulação, instituição
  e telefone são opcionais — mas é deles que a Ata e a Folha de Aprovação saem,
  e quem for convidado pelo sistema pode completá-los no próprio cadastro.
- A linha do presidente **nasce preenchida com o cadastro do Orientador**
  (`Teachers`), e não só com nome e e-mail: titulação, instituição e telefone
  já estavam gravados ali, e pedi-los de novo a cada banca era redigitar o que
  o sistema tem — com a redigitação divergente indo parar na Ata. A fonte única
  é o cadastro, editável em
  [Meus Dados](dashboard-advisor.md#meus-dados).
- E-mails são normalizados na gravação: a lista é comparada com `Teachers` para
  decidir quem pode assinar, e um endereço com maiúscula seria uma pessoa que o
  sistema não encontra.
- Título final e data/hora da defesa são obrigatórios; o modo precisa ser um
  valor de `DefenseMode`.
- Autorização: só o Orientador designado submete (`_loadProposal` recusa outro
  professor e recusa o Aluno); só o Responsável homologa. Ambas as checagens
  usam o registro do banco, nunca o dado enviado pelo cliente.

## Onde a banca aparece

| Papel | O que vê |
| --- | --- |
| Aluno | Resumo da banca em leitura (título final, data/hora, modo, membros) no card da fase |
| Orientador | Mesmo resumo no detalhe do orientando, mais o formulário de edição |
| Responsável | Painel inline "Ver Banca" a partir da tabela mestra, com a ação de homologar |

O resumo em leitura é o helper compartilhado `renderCommitteeSummary`
(`ui_scripts.html`), usado pelos três painéis.

## Implementação

| Arquivo | Papel |
| --- | --- |
| `ServiceCommittee.js` | `CommitteeService.submitCommittee`/`homologateCommittee`, validação dos membros, endpoints `cmdSubmitCommittee`/`cmdHomologateCommittee` |
| `ServiceTccState.js` | `ConcludedState`/`CommitteeSubmittedState`/`CommitteeHomologatedState` — permissões `canEditCommittee`/`canHomologateCommittee` |
| `ServiceDashboard.js` | `_buildCommitteePayload_` e a inclusão da banca nos três payloads |
| `ui_app_dashboard_advisor.html` | Formulário de composição da banca (membros dinâmicos) |
| `ui_app_dashboard_incharge.html` | Painel inline de visualização e homologação |
| `ui_app_dashboard_student.html` | Resumo em leitura na fase correspondente |

Ver `data-structure.md` (aba `Committees` e seção "Status Único") para o
modelo de dados.
