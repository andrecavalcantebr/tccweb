# Reenvio de Convite e Nova Senha — Cadeia de Chamadas

Dois gestos distintos, ambos no painel de Professores. Nenhum dos dois reexibe
a senha antiga: só o hash fica guardado, então "recuperar" não existe — só
substituir.

Fontes: `src/ui_app_dashboard_incharge.html` (`resendInvitation`,
`resetTeacherPassword`), `src/ServiceSetup.js` (`cmdResendInvitation`,
`cmdResetTeacherPassword`), `src/ServicePeople.js`
(`PeopleService.resendInvitation`, `resetTeacherPassword`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Setup as ServiceSetup.js
    participant People as PeopleService
    participant Sheet as Planilha (Teachers)
    participant Mail as MailApp

    rect rgb(235,245,255)
    note over Responsável,Mail: Reenviar convite (cadastro ainda pendente ou já ativo)
    Responsável->>Nav: Clica "Reenviar convite" na linha do professor
    Nav->>Setup: google.script.run.cmdResendInvitation(email)
    Setup->>Setup: _assertFreshSession_() + _assertCanManagePeople_()
    Setup->>People: resendInvitation(email)
    alt cadastro ainda pendente (IsActive=false)
        People->>People: gera token NOVO (o antigo morre)
        People->>Sheet: dao.update(email, {InviteToken, InviteSentAt})
        Sheet-->>People: gravado
    else já ativo
        note right of People: Sem token novo — o link do e-mail vira só<br/>o endereço do sistema
    end
    People->>Mail: _mailInvitation(record, '', token)
    Mail-->>People: e-mail enviado
    People-->>Setup: record
    Setup-->>Nav: {success:true, msg:"Convite reenviado por e-mail."}
    end

    rect rgb(255,245,230)
    note over Responsável,Mail: Nova senha (só para externo)
    Responsável->>Nav: Clica "Nova senha" na linha do professor externo
    Nav->>Setup: google.script.run.cmdResetTeacherPassword(email)
    Setup->>Setup: _assertFreshSession_() + _assertCanManagePeople_()
    Setup->>People: resetTeacherPassword(email)
    People->>People: getTeacher(email) — confere IsExternal
    alt conta institucional
        People-->>Setup: throw Error("entra pelo Google, sem senha")
        Setup-->>Nav: {success:false, msg}
    else externo
        People->>People: _generatePassword_() + novo hash + novo salt
        People->>Sheet: dao.update(email, {PasswordSalt, PasswordHash})
        Sheet-->>People: gravado
        People->>Mail: _mailInvitation(record, password)
        Mail-->>People: e-mail enviado
        People-->>Setup: password
        Setup-->>Nav: {success:true, password, msg}
        Nav-->>Responsável: mostra a nova senha uma única vez
    end
    end
```
