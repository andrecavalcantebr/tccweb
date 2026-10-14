# Orientador Lança Notas e Assina — Cadeia de Chamadas

Duas ações separadas de propósito: lançar nota é trabalho (pode ser salvo no
meio da defesa, sem fechar nada); assinar é decisão, e fecha o lançamento —
gera o hash canônico, carimba a assinatura do Orientador e sorteia um token de
assinatura por membro que falta.

Fontes: `src/ui_app_dashboard_advisor.html` (`saveMinutes`, `signMinutes`),
`src/ServiceDefense.js` (`cmdSaveMinutes`, `cmdSignMinutesAsAdvisor`,
`DefenseService.saveMinutes`, `signAsAdvisor`, `_buildVerdict`,
`_minutesHash_`, `_signMinutes_`, `_notifyPendingSigners`).

```mermaid
sequenceDiagram
    actor Orientador
    participant Nav as Navegador (ui_app_dashboard_advisor)
    participant Def as DefenseService
    participant Sheet as Planilha (Defenses)
    participant Mail as MailApp

    rect rgb(235,245,255)
    note over Orientador,Sheet: Salvar sem fechar (pode repetir várias vezes)
    Orientador->>Nav: Lança nota de cada membro, observações, parecer → Salvar
    Nav->>Def: google.script.run.cmdSaveMinutes(proposalId, data)
    Def->>Def: _context(proposalId); state.canRecordVerdict(Orientador)? + _assertAdvisor
    Def->>Def: _buildVerdict(ctx, data) — valida notas (0–10), calcula a Média
    Def->>Sheet: defenseDao.update(defenseId, {MembersGrades, Observacoes, Media, Parecer})
    Def-->>Nav: {success:true}
    end

    rect rgb(255,245,230)
    note over Orientador,Mail: Fechar assinando
    Orientador->>Nav: Confere tudo → "Assinar" (fecha o lançamento)
    Nav->>Def: google.script.run.cmdSignMinutesAsAdvisor(proposalId, data)
    Def->>Def: _context(proposalId); state.canRecordVerdict(Orientador)? + _assertAdvisor
    Def->>Def: _buildVerdict(ctx, data)
    alt alguma nota faltando, ou parecer vazio
        Def-->>Nav: throw Error("Lance a nota de todos..." / "Informe o parecer...")
    else completo
        Def->>Def: _minutesHash_(proposal, committee, registroJáAtualizado)
        Def->>Def: _signMinutes_(orientadorEmail, hash, agora) — HMAC-SHA256
        Def->>Def: sorteia um token por membro que falta assinar
        Def->>Sheet: defenseDao.update(defenseId, {MembersGrades(com a assinatura), AdvisorSignedAt, SignatureTokens})
        Def->>Sheet: proposalDao.update(id, {Status:"Ata Em Assinaturas"})
        Def->>Mail: _notifyPendingSigners(ctx, tokens) — um e-mail por membro, com o link ?page=sign&token=
        Mail-->>Def: e-mails enviados
        Def->>Def: logTransition(..., destinatário: Orientador)
        Def-->>Nav: {success:true, dashboard}
    end
    end
    Nav-->>Orientador: painel — Ata em assinaturas, aguardando a banca
```

## Notas

- O hash é calculado sobre o registro **já com o patch aplicado** — assinar o
  que estava gravado antes carimbaria notas velhas.
- A partir daqui as notas não mudam mais: elas passam a fazer parte do que
  cada assinatura cobre.
- Ver [27-assinar-membro-banca.md](27-assinar-membro-banca.md) para o que
  acontece quando cada membro clica no link recebido.
