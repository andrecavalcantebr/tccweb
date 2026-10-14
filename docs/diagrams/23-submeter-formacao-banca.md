# Orientador Submete a Formação da Banca — Cadeia de Chamadas

O Orientador monta a banca (3 a 5 membros, ele presidente) depois de o aluno
concluir o Desenvolvimento. Reenviar enquanto ainda não homologada é correção,
não nova submissão — não existe devolução da banca pelo Responsável.

Fontes: `src/ui_app_dashboard_advisor.html` (`submitCommittee`),
`src/ServiceCommittee.js` (`cmdSubmitCommittee`,
`CommitteeService.submitCommittee`, `_validateMembers`).

```mermaid
sequenceDiagram
    actor Orientador
    participant Nav as Navegador (ui_app_dashboard_advisor)
    participant Cmd as cmdSubmitCommittee
    participant Comm as CommitteeService
    participant Sheet as Planilha (Committees / Proposals)

    Orientador->>Nav: Detalhe do orientando (TCC Concluído) → "Formar Banca"
    Orientador->>Nav: Preenche título final, data/hora, modo, membros (nome+e-mail cada) → Enviar
    Nav->>Cmd: google.script.run.cmdSubmitCommittee(proposalId, committeeData)
    Cmd->>Comm: submitCommittee(role, email, proposalId, committeeData)
    Comm->>Sheet: _loadProposal(proposalId) — confere é o Orientador desta proposta
    Comm->>Comm: state.canEditCommittee(Orientador)?
    Comm->>Comm: _validateMembers(members, advisorEmail)
    Comm->>Comm: 3 a 5 membros? exatamente 1 presidente? presidente == Orientador?
    alt validação falha
        Comm-->>Cmd: throw Error(mensagem específica)
    else válido
        Comm->>Sheet: dao.upsert(committeeId, {FinalTitle, DefenseDatetime, DefenseMode, MembersData})
        alt ainda não estava Banca Submetida
            Comm->>Sheet: proposalDao.update(id, {Status:"Banca Submetida"})
            Comm->>Comm: logTransition(..., "Banca submetida...", destinatário: Responsável)
        else já estava Submetida (reenvio)
            Comm->>Comm: logTransition(..., "Composição da banca corrigida...", destinatário: Responsável)
        end
        Comm-->>Cmd: {success:true, id}
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Orientador)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Orientador: painel — status "Banca Submetida"
```

## Notas

- Nenhum membro é convidado aqui — o convite automático só acontece na
  **homologação**, quando a banca deixa de ser proposta e vira compromisso.
  Ver [24-homologar-banca.md](24-homologar-banca.md).
