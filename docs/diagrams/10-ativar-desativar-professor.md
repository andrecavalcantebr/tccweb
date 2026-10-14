# Ativar / Desativar Professor — Cadeia de Chamadas

Nada é apagado — a pessoa pode estar nomeada numa banca de período anterior, e
uma linha ausente deixaria esse registro apontando para ninguém. Ver
[rationale 3.3](../rationale.md#33-ninguém-é-apagado-só-desativado).

Fontes: `src/ui_app_dashboard_incharge.html` (`toggleTeacher`),
`src/ServiceSetup.js` (`cmdSetTeacherActive`), `src/ServicePeople.js`
(`PeopleService.setTeacherActive`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Setup as cmdSetTeacherActive
    participant People as PeopleService
    participant Sheet as Planilha (Teachers)

    Responsável->>Nav: Clica "Desativar" (ou "Reativar") na linha do professor
    Nav->>Setup: google.script.run.cmdSetTeacherActive(email, isActive)
    Setup->>Setup: _assertFreshSession_() + _assertCanManagePeople_()
    Setup->>People: setTeacherActive(email, isActive)
    People->>People: getTeacher(email)
    alt professor não encontrado
        People-->>Setup: throw Error("Professor não encontrado.")
        Setup-->>Nav: {success:false, msg}
    else encontrado
        People->>Sheet: dao.update(email, {IsActive: isActive})
        Sheet-->>People: gravado
        People-->>Setup: record
        Setup-->>Nav: {success:true, msg}
    end
    Nav->>Nav: reloadTeachers() — busca a lista atualizada
    Nav-->>Responsável: linha atualizada na tabela de Professores
```

## Notas

- Passa por `setTeacherActive` diretamente, não por `saveTeacher`: esse outro
  caminho gera senha para um externo que ainda não tem uma, e simplesmente
  reativar alguém poderia mandar uma credencial nova sem necessidade.
- Um professor desativado some de `getTeacherEmails_()` (filtra por
  `IsActive`), então `AuthService._rolesInSemester` deixa de conceder
  Orientador a ele — a pessoa não entra mais como professor em período nenhum,
  mesmo mantendo a linha em `Teachers`. Se também for aluno ou Responsável
  noutro período, esses papéis continuam valendo.
