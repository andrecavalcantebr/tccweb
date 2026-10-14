# Troca de Período — Cadeia de Chamadas

Mesmo padrão da troca de papel (rota, não comando) e mesmo motivo — ver
[03-troca-de-papel.md](03-troca-de-papel.md) e
[rationale 7.3](../rationale.md#73-redirecionamento-vai-na-navegação-não-no-callback).
A diferença: o papel é **recomputado** para o período de destino, porque a
mesma pessoa pode ser Responsável num período e só Orientador noutro.

Fontes: `src/ui_comp_page_header.html` (`changeUserSemester`), `src/main.js`
(`_route_`, trecho `page === 'switch_semester'`), `src/ServiceAuth.js`
(`switchSemester`, `_updateSession_`, `_rolesInSemester`).

```mermaid
sequenceDiagram
    actor Pessoa
    participant Nav as Navegador (ui_comp_page_header)
    participant Main as main.js (_route_)
    participant Auth as AuthService
    participant Sheet as Planilha (Active_Sessions)

    Pessoa->>Nav: Escolhe outro período no seletor do cabeçalho
    Nav->>Nav: setBusyCursor(true)
    Nav->>Main: window.top.location.href = appUrl() + '?page=switch_semester&semester=Y'

    Main->>Auth: getValidCurrentSession(touch=true)
    alt sessão expirada
        Main-->>Nav: renderLogin(userEmail)
    else sessão válida
        Main->>Auth: switchSemester(semester)
        Auth->>Auth: getContext()
        Auth->>Auth: getSemesterByName(semester)
        Auth->>Auth: getSelectableSemesters(email).includes(target)?
        alt período não é um dos que a pessoa pode escolher
            Auth-->>Main: {success:false, msg}
            Main-->>Nav: renderError('Troca de Período', msg)
        else permitido
            Auth->>Auth: _rolesInSemester(email, target)
            Auth->>Auth: mantém o papel atual se ele existir lá, senão o mais privilegiado
            Auth->>Sheet: _updateSession_ — patch Semester, Role, LastActivity
            Sheet-->>Auth: gravado
            Auth-->>Main: {success:true}
            Main->>Main: _renderDashboard_(new AuthService(), null)
            note right of Main: Sessão relida do zero — a linha já lida ficou<br/>desatualizada pela escrita acima
            Main-->>Nav: HTML do painel do período novo
        end
    end
    Nav-->>Pessoa: Painel do período escolhido
```

## Notas

- Bounded por `getSelectableSemesters`, não por `getSemestersForUser`:
  `?page=switch_semester` é uma URL adivinhável, e um aluno preso ao período
  mais novo (ver `AuthService.getSelectableSemesters`) não pode voltar a um
  período anterior só porque tecnicamente ainda tem matrícula lá.
