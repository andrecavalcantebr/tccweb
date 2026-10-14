# Verificação de Documento — Cadeia de Chamadas

Confere um PDF (Ata ou Folha de Aprovação) pela chave impressa nele. Recomputa
o HMAC de cada assinatura sobre o conteúdo **atual** da planilha — se alguém
editou uma nota depois das assinaturas, todas passam a não conferir. A
assinatura protege o conteúdo, não o arquivo.

Fontes: `src/main.js` (`_route_`, página `verify`), `src/ui_app_verify.html`,
`src/ServiceDefense.js` (`verifyDefenseKey`, `_minutesHash_`, `_signMinutes_`).

```mermaid
sequenceDiagram
    actor Pessoa
    participant Nav as Navegador (ui_app_verify)
    participant Main as main.js (_route_)
    participant Auth as AuthService
    participant Defense as verifyDefenseKey
    participant Sheet as Planilha (Defenses/Committees/Proposals)

    Pessoa->>Nav: Abre ?page=verify[&key=XXXXXXXXXX]
    Nav->>Main: GET ?page=verify
    Main->>Main: _getIdentityKey() — exige conta Google (qualquer uma); a rota não confere sessão
    Main-->>Nav: renderView('verify', {presetKey})

    Pessoa->>Nav: Digita a chave (ou já veio na URL) → Conferir
    Nav->>Defense: google.script.run.verifyDefenseKey(key)
    Defense->>Auth: getContext() — exige sessão válida; dá o sheetId do período atual
    alt sem sessão
        Auth-->>Nav: erro "sessão expirou" — a tela manda entrar pelo "Voltar ao sistema"
    end
    Defense->>Sheet: DefenseService._dao().getAll().find(ValidationKey === key)
    alt chave não encontrada
        Defense-->>Nav: {found:false, msg:"Nenhum documento com esta chave."}
    else encontrada
        Defense->>Sheet: busca Committee e Proposal relacionados
        Defense->>Defense: _minutesHash_(proposal, committee, defense) — recomputa o hash atual
        loop cada membro da banca
            Defense->>Defense: _signMinutes_(email, hash, assinadoEm) === assinatura gravada?
        end
        Defense->>Defense: confere também o "de acordo" do aluno
        Defense-->>Nav: {found:true, aluno, titulo, defesa, parecer, media, signatures[], integro}
    end
    Nav-->>Pessoa: mostra cada assinatura (confere / não confere) e o veredito geral
```

## Notas

- Fica atrás do login Google (qualquer conta), não aberta a anônimo — abrir
  esta rota sem exigir conta exigiria abrir a implantação inteira, e quem
  verifica uma ata quase sempre tem conta Google.
- `integro` só é verdadeiro quando **todas** as assinaturas esperadas existem
  E todas conferem — uma única divergência já derruba o resultado.

## Limites atuais

- A busca da chave é feita só na planilha do período que está na sessão. Uma
  Ata de outro período, mesmo ativo, responde "Nenhum documento com esta
  chave" — é preciso trocar de período no cabeçalho antes. Períodos encerrados
  não podem ser consultados (ver `roadmap.md`).
- O botão "Verificar documento" fica no cabeçalho dos painéis, não na tela de
  login: a consulta só funciona depois de entrar.
