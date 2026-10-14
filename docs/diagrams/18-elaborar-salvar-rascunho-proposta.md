# Elaborar e Salvar Rascunho da Proposta — Cadeia de Chamadas

O primeiro `saveDraft` de um aluno **cria** a proposta e o Google Doc a partir
do template — o conteúdo rico (Resumo/Objetivos/Metodologia/Referências) é
editado diretamente nesse Doc; o formulário do app cuida só dos campos
estruturados. Ver
[rationale 6.1](../rationale.md#61-o-conteúdo-rico-da-proposta-vive-num-google-doc).

Fontes: `src/ui_app_dashboard_student.html` (`saveDraft`),
`src/ServiceProposal.js` (`cmdSaveDraft`, `_executeProposalCommand_`,
`ProposalService.saveDraft`, `_createProposalDoc`, `_shareProposalDoc`).

```mermaid
sequenceDiagram
    actor Aluno
    participant Nav as Navegador (ui_app_dashboard_student)
    participant Cmd as cmdSaveDraft
    participant Auth as AuthService
    participant Prop as ProposalService
    participant Sheet as Planilha (Proposals)
    participant Drive as DriveApp / DocumentApp

    Aluno->>Nav: Preenche título, cronograma, e-mail do orientador... → Salvar Rascunho
    Nav->>Cmd: google.script.run.cmdSaveDraft(data)
    Cmd->>Auth: getContext() + assertActiveSession()
    Cmd->>Prop: new ProposalService(sheetId, folderId)
    Cmd->>Prop: saveDraft(role, email, name, data)

    Prop->>Prop: _sanitizeProposalInput_(data, role) — só colunas permitidas ao Aluno
    Prop->>Sheet: dao.getAll().find(mesmo e-mail) — já existe proposta?

    alt primeira vez (proposta nova)
        Prop->>Prop: id = Utilities.getUuid(); Status = Proposta Em Elaboração
        Prop->>Prop: getPersonName_(email, sheetId, name) — nome oficial da tabela
        Prop->>Drive: DriveApp.getFileById(templateId).makeCopy(...)
        Prop->>Drive: DocumentApp.openById(copy) — substitui {{TITULO}}, {{NOME_ALUNO}}, {{MATRICULA}}
        Drive-->>Prop: docId
        Prop->>Drive: file.addEditor(aluno), addCommenter(orientador)
    else rascunho já existe
        Prop->>Sheet: dao.getById(id) — carrega o registro
        Prop->>Prop: TccStateFactory.create(status).canEdit(Aluno)?
    end

    Prop->>Sheet: dao.upsert(id, patch)
    opt proposta nova
        Prop->>Prop: EventLogService.logTransition(id, "Proposta Em Elaboração", ...)
        note right of Prop: Só a CRIAÇÃO é logada — um rascunho é salvo<br/>muitas vezes, e o log registra marcos, não digitação
    end
    Prop-->>Cmd: {success:true, id}
    Cmd->>Cmd: _dashboardPayloadForRole_(Aluno) — painel recalculado na mesma execução
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Aluno: painel atualizado — link do Doc disponível
```

## Notas

- `_createProposalDoc` descarta a cópia órfã se qualquer substituição falhar
  no meio do caminho — sem isso, uma falha parcial deixaria um Doc solto na
  pasta do período, sem proposta nenhuma apontando para ele.
- Ver [19-submeter-proposta.md](19-submeter-proposta.md): `submitProposal`
  chama `saveDraft` internamente quando o formulário chega junto do envio.
