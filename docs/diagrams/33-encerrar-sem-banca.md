# Encerrar Sem Banca (Aproveitamento / Desistência) — Cadeia de Chamadas

Os dois fluxos alternativos de `specs.md`. Disponível em **qualquer status não
terminal**, porque é isso que o caso pede: um aluno desiste quando desiste, e
um aproveitamento pode chegar antes da primeira proposta. Fica no "Detalhes",
não na coluna de ações — é exceção, não passo do fluxo.

Fontes: `src/ui_app_dashboard_incharge.html` (`closeTcc`, `closePanelHtml`),
`src/ServiceDefense.js` (`cmdCloseTcc`, `DefenseService.closeWithoutDefense`,
`_upsertGradeOnly`), `src/ServiceTccState.js` (`TccState.canCloseWithoutDefense`
— na classe base, não numa subclasse).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Cmd as cmdCloseTcc
    participant Def as DefenseService
    participant Sheet as Planilha (Proposals / Defenses)

    Responsável->>Nav: "Detalhes" do aluno → "Encerrar sem banca"
    Responsável->>Nav: Escolhe Desfecho (Desistência / Aproveitamento) + Parecer [+ Nota] → Encerrar
    Nav->>Cmd: google.script.run.cmdCloseTcc(proposalId, {outcome, parecer, nota})
    Cmd->>Def: closeWithoutDefense(role, email, proposalId, data)
    Def->>Def: _context(proposalId)
    Def->>Def: state.canCloseWithoutDefense(Responsável) — true em quase todo status
    alt já está num status terminal (Finalizado/NãoFinalizado/PorAproveitamento)
        Def-->>Cmd: throw Error("Este TCC já está encerrado.")
    else ainda pode encerrar
        Def->>Def: parecer vazio? recusa
        alt outcome === aproveitamento
            Def->>Def: valida a nota (0–10, vazio é erro, não zero)
            Def->>Sheet: _upsertGradeOnly — grava a nota onde a Média moraria (Defenses)
            Def->>Def: status = "TCC Finalizado por Aproveitamento"
        else outcome === desistência
            Def->>Def: status = "Não Finalizado"
        end
        Def->>Sheet: proposalDao.update(id, {Status: status})
        Def->>Def: logAction(..., parecer, destinatário: Aluno)
        Def-->>Cmd: {success:true}
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Responsável)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Responsável: tabela mestra — status terminal, TCC encerrado
```

## Notas

- `canCloseWithoutDefense` mora na classe **base** `TccState`, não numa
  subclasse — é a única permissão que vale independente do estado atual, e por
  isso é a única desligada explicitamente nos estados terminais
  (`FinishedState.canCloseWithoutDefense` retorna `false`).
- Campo de nota vazio é barrado **antes** da conversão numérica:
  `Number('')` é `0`, não `NaN` — sem essa guarda, "esqueci de digitar" viraria
  silenciosamente "nota zero".
