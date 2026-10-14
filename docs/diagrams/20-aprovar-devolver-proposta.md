# Orientador Aprova ou Devolve a Proposta — Cadeia de Chamadas

As duas decisões do Orientador sobre uma proposta `Submetida`. Devolver conta
uma iteração (para medir o vai e vem) e reabre o Doc para edição; aprovar
encaminha ao Responsável para homologação.

Fontes: `src/ui_app_dashboard_advisor.html` (`approveProposal`,
`returnProposal`), `src/ServiceProposal.js` (`cmdApproveProposal`,
`cmdReturnProposal`, `ProposalService.approveProposal`, `returnProposal`).

```mermaid
sequenceDiagram
    actor Orientador
    participant Nav as Navegador (ui_app_dashboard_advisor)
    participant Cmd as ServiceProposal.js
    participant Prop as ProposalService
    participant Sheet as Planilha (Proposals)

    rect rgb(235,250,235)
    note over Orientador,Sheet: Aprovar
    Orientador->>Nav: Abre o detalhe da proposta → "Aprovar"
    Nav->>Cmd: google.script.run.cmdApproveProposal(proposalId)
    Cmd->>Prop: approveProposal(role, email, proposalId)
    Prop->>Sheet: getProposal(proposalId)
    Prop->>Prop: state.canApprove(Orientador)? + _assertOwnership
    Prop->>Sheet: dao.update(id, {Status: "Proposta Aprovada"})
    Prop->>Prop: logTransition(..., destinatário: Responsável)
    Prop-->>Cmd: {success:true}
    Cmd->>Cmd: _dashboardPayloadForRole_(Orientador)
    Cmd-->>Nav: {success:true, dashboard}
    end

    rect rgb(255,240,235)
    note over Orientador,Sheet: Devolver para ajustes
    Orientador->>Nav: Abre o detalhe → "Retornar para Ajustes" + justificativa
    Nav->>Cmd: google.script.run.cmdReturnProposal(proposalId, message)
    Cmd->>Prop: returnProposal(role, email, proposalId, message)
    Prop->>Sheet: getProposal(proposalId)
    Prop->>Prop: state.canReturn(Orientador)? + _assertOwnership
    Prop->>Prop: Iterations += 1
    Prop->>Sheet: dao.update(id, {Status: "Proposta Retornada Para Ajustes", Iterations})
    Prop->>Prop: _setStudentDocAccess(docId, email, canEdit:true) — Doc reabre
    Prop->>Prop: logTransition(..., message, destinatário: Aluno)
    Prop-->>Cmd: {success:true}
    Cmd->>Cmd: _dashboardPayloadForRole_(Orientador)
    Cmd-->>Nav: {success:true, dashboard}
    end
    Nav-->>Orientador: painel atualizado
```

## Notas

- O ciclo submeter → devolver → ajustar → ressubmeter pode se repetir várias
  vezes; `Iterations` conta cada devolução, e é essa contagem que documenta o
  vai e vem no registro de atividades (não há limite de rodadas no código).
