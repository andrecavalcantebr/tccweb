# Cadastro Direto de Professor — Cadeia de Chamadas

O Responsável digita tudo, e o professor já nasce **ativo** — sem convite, sem
espera. Útil para quem ele conhece de cor. O tipo de acesso (institucional ou
externo) é deduzido do domínio do e-mail, nunca perguntado — ver
[rationale 3.2](../rationale.md#32-isexternal-é-deduzido-do-domínio-não-perguntado).

Fontes: `src/ui_app_dashboard_incharge.html` (`saveTeacher`),
`src/ServiceSetup.js` (`cmdSaveTeacher`), `src/ServicePeople.js`
(`PeopleService.saveTeacher`, `_mailInvitation`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Setup as cmdSaveTeacher
    participant People as PeopleService
    participant Sheet as Planilha (Teachers)
    participant Mail as MailApp

    Responsável->>Nav: Painel → Professores → preenche nome, e-mail, titulação... → Salvar
    Nav->>Setup: google.script.run.cmdSaveTeacher(data)
    Setup->>Setup: _assertFreshSession_() + _assertCanManagePeople_()
    Setup->>People: saveTeacher(data)
    People->>People: getTeacher(email) — existente ou novo
    People->>People: isExternal = !_isInstitutionalEmail_(email)
    opt externo E sem senha ainda
        People->>People: _generatePassword_() + hash + salt
    end
    People->>Sheet: dao.upsert(email, record) — IsActive:true
    Sheet-->>People: linha gravada
    opt cadastro novo, ou senha gerada agora
        People->>Mail: _mailInvitation(record, password)
        Mail-->>People: e-mail enviado (sem token — já está ativo)
    end
    note over People,Mail: Edição de um cadastro já existente (sem senha nova)<br/>não reenvia e-mail: corrigir um telefone não é<br/>motivo para escrever de novo à pessoa
    People-->>Setup: {record, password}
    Setup-->>Nav: {success:true, password, msg}
    Nav-->>Responsável: mostra a senha uma única vez (se externo)
```

## Notas

- Diferença para o convite (
  [06-convite-professor-email.md](06-convite-professor-email.md)): aqui não há
  `InviteToken` nem `IsActive:false` — a pessoa nasce pronta para uso, porque
  quem digitou os dados já é quem tinha autoridade para decidir.
