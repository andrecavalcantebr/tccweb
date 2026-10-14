# Homologar Banca — Cadeia de Chamadas

O momento em que a banca deixa de ser proposta do Orientador e vira
compromisso: quem o sistema ainda não conhece recebe convite aqui — é, na
prática, a porta de entrada **mais movimentada** de professores no sistema,
mais do que o cadastro avulso pelo painel.

Fontes: `src/ui_app_dashboard_incharge.html` (`homologateCommittee`),
`src/ServiceCommittee.js` (`cmdHomologateCommittee`,
`CommitteeService.homologateCommittee`), `src/ServicePeople.js`
(`PeopleService.inviteCommitteeMembers`, `inviteTeacher`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Cmd as cmdHomologateCommittee
    participant Comm as CommitteeService
    participant People as PeopleService
    participant Sheet as Planilha (Proposals / Teachers)
    participant Mail as MailApp

    Responsável->>Nav: "Ver Banca" → confere composição → "Homologar Banca"
    Nav->>Cmd: google.script.run.cmdHomologateCommittee(proposalId)
    Cmd->>Comm: homologateCommittee(role, email, proposalId)
    Comm->>Comm: _loadProposal(proposalId)
    Comm->>Comm: state.canHomologateCommittee(Responsável)?
    Comm->>Sheet: proposalDao.update(id, {Status:"Banca Homologada"})

    Comm->>Comm: getByProposal(proposalId) — lê MembersData
    Comm->>People: inviteCommitteeMembers(members)
    loop cada membro da banca
        People->>People: getTeacher(email) — já ativo, ou já convidado pendente?
        alt já conhecido (ativo OU convite pendente)
            People->>People: pula — não reconvida
        else desconhecido
            People->>People: inviteTeacher(email, nome, {titulacao, instituicao, phone})
            People->>Sheet: teacherDao.upsert(email, {IsActive:false, InviteToken, ...})
            People->>Mail: _mailInvitation(record, password?, token)
            Mail-->>People: e-mail enviado
        end
    end
    People-->>Comm: {invited:[...], failed:[...]}

    Comm->>Comm: logTransition(..., "Banca homologada... convite a N membro(s)", destinatário: Orientador)
    Comm-->>Cmd: {success:true, invited, failed, msg}
    Cmd->>Cmd: _dashboardPayloadForRole_(Responsável)
    Cmd-->>Nav: {success:true, dashboard, failed}
    Nav-->>Responsável: painel — abre a fase de Defesa; avisa quem falhou convidar, se houver
```

## Notas

- Nunca lança por causa de um convite que falhou — perder a homologação por
  isso seria pior do que precisar reenviar manualmente depois. O que falhou
  volta em `failed` para o painel poder dizer.
- Os dados do formulário da banca (nome, titulação, instituição, telefone)
  seguem direto para o convite: o convidado recebe um cadastro já preenchido,
  e o link só confirma e completa — ver
  [07-professor-completa-cadastro.md](07-professor-completa-cadastro.md).
