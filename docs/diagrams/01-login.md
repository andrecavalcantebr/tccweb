# Login — Cadeia de Chamadas

Duas portas (ver [features/login.md](../features/login.md)): conta institucional
(Google já provou a identidade, sem senha) e conta externa (e-mail digitado como
alegação, só vale com a senha gerada no cadastro). As duas passam pelo mesmo
roteador e pelo mesmo `AuthService`.

Fontes: `src/main.js` (`doGet`/`doPost` → `_route_`, `renderLogin`,
`_issueLoginNonce_`/`_consumeLoginNonce_`), `src/ServiceAuth.js`
(`AuthService.processLogin`, `_startSession`), `src/ServicePeople.js`
(`PeopleService.verifyPassword`).

```mermaid
sequenceDiagram
    actor Pessoa
    participant Nav as Navegador (ui_app_login)
    participant Main as main.js (_route_)
    participant Auth as AuthService
    participant People as PeopleService
    participant Sheet as Planilha (SheetDao)

    Pessoa->>Nav: Abre a URL do app
    Nav->>Main: GET ?page=login (ou padrão)
    Main->>Main: _getIdentityKey_() — recusa sem conta Google
    Main->>Main: isSystemSetup() / há período ativo?
    Main->>Main: renderLogin(userEmail)
    Main->>Main: _issueLoginNonce_() (token de uso único, cache 30 min)
    Main-->>Nav: HTML — e-mail já preenchido (institucional) ou editável (externo)

    Pessoa->>Nav: Preenche nome (e senha, se externo) e envia
    Nav->>Main: POST ?page=validate_login (nonce, email, name, password)
    Main->>Main: _consumeLoginNonce_(nonce) — falha = replay, ignora o POST

    alt Conta institucional (Google resolveu o e-mail)
        Main->>Auth: processLogin(email, name, {googleVerified:true})
    else Conta externa (Google não resolveu)
        Main->>Auth: processLogin(email, name, {googleVerified:false, password})
        Auth->>People: verifyPassword(email, password)
        People->>People: throttle por conta Google (8 tentativas / 15 min)
        People-->>Auth: {ok, lockedOut}
        opt senha incorreta ou lockedOut
            Auth-->>Main: {success:false, msg}
            Main-->>Nav: renderError / renderLogin de novo
        end
    end

    Auth->>Auth: getSemestersForUser(email) — via _rolesInSemester
    opt pessoa não participa de período nenhum
        Auth-->>Main: {success:false, needsEnrollment:true}
        Main-->>Nav: renderEnrollment (tela de matrícula)
    end

    Auth->>Auth: _startSession(email, name, googleVerified)
    Auth->>Sheet: sessionDao.getById(identityKey) / insert ou update
    Sheet-->>Auth: sessão gravada (Active_Sessions, no registro)
    Auth-->>Main: {success:true, role}

    Main->>Main: _renderDashboard_(auth, session)
    Main-->>Nav: HTML do painel do papel (initialPayload embutido)
    Nav-->>Pessoa: Painel carregado
```

## Notas

- O nonce (`_issueLoginNonce_`/`_consumeLoginNonce_`) existe porque um F5 na
  resposta do POST oferece reenviar o formulário — sem ele, cada replay
  renovaria a sessão e o timeout nunca seria alcançado (rationale 7.2).
- `_startSession` decide o período (o gravado na sessão, se ainda válido, senão
  o primeiro selecionável) e o papel (o mais privilegiado, na primeira vez).
- Ver também [02-timeout-sessao-reentrada.md](02-timeout-sessao-reentrada.md)
  para o que acontece numa reentrada, e
  [05-matricula-aluno.md](05-matricula-aluno.md) para o caminho de quem ainda
  não participa de período nenhum.
