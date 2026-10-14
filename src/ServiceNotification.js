/**
 * FILE: ServiceNotification.js — E-mail notification of each step of the flow.
 * DESC: Sends one message to whoever the flow is waiting on. Hooked into the
 *       activity log (ServiceEventLog.js), which is the single place that
 *       already knows the phase and the recipient of every transition.
 * AUTH: Andre Cavalcante
 * DATE: August, 2026
 * LICENCE: GPL-v3
 */

class NotificationService {
  constructor(semesterId) {
    if (!semesterId) throw new Error("Semester ID is required for NotificationService");
    this.semesterId = semesterId;
  }

  /**
   * On unless the property explicitly says otherwise. A notification system
   * that silently does nothing is a worse failure mode than one that has to be
   * turned off on purpose — set NOTIFICATIONS_ENABLED to 'false' in the Script
   * Properties while debugging in the cloud, so a round of tests does not turn
   * into a batch of real e-mails.
   */
  static isEnabled() {
    return PropertiesService.getScriptProperties()
      .getProperty('NOTIFICATIONS_ENABLED') !== 'false';
  }

  /**
   * The registry row of this term, looked up by its spreadsheet id — the only
   * handle the log has. Costs nothing in practice: the registry is already open
   * in this execution (see _openSpreadsheets in DaoSheets.js), and a state
   * change is rare compared to a panel load.
   */
  _semesterRow() {
    if (this._semester !== undefined) return this._semester;
    this._semester = null;
    const registryId = PropertiesService.getScriptProperties().getProperty('REGISTRY_SHEET_ID');
    if (registryId) {
      const dao = getSheetManager_(registryId, DB_SHEETS.SEMESTERS, DB_COLS_SEMESTER.SEMESTER);
      this._semester = dao.getAll()
        .find(sem => sem[DB_COLS_SEMESTER.SHEET_ID] === this.semesterId) || null;
    }
    return this._semester;
  }

  _proposal(proposalId) {
    return getSheetManager_(this.semesterId, DB_SHEETS.PROPOSALS, DB_COLS_PROPOSAL.PROPOSAL_ID)
      .getById(proposalId);
  }

  /**
   * Role -> address. Student and Advisor come from the proposal itself; the
   * Incharge from the term row, so that a change of Incharge mid-term reaches
   * whoever holds the role now, not whoever held it when the TCC started.
   */
  _addressFor(role, proposal, semester) {
    switch (role) {
      case UserRole.STUDENT:  return proposal ? proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL] : '';
      case UserRole.ADVISOR:  return proposal ? proposal[DB_COLS_PROPOSAL.ADVISOR_EMAIL] : '';
      case UserRole.INCHARGE: return semester ? semester[DB_COLS_SEMESTER.INCHARGE_EMAIL] : '';
      default: return '';
    }
  }

  _appUrl() {
    return getPublicAppUrl();
  }

  /**
   * The body. Files always travel as LINKS, never as attachments: MailApp caps
   * a message at 25 MB and a committee has 3 to 5 members, so attaching the
   * work itself would mail the whole file once per member.
   */
  _buildBody(params, proposal, semester) {
    const title  = proposal ? proposal[DB_COLS_PROPOSAL.TITLE] : '';
    const docId  = proposal ? proposal[DB_COLS_PROPOSAL.DOC_ID] : '';
    const workId = proposal ? proposal[DB_COLS_PROPOSAL.WORK_FILE_ID] : '';
    const appUrl = this._appUrl();

    const lines = [];
    if (params.systemMessage) lines.push(params.systemMessage);

    if (params.comment) {
      lines.push('', 'Mensagem do ' + params.actorRole + ':', '"' + params.comment + '"');
    }

    lines.push('');
    if (title) lines.push('TCC: ' + title);
    if (proposal) lines.push('Aluno: ' + proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL]);
    lines.push('Situação: ' + params.status);
    if (semester) lines.push('Período letivo: ' + String(semester[DB_COLS_SEMESTER.SEMESTER]).replace(/^'/, ''));

    lines.push('');
    if (appUrl) lines.push('Abra o sistema para agir: ' + appUrl);
    if (docId)  lines.push('Documento da proposta: https://docs.google.com/document/d/' + docId + '/edit');
    if (workId) lines.push('Trabalho enviado: https://drive.google.com/file/d/' + workId + '/view');

    lines.push(
      '',
      '— Mensagem automática do TCC-WebApp (FEEC/UFAM).',
      'Responder a este e-mail não registra nada: escreva no registro de',
      'atividades do TCC, dentro do sistema.'
    );
    return lines.join('\n');
  }

  /**
   * Manda uma mensagem a endereços nomeados, fora do mapa papel → e-mail.
   *
   * A Fase 4 precisa disto: quem assina a Ata é **membro da banca**, e membro de
   * banca não é um papel — é uma linha em MembersData. O convidado de outra
   * instituição não tem papel nenhum no fluxo e ainda assim precisa ser avisado
   * de que a assinatura dele está pendente.
   *
   * Mesmo contrato do resto: nunca lança, e respeita NOTIFICATIONS_ENABLED.
   */
  static mailTo(recipients, subject, lines) {
    try {
      if (!NotificationService.isEnabled()) return;

      const to = (recipients || []).filter(Boolean).join(',');
      if (!to) return;

      if (MailApp.getRemainingDailyQuota() <= 0) {
        console.error('NotificationService.mailTo: cota diária esgotada; ignorando.');
        return;
      }

      const url = getPublicAppUrl();

      const body = (lines || [])
        .concat(url ? ['', 'Abra o sistema: ' + url] : [])
        .concat(['', '— Mensagem automática do TCC-WebApp (FEEC/UFAM).'])
        .join('\n');

      MailApp.sendEmail({
        to: to,
        name: 'TCC-WebApp (FEEC/UFAM)',
        subject: '[TCC-WebApp] ' + subject,
        body: body
      });
    } catch(e) {
      console.error('NotificationService.mailTo error:', e);
    }
  }

  /**
   * Notifies one step. Returns silently — never throws — because losing an
   * e-mail must never cost the transition that produced it (same contract as
   * EventLogService._append).
   *
   * @param {{proposalId, status, actorRole, recipientRole, systemMessage, comment}} params
   */
  notifyStep(params) {
    try {
      if (!NotificationService.isEnabled()) return;
      if (!params || !params.recipientRole) return; // nobody is waiting on this

      const semester = this._semesterRow();
      const proposal = this._proposal(params.proposalId);
      const to = this._addressFor(params.recipientRole, proposal, semester);
      if (!to) {
        console.error('NotificationService: no address for role ' + params.recipientRole);
        return;
      }

      // The daily cap is the deploying account's, and it is shared with every
      // other send of the day. Skipping loudly beats throwing inside an action.
      if (MailApp.getRemainingDailyQuota() <= 0) {
        console.error('NotificationService: daily e-mail quota exhausted; skipping.');
        return;
      }

      const title = proposal ? String(proposal[DB_COLS_PROPOSAL.TITLE] || '') : '';
      const label = title || (proposal ? proposal[DB_COLS_PROPOSAL.STUDENT_EMAIL] : '');

      MailApp.sendEmail({
        to: to,
        name: 'TCC-WebApp (FEEC/UFAM)',
        subject: '[TCC-WebApp] ' + params.status + (label ? ' — ' + label : ''),
        body: this._buildBody(params, proposal, semester)
      });
    } catch(e) {
      console.error('NotificationService.notifyStep error:', e);
    }
  }
}
