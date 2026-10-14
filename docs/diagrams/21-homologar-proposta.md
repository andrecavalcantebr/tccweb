# Homologar Proposta — Cadeia de Chamadas

Ato do Responsável sobre uma proposta já `Aprovada` pelo Orientador. Não existe
um estado de repouso "Proposta Homologada" — homologar já move o aluno direto
para `Em Desenvolvimento`.

Fontes: `src/ui_app_dashboard_incharge.html` (`homologateProposal`),
`src/ServiceProposal.js` (`cmdHomologateProposal`,
`ProposalService.homologateProposal`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Cmd as cmdHomologateProposal
    participant Prop as ProposalService
    participant Sheet as Planilha (Proposals)

    Responsável->>Nav: Linha do aluno → "Homologar Proposta" → confirma
    Nav->>Cmd: google.script.run.cmdHomologateProposal(proposalId)
    Cmd->>Prop: homologateProposal(role, email, proposalId)
    Prop->>Sheet: getProposal(proposalId)
    Prop->>Prop: state.canHomologate(Responsável)?
    alt proposta ainda não está Aprovada
        Prop-->>Cmd: throw Error("Apenas o Responsável pode homologar uma proposta já aprovada")
    else pode homologar
        Prop->>Sheet: dao.update(id, {Status: "Em Desenvolvimento"})
        Prop->>Prop: logTransition(..., destinatário: Aluno)
        note right of Prop: notifica o Aluno — ver 35-notificacao-email.md
        Prop-->>Cmd: {success:true}
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Responsável)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Responsável: tabela mestra atualizada — status "Em Desenvolvimento"
```

## Notas

- Homologação é ato **global** do Responsável: ao contrário de aprovar (que
  exige ser o orientador *daquela* proposta), não há checagem de propriedade
  aqui — o papel Responsável já basta.
