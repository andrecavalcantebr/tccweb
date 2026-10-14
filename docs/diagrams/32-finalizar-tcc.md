# Finalizar TCC — Cadeia de Chamadas

Último passo do fluxo normal: o Responsável lança a nota (já calculada na Ata)
no e-campus e fecha o TCC no sistema. Aqui o fluxo se encerra — não há mais
nada a fazer depois disso.

Fontes: `src/ui_app_dashboard_incharge.html` (`finalizeTcc`),
`src/ServiceDefense.js` (`cmdFinalizeTcc`, `DefenseService.finalize`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Cmd as cmdFinalizeTcc
    participant Def as DefenseService
    participant Sheet as Planilha (Proposals / Defenses)

    Responsável->>Nav: Linha do aluno (TCC Final Submetido) → "Finalizar TCC" → confirma
    note right of Nav: Modal lembra: lance a nota no e-campus ANTES — o<br/>fluxo se encerra aqui dentro
    Nav->>Cmd: google.script.run.cmdFinalizeTcc(proposalId)
    Cmd->>Def: finalize(role, email, proposalId)
    Def->>Def: _context(proposalId)
    Def->>Def: state.canFinalize(Responsável)? — só depois da entrega final completa
    alt entrega final incompleta
        Def-->>Cmd: throw Error("Só é possível finalizar depois da entrega final do aluno.")
    else pode finalizar
        Def->>Sheet: lê FinalGrade (a Média calculada na Ata)
        Def->>Sheet: proposalDao.update(id, {Status:"TCC Finalizado"})
        Def->>Def: logTransition(..., "TCC finalizado... Média final: X", destinatário: Aluno)
        Def-->>Cmd: {success:true}
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Responsável)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Responsável: painel — status "TCC Finalizado", métrica de finalizados +1
```

## Notas

- `FinishedState` é fim de linha: nem `canCloseWithoutDefense` (que normalmente
  vale em qualquer status para o Responsável) funciona depois disto — ver
  [33-encerrar-sem-banca.md](33-encerrar-sem-banca.md).
