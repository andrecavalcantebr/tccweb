# Entrega Final (RIU + PDF) — Cadeia de Chamadas

O aluno entrega em duas partes independentes — a versão final em PDF e o
comprovante de submissão no RIU — que podem chegar em momentos diferentes. O
status só avança quando **as duas** existem.

Fontes: `src/ui_app_dashboard_student.html` (`submitFinalWork`),
`src/ServiceDefense.js` (`cmdSubmitFinalWork`,
`DefenseService.submitFinalWork`).

```mermaid
sequenceDiagram
    actor Aluno
    participant Nav as Navegador (ui_app_dashboard_student)
    participant Cmd as cmdSubmitFinalWork
    participant Def as DefenseService
    participant Sheet as Planilha (Defenses / Proposals)
    participant Drive as DriveApp

    Aluno->>Nav: Envia o PDF final e/ou cola a URL do comprovante do RIU
    Nav->>Cmd: google.script.run.cmdSubmitFinalWork(proposalId, {file?, riuUrl?})
    Cmd->>Def: submitFinalWork(role, email, proposalId, data)
    Def->>Def: _context(proposalId)
    Def->>Def: state.canSubmitFinalWork(Aluno)? — só depois de Defesa Homologada
    Def->>Def: é o próprio aluno?

    opt veio arquivo
        Def->>Drive: _storePdf_ — grava em coluna PRÓPRIA (FinalWorkFileId)
        note right of Def: NÃO sobrescreve Proposals.WorkFileId — aquele é<br/>o arquivo que a banca julgou
    end
    opt veio URL do RIU
        Def->>Def: grava RiuReceiptUrl
    end
    alt nenhum dos dois veio
        Def-->>Cmd: throw Error("Envie o PDF final, o comprovante do RIU, ou os dois.")
    else pelo menos um veio
        Def->>Sheet: defenseDao.update(defenseId, patch)
        alt agora tem OS DOIS (arquivo + comprovante) e ainda não estava marcado
            Def->>Sheet: proposalDao.update(id, {Status:"TCC Final Submetido"})
            Def->>Def: logTransition(..., destinatário: Responsável)
        else falta um dos dois ainda
            note right of Def: Status não avança — reenviar o que falta é<br/>só chamar de novo, sem intervenção de ninguém
        end
        Def-->>Cmd: {success:true, complete}
    end
    Cmd->>Cmd: _dashboardPayloadForRole_(Aluno)
    Cmd-->>Nav: {success:true, dashboard}
    Nav-->>Aluno: painel — "TCC Final Submetido" quando completo
```

## Notas

- Reenviar continua liberado mesmo depois de completo, enquanto o Responsável
  não finalizar: trocar um arquivo errado não deveria exigir intervenção de
  ninguém.
