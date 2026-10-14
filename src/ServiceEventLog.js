/**
 * FILE: ServiceEventLog.js
 * DESC: Activity log of a TCC — one append-only row per entry in the Events
 *       sheet. Holds both what the system recorded (a status transition) and
 *       what people wrote (a comment), so the panels show a single timeline.
 * AUTH: Andre Cavalcante
 * DATE: August, 2026
 * LICENCE: GPL-v3
 */

class EventLogService {
  constructor(semesterId) {
    if (!semesterId) throw new Error("Semester ID is required for EventLogService");
    this.semesterId = semesterId;
  }

  _getDao() {
    return getSheetManager_(this.semesterId, DB_SHEETS.EVENTS, DB_COLS_EVENT.EVENT_ID);
  }

  /**
   * Who the entry is addressed to.
   *
   * For an action the caller passes it explicitly, because only the transition
   * knows it (approving sends the proposal to the Incharge; returning sends it
   * back to the Student). For a standalone comment it is derived from the
   * status: the message goes to whoever the flow is waiting on, and to nobody
   * when the writer is already the one holding the ball — in which case the
   * entry is simply a public note on the timeline.
   */
  _recipientFor(status, authorRole, explicitTo) {
    if (explicitTo) return explicitTo;
    const waitingOn = TCC_STATUS_RESPONSIBLE[status];
    return (waitingOn && waitingOn !== authorRole) ? waitingOn : '';
  }

  /**
   * Appends one entry. Never throws: losing a status transition because the log
   * failed would be far worse than a missing line in it — the log is a record
   * of the process, not part of it.
   */
  _append(proposalId, type, status, role, email, message, recipient) {
    try {
      const record = {};
      record[DB_COLS_EVENT.EVENT_ID]    = Utilities.getUuid();
      record[DB_COLS_EVENT.PROPOSAL_ID] = proposalId;
      record[DB_COLS_EVENT.PHASE]       = getStatusPhase(status);
      record[DB_COLS_EVENT.TYPE]        = type;
      record[DB_COLS_EVENT.ROLE]        = role;
      record[DB_COLS_EVENT.EMAIL]       = email || '';
      record[DB_COLS_EVENT.TO_ROLE]     = recipient;
      record[DB_COLS_EVENT.MESSAGE]     = message;
      record[DB_COLS_EVENT.TIMESTAMP]   = new Date().toISOString();
      this._getDao().insert(record);
    } catch(e) {
      console.error('EventLogService._append error:', e);
    }
  }

  /**
   * Mails the step to whoever the flow is now waiting on. Lives here because
   * this is the one place that already knows the recipient of every transition;
   * hooking it anywhere else would mean each service remembering to notify.
   *
   * Never throws, for the same reason _append does not: an e-mail that failed
   * to go out must not cost the transition that produced it.
   */
  _notify(proposalId, status, actorRole, recipient, systemMessage, comment) {
    try {
      if (!recipient) return; // a public note: nobody is waiting on it
      new NotificationService(this.semesterId).notifyStep({
        proposalId:    proposalId,
        status:        status,
        actorRole:     actorRole,
        recipientRole: recipient,
        systemMessage: systemMessage,
        comment:       comment
      });
    } catch(e) {
      console.error('EventLogService._notify error:', e);
    }
  }

  /**
   * Records a transition and, when there is one, the comment the actor wrote
   * along with it. Both rows carry the same recipient, and the two together
   * produce a SINGLE e-mail: one action by a person is one message to the next
   * person, however many lines it leaves on the timeline.
   */
  logAction(proposalId, status, role, email, systemMessage, comment, toRole) {
    const recipient = this._recipientFor(status, role, toRole);
    this._append(proposalId, EventType.SYSTEM, status, role, email, systemMessage, recipient);

    const text = (comment && String(comment).trim()) ? String(comment).trim() : '';
    if (text) {
      this._append(proposalId, EventType.COMMENT, status, role, email, text, recipient);
    }
    this._notify(proposalId, status, role, recipient, systemMessage, text);
  }

  /**
   * Records a transition. `status` is the status the TCC has just reached, so
   * the entry lands in the phase the process moved to.
   */
  logTransition(proposalId, status, role, email, message, toRole) {
    this.logAction(proposalId, status, role, email, message, '', toRole);
  }

  /** Records what a person wrote (with or without an action attached). */
  logComment(proposalId, status, role, email, message, toRole) {
    if (!message || !String(message).trim()) return;
    const recipient = this._recipientFor(status, role, toRole);
    this._append(proposalId, EventType.COMMENT, status, role, email, String(message).trim(), recipient);
    this._notify(proposalId, status, role, recipient, '', String(message).trim());
  }

  /** Every entry of a proposal, oldest first. */
  getByProposal(proposalId) {
    return this._getDao().getAll()
      .filter(row => row[DB_COLS_EVENT.PROPOSAL_ID] === proposalId)
      .map(row => this._eventPayload(row))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  _eventPayload(row) {
    return {
      type:      row[DB_COLS_EVENT.TYPE],
      role:      row[DB_COLS_EVENT.ROLE],
      email:     row[DB_COLS_EVENT.EMAIL],
      toRole:    row[DB_COLS_EVENT.TO_ROLE],
      message:   row[DB_COLS_EVENT.MESSAGE],
      timestamp: _isoTimestamp_(row[DB_COLS_EVENT.TIMESTAMP])
    };
  }

  /**
   * All entries indexed by proposal, oldest first. One read of the sheet serves
   * a whole dashboard — the Incharge's master table would otherwise do one per
   * student.
   */
  getAllGrouped() {
    const grouped = {};
    this._getDao().getAll().forEach(row => {
      const id = row[DB_COLS_EVENT.PROPOSAL_ID];
      if (!id) return;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(this._eventPayload(row));
    });
    Object.keys(grouped).forEach(id => {
      grouped[id].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    });
    return grouped;
  }
}

/**
 * Timestamps are written as ISO strings, but a sheet may hand a column back as
 * a Date once someone formats the column by hand — normalize either way.
 */
function _isoTimestamp_(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || '');
}

// ==========================================
// EXPOSED FRONT-END ENTRY POINT (google.script.run)
// ==========================================

/**
 * Writes a standalone comment on a TCC's timeline. Authorization is the same as
 * for the actions — Student on their own proposal, Advisor on their advisees,
 * Incharge on all — otherwise this would be an open write channel for any
 * authenticated user.
 */
function cmdAddComment(proposalId, message) {
  try {
    const auth = new AuthService();
    const ctx = auth.getContext();
    auth.assertActiveSession();
    if (!ctx.sheetId) throw new Error(semesterUnavailableMessage(ctx));
    if (ctx.role === UserRole.ERROR) throw new Error("Acesso não autorizado.");

    const text = String(message || '').trim();
    if (!text) throw new Error("Escreva a mensagem antes de enviar.");

    const proposalDao = getSheetManager_(ctx.sheetId, DB_SHEETS.PROPOSALS, DB_COLS_PROPOSAL.PROPOSAL_ID);
    const proposal = proposalDao.getById(proposalId);
    if (!proposal) throw new Error("Proposta não encontrada.");

    const who = _normalizeEmail_(ctx.email);
    if (ctx.role === UserRole.STUDENT &&
        _normalizeEmail_(proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL]) !== who) {
      throw new Error("Você só pode comentar na sua própria proposta.");
    }
    if (ctx.role === UserRole.ADVISOR &&
        _normalizeEmail_(proposal[DB_COLS_PROPOSAL.ADVISOR_EMAIL]) !== who) {
      throw new Error("Você só pode comentar nas propostas que orienta.");
    }

    new EventLogService(ctx.sheetId).logComment(
      proposalId, proposal[DB_COLS_PROPOSAL.STATUS], ctx.role, ctx.email, text
    );

    return { success: true, dashboard: _dashboardPayloadForRole_(ctx.role) };
  } catch (err) {
    console.error('Erro ao registrar comentário', err);
    return { success: false, msg: err.message };
  }
}
