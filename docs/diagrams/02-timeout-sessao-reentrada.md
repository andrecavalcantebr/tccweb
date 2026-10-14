# Timeout de Sessão e Reentrada — Cadeia de Chamadas

O timeout vale para **entrada de página** (todo `doGet` autenticado) e para
**comandos de escrita** (todo `cmd*`); leitura de painel é deliberadamente
tolerante — ver [rationale 1.6](../rationale.md#16-o-timeout-de-sessão-vale-para-escritas-não-só-para-navegação).

Fontes: `src/ServiceAuth.js` (`getValidCurrentSession`, `assertActiveSession`,
`touchCurrentSession`, `_touch`), `src/main.js` (`_route_`), `src/utils.js`
(`SESSION_TIMEOUT_MINUTES`), `src/ui_scripts.html` (watchdog de carga).

```mermaid
sequenceDiagram
    actor Pessoa
    participant Nav as Navegador
    participant Main as main.js (_route_)
    participant Auth as AuthService
    participant Sheet as Planilha (Active_Sessions)

    rect rgb(235,245,255)
    note over Pessoa,Sheet: Entrada de página (qualquer ?page= autenticado)
    Pessoa->>Nav: Reabre a aba / navega
    Nav->>Main: GET ?page=... (qualquer página autenticada)
    Main->>Auth: getValidCurrentSession(touch=true)
    Auth->>Sheet: dao.getById(identityKey)
    Sheet-->>Auth: sessão (com LastActivity)
    Auth->>Auth: minutosDecorridos = agora - LastActivity

    alt dentro do SESSION_TIMEOUT_MINUTES
        Auth->>Auth: _touch() — regrava LastActivity só se passou metade do timeout
        Auth-->>Main: {email, name, role}
        Main->>Main: _renderDashboard_(auth, session)
        Main-->>Nav: painel renderizado
    else expirada
        Auth-->>Main: null
        Main-->>Nav: renderLogin(userEmail) — pede os dados de novo
    end
    end

    rect rgb(255,245,230)
    note over Pessoa,Sheet: Comando de escrita (qualquer cmd*, ex. cmdSaveDraft)
    Pessoa->>Nav: Clica numa ação
    Nav->>Main: google.script.run.cmdX(...)
    Main->>Auth: getContext() — NÃO verifica timeout
    Main->>Auth: assertActiveSession()
    Auth->>Auth: getValidCurrentSession(true)
    alt sessão expirada
        Auth-->>Main: throw SESSION_EXPIRED_MSG
        Main-->>Nav: {success:false, msg:"sessão expirou"}
        Nav-->>Pessoa: mensagem de erro — ação NÃO executada
    else sessão válida
        Main->>Main: prossegue com o comando
    end
    end

    rect rgb(240,240,240)
    note over Pessoa,Nav: Watchdog de carga (ui_scripts.html)
    Nav->>Nav: startLoadWatchdog(onTimeout) antes de google.script.run
    alt resposta chega em até 20s
        Nav->>Nav: clearLoadWatchdog()
    else nenhum handler responde (transporte caiu)
        Nav->>Nav: onLoadTimeout() — mostra "Tentar novamente"
    end
    end
```

## Notas

- `getCurrentProfile()`/`getContext()` **ignoram** o timeout de propósito: um
  `google.script.run` não pode falhar no meio de um trabalho já em andamento
  só porque a leitura de contexto reabriu o relógio.
- O watchdog cobre um caso diferente do timeout: não é sessão expirada, é a
  chamada nunca voltar (nenhum `withSuccessHandler`/`withFailureHandler`
  executa) — ver [rationale 7.8](../rationale.md#78-há-um-watchdog-na-carga-do-painel).
