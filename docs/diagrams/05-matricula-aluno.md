# Matrícula do Aluno — Cadeia de Chamadas

Porta de entrada do aluno: código do período (digitado, impresso no Plano de
Ensino) ou link de matrícula (mesmo formulário, código pré-preenchido). Ver
[features/dashboard-student.md](../features/dashboard-student.md) e
[rationale 3.1](../rationale.md#31-o-google-classroom-saiu).

Fontes: `src/main.js` (`_route_`, páginas `enrollment`/`validate_enrollment`,
`renderEnrollment`), `src/ServiceAuth.js` (`AuthService.processEnrollment`,
`_startSession`), `src/ServicePeople.js` (`PeopleService.enrollStudent`).

```mermaid
sequenceDiagram
    actor Aluno
    participant Nav as Navegador (ui_app_enrollment)
    participant Main as main.js (_route_)
    participant Auth as AuthService
    participant People as PeopleService
    participant Sheet as Planilha (Students / Semesters)

    Aluno->>Nav: Abre o link de matrícula OU digita o código na tela de login
    Nav->>Main: GET ?page=enrollment[&code=XXXXXX]
    Main->>Main: renderEnrollment(userEmail, name, '', code)
    Main->>Main: _issueLoginNonce_()
    Main-->>Nav: formulário (código, se veio do link, editável)

    Aluno->>Nav: Preenche nome, matrícula, telefone e envia
    Nav->>Main: POST ?page=validate_enrollment (nonce, code, name, studentId, phone)
    Main->>Main: _consumeLoginNonce_(nonce)

    Main->>Auth: processEnrollment(email, name, data, {googleVerified})
    Auth->>Auth: _normalizeEmail_(email)
    opt conta não verificada pelo Google
        Auth->>Auth: _unverifiedLoginAllowed_()? (TEST_LOGIN_ENABLED)
        Auth->>People: getTeacherEmails_() — recusa se o e-mail já é professor
    end
    Auth->>Auth: getActiveSemesters().find(código bate)
    alt código inválido ou período encerrado
        Auth-->>Main: {success:false, msg}
        Main-->>Nav: renderEnrollment(..., message) — formulário de novo
    else código válido
        Auth->>People: enrollStudent(sheetId, {email, name, studentId, phone})
        People->>Sheet: dao.upsert(studentId, record)
        note right of People: Matrícula é a chave — recadastrar a mesma pessoa<br/>atualiza a linha; matrícula de outro e-mail é recusada
        Sheet-->>People: linha gravada em Students
        People-->>Auth: record

        Auth->>Auth: limpa memos de papéis/períodos
        Auth->>Auth: _startSession(email, name, googleVerified)
        Auth->>Sheet: sessionDao.insert/update (Active_Sessions)
        Sheet-->>Auth: sessão gravada, role = Aluno
        Auth-->>Main: {success:true, role}

        Main->>Main: _renderDashboard_(auth, session)
        Main-->>Nav: painel do Aluno (Sem Proposta)
    end
    Nav-->>Aluno: Painel carregado
```

## Notas

- Um professor nunca entra por aqui: o código concede **só** o papel de Aluno.
  Deixar o auto-cadastro conceder Orientador seria a escalada de privilégio
  recusada em 10/Ago — ver
  [rationale 2.3](../rationale.md#23-auto-cadastro-de-professor-é-escalada-de-privilégio).
- Ver [14-configuracao-periodo-letivo-bootstrap.md](14-configuracao-periodo-letivo-bootstrap.md)
  e [15-criar-periodo-letivo.md](15-criar-periodo-letivo.md) para onde o
  código de matrícula é sorteado.
