# Troca de Papel — Cadeia de Chamadas

Rota (`?page=switch_role`), não comando `google.script.run` — ver
[rationale 7.3](../rationale.md#73-redirecionamento-vai-na-navegação-não-no-callback):
o app roda num iframe com `allow-top-navigation-by-user-activation`, e a
ativação transitória do Chrome expira poucos segundos depois do clique.
Redirecionar do callback de uma chamada lenta era bloqueado silenciosamente.

Fontes: `src/ui_comp_page_header.html` (`changeUserRole`), `src/main.js`
(`_route_`, trecho `page === 'switch_role'`), `src/ServiceAuth.js`
(`switchRole`, `_updateSession_`).

```mermaid
sequenceDiagram
    actor Pessoa
    participant Nav as Navegador (ui_comp_page_header)
    participant Main as main.js (_route_)
    participant Auth as AuthService
    participant Sheet as Planilha (Active_Sessions)

    Pessoa->>Nav: Escolhe outro papel no seletor do cabeçalho
    Nav->>Nav: setBusyCursor(true)
    Nav->>Main: window.top.location.href = appUrl() + '?page=switch_role&role=X'
    note right of Nav: Navegação real, dentro do próprio evento do<br/>select — mantém a ativação transitória

    Main->>Auth: getValidCurrentSession(touch=true)
    alt sessão expirada
        Main-->>Nav: renderLogin(userEmail)
    else sessão válida
        Main->>Auth: switchRole(role)
        Auth->>Auth: getContext()
        Auth->>Auth: getAvailableRoles(email).includes(role)?
        alt papel não disponível para esta pessoa neste período
            Auth-->>Main: {success:false, msg}
            Main-->>Nav: renderError('Troca de Papel', msg)
        else permitido
            Auth->>Sheet: _updateSession_ — patch Role, LastActivity
            Sheet-->>Auth: gravado
            Auth-->>Main: {success:true}
            Main->>Main: session.role = role (linha já lida fica desatualizada)
            Main->>Main: _renderDashboard_(auth, session)
            Main-->>Nav: HTML do painel do novo papel
        end
    end
    Nav-->>Pessoa: Painel do papel escolhido
```

## Notas

- A checagem de timeout vem **antes** da troca, nunca depois: aplicada
  primeiro, `switchRole` gravaria `LastActivity` e ressuscitaria uma sessão
  expirada sem passar pela tela de login — o mesmo risco de replay que o
  nonce do login fecha (ver
  [rationale 7.2](../rationale.md#72-toda-requisição-reproduzível-precisa-de-nonce-ou-de-ordem-correta)).
- Uma repetição desta URL (F5) reaplica o mesmo papel — inofensivo, por isso
  não há nonce aqui.
