# Convite de Professor por E-mail — Cadeia de Chamadas

O Responsável digita só o endereço; a linha nasce **inativa** e pendente, e a
pessoa completa o próprio cadastro pelo link (ver
[07-professor-completa-cadastro.md](07-professor-completa-cadastro.md)). O
convite é individual: um e-mail, uma vez, 14 dias — ver
[rationale 2.3](../rationale.md#23-auto-cadastro-de-professor-é-escalada-de-privilégio).

Fontes: `src/ui_app_dashboard_incharge.html` (`inviteTeacher`),
`src/ServiceSetup.js` (`cmdInviteTeacher`, `_assertCanManagePeople_`),
`src/ServicePeople.js` (`PeopleService.inviteTeacher`, `_mailInvitation`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Setup as cmdInviteTeacher
    participant Auth as AuthService
    participant People as PeopleService
    participant Sheet as Planilha (Teachers)
    participant Mail as MailApp

    Responsável->>Nav: Painel → Professores → Convidar por e-mail
    Nav->>Setup: google.script.run.cmdInviteTeacher({email, name})
    Setup->>Setup: _assertFreshSession_() (timeout)
    Setup->>Setup: _assertCanManagePeople_() — dono do app OU Responsável do período
    Setup->>People: inviteTeacher(email, name)
    People->>People: getTeacher(key) — já ativo?
    alt já cadastrado e ativo
        People-->>Setup: throw Error("já está cadastrado e ativo")
        Setup-->>Nav: {success:false, msg}
    else pendente ou novo
        People->>People: _isInstitutionalEmail_(key) → IsExternal
        opt externo
            People->>People: _generatePassword_() + hash + salt
        end
        People->>People: INVITE_TOKEN = _randomToken_(...), IS_ACTIVE = false
        People->>Sheet: dao.upsert(key, record)
        Sheet-->>People: linha pendente gravada
        People->>Mail: _mailInvitation(record, password, token)
        Mail-->>People: e-mail enviado (link ?page=teacher_signup&token=...)
        People-->>Setup: {record, password}
        Setup-->>Nav: {success:true, password, msg}
    end
    Nav-->>Responsável: mostra a senha uma única vez (se externo) e a mensagem
```

## Notas

- A linha nasce **antes** de a pessoa responder: criar a linha é o próprio ato
  de autorização, e ele é do Responsável — não há cadastro aberto.
- Compare com [24-homologar-banca.md](24-homologar-banca.md): o mesmo
  `inviteTeacher` é chamado em lote, de dentro de
  `PeopleService.inviteCommitteeMembers`, para os membros da banca que o
  sistema ainda não conhece.
