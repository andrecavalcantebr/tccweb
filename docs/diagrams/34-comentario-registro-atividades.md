# Comentário / Registro de Atividades — Cadeia de Chamadas

Mensagem avulsa na linha do tempo de um TCC, sem transição de status
associada — o vai e vem de Aluno e Orientador sem precisar abrir o Google Doc.
Ver [features/event-log.md](../features/event-log.md).

Fontes: `src/ui_comp_event_log.html` (`buildCommentBox`),
`src/ServiceEventLog.js` (`cmdAddComment`, `EventLogService.logComment`,
`_recipientFor`).

```mermaid
sequenceDiagram
    actor Pessoa as Aluno, Orientador ou Responsável
    participant Nav as Navegador (ui_comp_event_log)
    participant Cmd as cmdAddComment
    participant Auth as AuthService
    participant Log as EventLogService
    participant Sheet as Planilha (Events / Proposals)
    participant Notif as NotificationService

    Pessoa->>Nav: Escreve na caixa de comentário da linha do tempo → Enviar
    Nav->>Cmd: google.script.run.cmdAddComment(proposalId, message)
    Cmd->>Auth: getContext() + assertActiveSession()
    Cmd->>Sheet: proposalDao.getById(proposalId)
    Cmd->>Cmd: confere posse: Aluno só na própria; Orientador só nas que orienta
    alt sem permissão sobre esta proposta
        Cmd-->>Nav: throw Error("Você só pode comentar...")
    else autorizado
        Cmd->>Log: logComment(proposalId, statusAtual, role, email, message)
        Log->>Log: _recipientFor(status, role) — quem o fluxo está esperando, se não for quem escreveu
        Log->>Sheet: eventsDao.insert({Type:Comment, Role, Email, ToRole, Message, Timestamp})
        opt há destinatário (o autor não é quem já segura a bola)
            Log->>Notif: notifyStep({proposalId, status, recipientRole, comment})
            Notif->>Notif: MailApp.sendEmail(...)
            note right of Notif: Ver 35-notificacao-email.md
        end
        Cmd-->>Nav: {success:true, dashboard}
    end
    Nav-->>Pessoa: linha nova na timeline
```

## Notas

- Quando o autor já é quem segura a bola (ex.: Orientador comenta enquanto a
  proposta está com ele mesmo), `_recipientFor` devolve vazio — a entrada vira
  nota pública na timeline, sem e-mail nenhum saindo.
- `logComment` nunca lança por falha de log ou de e-mail — os dois engolem
  exceção e escrevem no console (ver
  [rationale 8.3](../rationale.md#83-log-e-e-mail-nunca-derrubam-a-transição)).
