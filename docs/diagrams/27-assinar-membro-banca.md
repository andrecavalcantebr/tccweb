# Assinar como Membro da Banca — Cadeia de Chamadas

Autorização por **pertencimento**, não por papel: quem assina está em
`MembersData`. Um professor que não orienta este aluno e um convidado externo
entram os dois como Orientador (é o único papel que a UFAM concede a quem
está em `Teachers`) — o que distingue é a lista de membros, não o papel.

Duas portas para o mesmo comando: o link do e-mail (qualquer membro) ou o
bloco "Atas aguardando a sua assinatura" no próprio painel (quem já tem conta
no sistema).

Fontes: `src/main.js` (`_route_`, página `sign`, `renderSignMinutes`),
`src/ui_app_sign_minutes.html`, `src/ui_app_dashboard_advisor.html`
(`pendingSignatures`), `src/ServiceDefense.js` (`cmdSignMinutes`,
`findDefenseBySignatureToken_`, `DefenseService.signAsMember`).

```mermaid
sequenceDiagram
    actor Membro as Membro da banca (interno ou externo)
    participant Nav as Navegador
    participant Main as main.js (_route_)
    participant Def as DefenseService
    participant Sheet as Planilha (Defenses)

    alt Pela link do e-mail
        Membro->>Nav: Abre o link recebido (?page=sign&token=T)
        Nav->>Main: GET ?page=sign&token=T
        Main->>Main: getValidCurrentSession — exige login
        Main->>Def: findDefenseBySignatureToken_(sheetId, T)
        Def->>Sheet: procura o token em SignatureTokens de cada defesa
        alt token não existe mais (já assinado, ou Ata encerrada)
            Def-->>Main: null
            Main-->>Nav: renderError('Link de assinatura inválido')
        else token válido
            Main->>Main: confere que a conta logada é a convidada
            Main-->>Nav: ui_app_sign_minutes.html (resumo da Ata)
        end
    else Pelo próprio painel (já logado, é membro de outra banca)
        Membro->>Nav: Painel do Orientador → "Atas aguardando a sua assinatura"
        note right of Nav: Lista vem em getAdvisorDashboardData().pendingSignatures
    end

    Membro->>Nav: Confere notas e parecer → "Assinar a Ata"
    Nav->>Def: google.script.run.cmdSignMinutes(proposalId)
    Def->>Def: _context(proposalId)
    Def->>Def: state.canSignMinutes(role)? (qualquer papel exceto Aluno)
    Def->>Def: _memberOf(ctx, email) — está em MembersData?
    alt não é membro desta banca
        Def-->>Nav: throw Error("Você não é membro da banca desta defesa.")
    else é membro
        Def->>Def: é o Orientador? já assinou ao fechar — recusa
        Def->>Def: já assinou antes? recusa
        Def->>Def: _minutesHash_(...) + _signMinutes_(email, hash, agora)
        Def->>Sheet: defenseDao.update(defenseId, {MembersGrades(com a assinatura), SignatureTokens(token removido)})
        Def->>Def: logAction(..., "Ata assinada por X. Faltam N." OU "...todas colhidas", destinatário: Aluno se for a última)
        Def-->>Nav: {success:true, dashboard}
    end
    Nav-->>Membro: confirmação — "Assinatura registrada"
```

## Notas

- O token é de uso único: `signAsMember` o remove de `SignatureTokens` na
  mesma escrita que grava a assinatura — reabrir o link depois dá "link
  inválido", que é o caminho normal, não um erro.
- Quando a última assinatura da banca é colhida, o destinatário da notificação
  vira o Aluno — é a vez dele dar o "de acordo". Ver
  [28-de-acordo-aluno.md](28-de-acordo-aluno.md).
