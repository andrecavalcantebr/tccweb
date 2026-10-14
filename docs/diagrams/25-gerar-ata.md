# Gerar a Ata — Cadeia de Chamadas

O Orientador abre a Ata depois de a banca ser homologada. A defesa em si
acontece fora do sistema; o que nasce aqui é o registro que colhe notas e
assinaturas — com a composição da banca **congelada** no momento da criação, e
a chave de validação que vai impressa nos dois PDFs.

Fontes: `src/ui_app_dashboard_advisor.html` (`createMinutes`/`cmdCreateMinutes`),
`src/ServiceDefense.js` (`_executeDefenseCommand_`, `DefenseService.createMinutes`).

```mermaid
sequenceDiagram
    actor Orientador
    participant Nav as Navegador (ui_app_dashboard_advisor)
    participant Cmd as cmdCreateMinutes
    participant Def as DefenseService
    participant Sheet as Planilha (Defenses / Committees / Proposals)

    Orientador->>Nav: Detalhe do orientando (Banca Homologada) → "Gerar Ata"
    Nav->>Cmd: google.script.run.cmdCreateMinutes(proposalId)
    Cmd->>Def: createMinutes(role, email, proposalId)
    Def->>Sheet: _context(proposalId) — lê proposta + banca + (nenhuma) defesa ainda
    Def->>Def: state.canCreateMinutes(Orientador)? + _assertAdvisor
    alt banca não encontrada, ou Ata já existe
        Def-->>Cmd: throw Error(mensagem específica)
    else pode gerar
        Def->>Def: monta 1 linha por membro (nota:null, assinadoEm:'', assinatura:'')
        Def->>Def: _randomToken_(...) — chave de validação (10 caracteres)
        Def->>Sheet: defenseDao.insert(record) — DefenseId, MembersGrades, ValidationKey
        Def->>Sheet: proposalDao.update(id, {Status:"Ata Gerada"})
        Def->>Def: logTransition(..., destinatário: Orientador)
        Def-->>Cmd: {success:true}
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Orientador)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Orientador: painel — Ata aberta, pronta para lançar notas
```

## Notas

- A composição da banca fica congelada aqui: `MembersData` é copiado da banca
  no instante da criação, então uma alteração posterior na banca (não há tela
  para isso depois de homologada) não mudaria quem assina.
- Próximo passo: [26-lancar-notas-assinar-orientador.md](26-lancar-notas-assinar-orientador.md).
