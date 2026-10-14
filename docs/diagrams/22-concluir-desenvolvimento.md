# Concluir Desenvolvimento — Cadeia de Chamadas

O aluno encerra a Fase 2 enviando o trabalho (PDF), que a partir daqui
pertence ao app — é o que permite ao sistema compartilhá-lo com a banca sozinho
quando ela for homologada, sem passo manual do aluno.

Fontes: `src/ui_app_dashboard_student.html` (`concludeTcc`),
`src/ServiceProposal.js` (`cmdConcludeTcc`, `ProposalService.concludeTcc`,
`_storeWorkFile`, `_shareWorkFile`).

```mermaid
sequenceDiagram
    actor Aluno
    participant Nav as Navegador (ui_app_dashboard_student)
    participant Cmd as cmdConcludeTcc
    participant Prop as ProposalService
    participant Sheet as Planilha (Proposals)
    participant Drive as DriveApp

    Aluno->>Nav: Anexa o PDF do trabalho → "Concluir TCC"
    Nav->>Nav: lê o arquivo, converte para base64
    Nav->>Cmd: google.script.run.cmdConcludeTcc(proposalId, {name, mimeType, bytes})
    Cmd->>Prop: concludeTcc(role, email, name, proposalId, file)
    Prop->>Sheet: getProposal(proposalId)
    Prop->>Prop: state.canConclude(Aluno)? + _assertOwnership
    Prop->>Drive: _storeWorkFile — grava o PDF na pasta do período
    Drive-->>Prop: workFileId
    note right of Prop: Gravado ANTES de mudar o status — se o upload falhar,<br/>o aluno continua em Desenvolvimento e tenta de novo
    Prop->>Sheet: dao.update(id, {WorkFileId, WorkUploadedAt, Status:"TCC Concluído"})
    Prop->>Drive: _shareWorkFile — addViewer(aluno), addViewer(orientador)
    Prop->>Prop: logTransition(..., destinatário: Orientador)
    Prop-->>Cmd: {success:true}
    Cmd->>Cmd: _dashboardPayloadForRole_(Aluno)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Aluno: painel — status "TCC Concluído", aguardando a banca
```

## Notas

- `_shareWorkFile` só compartilha com o **Aluno** e o **Orientador** — os
  únicos dois papéis cujo painel chega a mostrar o link do trabalho
  (`workFileLinkHtml`, em `ui_scripts.html`). Os membros da banca nunca
  recebem acesso a este arquivo bruto; o que eles veem depois é a Ata e a
  Folha de Aprovação em PDF, documentos próprios montados a partir de
  template — ver [30-emitir-pdf-ata-folha-aprovacao.md](30-emitir-pdf-ata-folha-aprovacao.md).
