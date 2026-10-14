# Homologar Defesa — Cadeia de Chamadas

Fecha a Fase 4. A fase não se fecha sozinha quando a última assinatura chega —
o Responsável vê a Ata completa e homologa, ato administrativo que abre a
revisão e a entrega final para o aluno.

Fontes: `src/ui_app_dashboard_incharge.html` (`homologateDefense`),
`src/ServiceDefense.js` (`cmdHomologateDefense`,
`DefenseService.homologateDefense`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Cmd as cmdHomologateDefense
    participant Def as DefenseService
    participant Sheet as Planilha (Proposals)

    Responsável->>Nav: Linha do aluno (Ata Assinada) → "Homologar Defesa" → confirma
    Nav->>Cmd: google.script.run.cmdHomologateDefense(proposalId)
    Cmd->>Def: homologateDefense(role, email, proposalId)
    Def->>Def: _context(proposalId)
    Def->>Def: state.canHomologateDefense(Responsável)?
    alt Ata ainda não está completamente assinada
        Def-->>Cmd: throw Error("Apenas o Responsável homologa uma defesa com a Ata já assinada.")
    else pode homologar
        Def->>Sheet: proposalDao.update(id, {Status:"Defesa Homologada"})
        Def->>Def: logTransition(..., destinatário: Aluno)
        Def-->>Cmd: {success:true}
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Responsável)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Responsável: painel atualizado — abre a fase de Encerramento
```

## Notas

- A partir daqui o aluno já pode entregar a versão final e o comprovante do
  RIU — ver [31-entrega-final-riu-pdf.md](31-entrega-final-riu-pdf.md).
