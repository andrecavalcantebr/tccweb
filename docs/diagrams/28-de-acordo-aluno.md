# De Acordo do Aluno — Cadeia de Chamadas

A última assinatura da Ata, e a única do Aluno. Vale ao mesmo tempo para a Ata
e para a Folha de Aprovação — é o mesmo consentimento, e pedi-lo duas vezes
não acrescentaria nada.

Fontes: `src/ui_app_dashboard_student.html` (`studentAgreement`),
`src/ServiceDefense.js` (`cmdStudentAgreement`,
`DefenseService.studentAgreement`).

```mermaid
sequenceDiagram
    actor Aluno
    participant Nav as Navegador (ui_app_dashboard_student)
    participant Cmd as cmdStudentAgreement
    participant Def as DefenseService
    participant Sheet as Planilha (Defenses / Proposals)

    Aluno->>Nav: Vê a Ata completa (todos os membros assinados) → "De Acordo"
    Nav->>Cmd: google.script.run.cmdStudentAgreement(proposalId)
    Cmd->>Def: studentAgreement(role, email, proposalId)
    Def->>Def: _context(proposalId)
    Def->>Def: state.canAgree(Aluno)? — só quando a Ata está em assinaturas
    Def->>Def: é o próprio aluno desta proposta?
    Def->>Def: conta assinaturas pendentes dos demais membros
    alt ainda falta alguém da banca assinar
        Def-->>Cmd: throw Error("Ainda faltam N assinatura(s). O seu de acordo é o último.")
    else banca completa
        Def->>Def: _minutesHash_(...) + _signMinutes_(alunoEmail, hash, agora)
        Def->>Sheet: defenseDao.update(defenseId, {StudentAgreement, StudentAgreementAt})
        Def->>Sheet: proposalDao.update(id, {Status:"Ata Assinada"})
        Def->>Def: logTransition(..., destinatário: Responsável)
        Def-->>Cmd: {success:true}
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Aluno)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Aluno: painel — status "Ata Assinada", aguardando homologação
```

## Notas

- Esta é a assinatura que os dois PDFs (Ata e Folha de Aprovação) exigem para
  poderem ser emitidos — ver
  [30-emitir-pdf-ata-folha-aprovacao.md](30-emitir-pdf-ata-folha-aprovacao.md).
