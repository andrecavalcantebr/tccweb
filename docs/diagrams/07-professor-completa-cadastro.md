# Professor Completa o Próprio Cadastro — Cadeia de Chamadas

Chegada pelo link do convite (`?page=teacher_signup&token=...`). Em conta
institucional, a conta Google logada precisa ser a convidada — sem isso, um
link encaminhado deixaria outra pessoa assumir o cadastro.

Fontes: `src/main.js` (`_route_`, páginas `teacher_signup`/
`validate_teacher_signup`, `renderTeacherSignup`), `src/ServicePeople.js`
(`PeopleService.getTeacherByInviteToken`, `completeSignup`).

```mermaid
sequenceDiagram
    actor Professor
    participant Nav as Navegador (ui_app_teacher_signup)
    participant Main as main.js (_route_)
    participant People as PeopleService
    participant Sheet as Planilha (Teachers)

    Professor->>Nav: Abre o link do e-mail (?page=teacher_signup&token=T)
    Nav->>Main: GET ?page=teacher_signup&token=T
    Main->>Main: renderTeacherSignup(token, userEmail, '')
    Main->>People: getTeacherByInviteToken(T)
    People->>Sheet: getTeachers().find(InviteToken === T)
    alt token não existe ou passou de 14 dias
        People-->>Main: null
        Main-->>Nav: renderError('Convite inválido ou expirado')
    else token válido
        Main->>Main: isExternal? confere userEmail === e-mail convidado (se institucional)
        alt conta Google errada (institucional)
            Main-->>Nav: renderError('Conta diferente da convidada')
        else pode prosseguir
            Main-->>Nav: formulário (nome, titulação, instituição, telefone)
        end
    end

    Professor->>Nav: Preenche e envia
    Nav->>Main: POST ?page=validate_teacher_signup (nonce, token, dados)
    Main->>Main: _consumeLoginNonce_(nonce)
    alt replay (nonce já usado)
        Main-->>Nav: renderTeacherSignup(token, userEmail, '') — formulário de novo
    else nonce válido
        Main->>People: completeSignup(token, data, userEmail)
        People->>People: getTeacherByInviteToken(token) — revalida
        People->>People: confere conta institucional de novo
        People->>Sheet: dao.update(email, {name, titulacao, instituicao, phone, IsActive:true, InviteToken:''})
        Sheet-->>People: professor ativo
        People-->>Main: record
        Main-->>Nav: renderView('teacher_signup', {done:true})
    end
    Nav-->>Professor: "Cadastro completo" — já pode entrar pelo login normal
```

## Notas

- O token é de uso único: `completeSignup` o zera na mesma escrita que ativa a
  pessoa.
- Duas checagens da mesma regra (conta institucional == convidada): uma em
  `renderTeacherSignup` (feedback imediato) e outra dentro de
  `completeSignup` (a que vale de fato) — uma checagem que só existe na
  renderização não é checagem nenhuma.
