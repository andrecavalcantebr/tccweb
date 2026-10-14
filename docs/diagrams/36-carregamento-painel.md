# Carregamento de Painel — Cadeia de Chamadas

Comum aos três painéis (Aluno, Orientador, Responsável). O dado viaja **dentro
da página** (`initialPayload`) para custar uma só execução do Apps Script em
vez de duas — ver
[rationale 7.6](../rationale.md#76-o-painel-viaja-dentro-da-página). O cliente
mantém `google.script.run` como caminho de reserva, usado pelo "Tentar
novamente" e por toda ação (que devolve o painel recalculado — ver
[rationale 7.7](../rationale.md#77-comando-devolve-o-painel-já-atualizado)).

Fontes: `src/main.js` (`_renderDashboard_`, `_initialDashboardPayload_`,
`_jsonForScript_`), `src/ServiceDashboard.js` (`_dashboardPayloadForRole_`,
`getStudentDashboardData`/`getAdvisorDashboardData`/`getInchargeDashboardData`),
`src/ui_scripts.html` (`startLoadWatchdog`, `loadTimeoutHtml`), cada
`ui_app_dashboard_*.html` (`loadDashboard`, `renderDashboard`).

```mermaid
sequenceDiagram
    actor Pessoa
    participant Nav as Navegador (ui_app_dashboard_*)
    participant Main as main.js
    participant Dash as ServiceDashboard.js
    participant Auth as AuthService
    participant Sheet as Planilha

    Pessoa->>Nav: Entra no painel (login, troca de papel/período, ou F5)
    Nav->>Main: GET (autenticado, via _route_)
    Main->>Main: _renderDashboard_(auth, session)
    Main->>Main: _initialDashboardPayload_(role) — nunca lança, null em falha
    Main->>Dash: _dashboardPayloadForRole_(role)
    Dash->>Auth: getContext() + touchCurrentSession()
    Dash->>Sheet: lê Students/Proposals/Committees/Defenses/Events do período
    Sheet-->>Dash: dados brutos
    Dash-->>Main: payload completo (métricas, linhas, permissões)
    Main->>Main: _jsonForScript_(payload) — escapa </script>, U+2028/2029
    Main-->>Nav: HTML com `let initialPayload = {...}` embutido

    Nav->>Nav: loadDashboard()
    alt initialPayload veio preenchido
        Nav->>Nav: renderDashboard(initialPayload) — sem round-trip nenhum
    else initialPayload é null (falhou no servidor) OU botão "Tentar novamente"
        Nav->>Nav: startLoadWatchdog(onLoadTimeout) — 20s
        Nav->>Dash: google.script.run.getXDashboardData()
        alt responde a tempo
            Dash-->>Nav: withSuccessHandler → clearLoadWatchdog(); renderDashboard(data)
        else nem success nem failure volta (transporte caiu)
            Nav->>Nav: onLoadTimeout() — "O servidor não respondeu" + botão de repetir
        else erro do servidor
            Dash-->>Nav: withFailureHandler → clearLoadWatchdog(); onLoadError(err)
        end
    end
    Nav-->>Pessoa: painel renderizado (ou mensagem de erro acionável)
```

## Notas

- O painel nunca some sem explicação: o watchdog existe porque uma chamada
  `google.script.run` pode falhar sem acionar **nenhum** dos dois handlers —
  sem ele, a tela ficava em "Carregando…" para sempre, indistinguível de
  lenta.
- Toda ação (`cmd*`) devolve `dashboard` recalculado na **mesma execução** que
  escreveu — ler numa execução seguinte mostraria o estado anterior, porque
  uma escrita só é garantidamente visível para quem a fez.
