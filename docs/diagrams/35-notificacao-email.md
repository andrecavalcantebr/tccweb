# Notificação por E-mail — Cadeia de Chamadas

Mecanismo **transversal**: quase todo diagrama de transição de status
(18 a 33) termina chamando este. Fica enxertado no log de atividades porque
`EventLogService` já é o único lugar que sabe a fase e o **destinatário** de
cada transição — ver
[rationale 8.2](../rationale.md#82-a-notificação-é-enxertada-no-log).

Fontes: `src/ServiceEventLog.js` (`_recipientFor`, `_notify`, `logAction`),
`src/ServiceNotification.js` (`NotificationService.notifyStep`, `_addressFor`,
`_buildBody`, `mailTo`).

```mermaid
sequenceDiagram
    participant Serv as Qualquer serviço (Proposal/Committee/Defense)
    participant Log as EventLogService
    participant Notif as NotificationService
    participant Sheet as Planilha (Semesters / Proposals)
    participant Mail as MailApp

    Serv->>Log: logAction(proposalId, status, role, email, systemMessage, comment, toRole)
    Log->>Log: _append(...) — grava a(s) linha(s) em Events (nunca lança)
    Log->>Log: _recipientFor(status, role, toRole) — explícito, ou TCC_STATUS_RESPONSIBLE[status]
    alt sem destinatário (autor já é quem segura a bola — nota pública)
        Log->>Log: não notifica
    else há destinatário
        Log->>Notif: new NotificationService(semesterId).notifyStep({...})
        Notif->>Notif: isEnabled()? (NOTIFICATIONS_ENABLED !== 'false')
        alt desligado (rodada de depuração)
            Notif-->>Log: retorna sem enviar
        else ligado
            Notif->>Sheet: _semesterRow() — período pelo SheetId
            Notif->>Sheet: _proposal(proposalId)
            Notif->>Notif: _addressFor(recipientRole, proposal, semester)
            note right of Notif: Aluno/Orientador vêm da proposta; Responsável<br/>vem do período (alcança quem TEM o papel agora,<br/>não quem tinha quando o TCC começou)
            alt sem endereço resolvido
                Notif->>Notif: console.error — não envia
            else endereço resolvido
                Notif->>Notif: MailApp.getRemainingDailyQuota() > 0?
                Notif->>Mail: MailApp.sendEmail({to, subject, body})
                Notif->>Notif: _buildBody — link do sistema, do Doc, do trabalho, etc.
            end
        end
    end
```

## Notas

- **Uma ação, uma mensagem**: uma transição com comentário anexo produz duas
  linhas na timeline, mas o e-mail é um só — ver
  [rationale 8.4](../rationale.md#84-uma-ação-de-pessoa-é-um-e-mail).
- Nunca lança: uma falha de e-mail (cota esgotada, endereço ausente) não pode
  custar a transição que a gerou.
- Um caminho **separado** existe para quem não tem papel no fluxo — membro de
  banca convidado — via `NotificationService.mailTo` (usado por
  `_notifyPendingSigners` em
  [26-lancar-notas-assinar-orientador.md](26-lancar-notas-assinar-orientador.md)
  e por `_mailInvitation` em `PeopleService`): endereços nomeados diretamente,
  fora do mapa papel → e-mail.
