# Submeter Proposta — Cadeia de Chamadas

Editar um campo e clicar em Submeter costumava descartar a edição em
silêncio — o aluno tinha de lembrar de salvar antes. Agora `submitProposal`
salva primeiro (implícito) e submete na mesma chamada: uma falha não deixa
nada meio-aplicado.

Fontes: `src/ui_app_dashboard_student.html` (`submitProposal`),
`src/ServiceProposal.js` (`cmdSubmitProposal`, `ProposalService.submitProposal`,
`_assertAdvisorIsRegistered`).

```mermaid
sequenceDiagram
    actor Aluno
    participant Nav as Navegador (ui_app_dashboard_student)
    participant Cmd as cmdSubmitProposal
    participant Auth as AuthService
    participant Prop as ProposalService
    participant Sheet as Planilha (Proposals)

    Aluno->>Nav: Clica "Submeter Proposta"
    Nav->>Cmd: google.script.run.cmdSubmitProposal(proposalId, data)
    Cmd->>Auth: getContext() + assertActiveSession()
    Cmd->>Prop: submitProposal(role, email, name, proposalId, data)

    alt proposalId ausente
        Prop-->>Cmd: throw Error("Salve o rascunho antes de submeter...")
    else proposalId existe
        opt formulário veio junto (data preenchido)
            Prop->>Prop: saveDraft(role, email, name, data) — salva antes de submeter
            note right of Prop: canEdit e ownership já são checados aqui,<br/>sobre o registro GRAVADO
        end
        Prop->>Sheet: getProposal(proposalId)
        Prop->>Prop: state.canSubmit(Aluno)?
        Prop->>Prop: _assertOwnership — é a proposta deste aluno mesmo?
        Prop->>Prop: _assertAdvisorIsRegistered(advisorEmail, studentEmail)
        alt orientador não é registrado como professor (ou é externo, ou é o próprio aluno)
            Prop-->>Cmd: throw Error(mensagem específica do caso)
        else orientador válido
            Prop->>Sheet: dao.update(id, {Status: "Proposta Submetida"})
            Prop->>Prop: _setStudentDocAccess(docId, email, canEdit:false) — Doc vira só-comentário
            Prop->>Prop: EventLogService.logTransition(..., destinatário: Orientador)
            note right of Prop: logTransition dispara e-mail ao Orientador —<br/>ver 35-notificacao-email.md
            Prop-->>Cmd: {success:true}
        end
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Aluno)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Aluno: painel — status "Proposta Submetida"
```

## Notas

- O gate do orientador registrado é em **SUBMIT**, não em `saveDraft`: o
  rascunho é o que cria o Doc, e o aluno precisa dele para escrever enquanto o
  orientador ainda está sendo cadastrado pelo Responsável.
