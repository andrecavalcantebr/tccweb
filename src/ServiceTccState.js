/**
 * FILE: ServiceTccState.js
 * DESC: State pattern for the single TCC lifecycle status (TccStatus).
 *       Answers "who can do what" for a given status, across every phase of
 *       the flow. Shared by ServiceProposal.js, ServiceCommittee.js and the
 *       dashboard payloads (ServiceDashboard.js).
 * AUTH: Andre Cavalcante
 * DATE: July, 2026
 * LICENCE: GPL-v3
 */

class TccState {
  // Phase 1 — Proposta
  canEdit(userRole) { return false; }
  canSubmit(userRole) { return false; }
  canReturn(userRole) { return false; }
  canApprove(userRole) { return false; }
  canHomologate(userRole) { return false; }
  // Phase 2 — Desenvolvimento
  canConclude(userRole) { return false; }
  // Phase 3 — Banca
  canEditCommittee(userRole) { return false; }
  canHomologateCommittee(userRole) { return false; }
  // Phase 4 — Defesa
  canCreateMinutes(userRole) { return false; }
  canRecordVerdict(userRole) { return false; }
  canSignMinutes(userRole) { return false; }
  canAgree(userRole) { return false; }
  canHomologateDefense(userRole) { return false; }
  // Phase 5 — Encerramento
  canSubmitFinalWork(userRole) { return false; }
  canFinalize(userRole) { return false; }

  /**
   * Encerrar o TCC sem passar pela banca — aproveitamento de estudos ou
   * desistência (specs.md, "Fluxos Alternativos").
   *
   * Ao contrário de todas as outras, esta permissão é do Responsável em
   * QUALQUER estado, e por isso mora na classe base: um aluno desiste quando
   * desiste, e um aproveitamento pode chegar antes mesmo da primeira proposta.
   * Os estados terminais a desligam — encerrar o que já foi encerrado não é
   * correção, é sobrescrita de registro.
   */
  canCloseWithoutDefense(userRole) { return userRole === UserRole.INCHARGE; }
}

class NoProposalState extends TccState {
  // No record yet: the student may create one by saving the first draft.
  canEdit(userRole) { return userRole === UserRole.STUDENT; }
}

class ProposalDraftState extends TccState {
  canEdit(userRole) { return userRole === UserRole.STUDENT; }
  canSubmit(userRole) { return userRole === UserRole.STUDENT; }
}

class ProposalSubmittedState extends TccState {
  canEdit(userRole) { return false; } // Read-only until returned or approved
  canReturn(userRole) { return userRole === UserRole.ADVISOR; }
  canApprove(userRole) { return userRole === UserRole.ADVISOR; }
}

class ProposalReturnedState extends TccState {
  canEdit(userRole) { return userRole === UserRole.STUDENT; }
  canSubmit(userRole) { return userRole === UserRole.STUDENT; }
}

class ProposalApprovedState extends TccState {
  canHomologate(userRole) { return userRole === UserRole.INCHARGE; }
}

class DevelopmentState extends TccState {
  // Student is developing the TCC under the advisor's guidance (outside the
  // system); the only action available is concluding this phase.
  canConclude(userRole) { return userRole === UserRole.STUDENT; }
}

class ConcludedState extends TccState {
  // Development is over: the advisor now assembles the committee.
  canEditCommittee(userRole) { return userRole === UserRole.ADVISOR; }
}

class CommitteeSubmittedState extends TccState {
  // Awaiting the Incharge; the advisor may still fix and resubmit the data.
  canEditCommittee(userRole) { return userRole === UserRole.ADVISOR; }
  canHomologateCommittee(userRole) { return userRole === UserRole.INCHARGE; }
}

class CommitteeHomologatedState extends TccState {
  // A defesa acontece fora do sistema; o que o sistema faz é abrir a Ata.
  canCreateMinutes(userRole) { return userRole === UserRole.ADVISOR; }
}

// ---------------------------------------------------------------- Fase 4

class MinutesCreatedState extends TccState {
  // Ata aberta: o Orientador lança notas e parecer, e fecha assinando.
  canRecordVerdict(userRole) { return userRole === UserRole.ADVISOR; }
}

class MinutesInSignaturesState extends TccState {
  /**
   * Assinar é o único ato do fluxo que NÃO se decide por papel.
   *
   * Quem assina é membro da banca, e um membro pode ser um professor que não
   * orienta este aluno, ou um convidado de outra instituição — os dois entram
   * com papel de Orientador. O papel diz apenas que a pessoa não é o Aluno; o
   * direito vem de estar em MembersData, conferido por DefenseService.
   */
  canSignMinutes(userRole) { return userRole !== UserRole.STUDENT; }

  /**
   * O "de acordo" do aluno é a última assinatura, e só fica disponível quando
   * todos os membros já assinaram — quem verifica isso é o serviço, que tem a
   * lista; aqui só se diz que o Aluno é quem pode.
   */
  canAgree(userRole) { return userRole === UserRole.STUDENT; }
}

class MinutesSignedState extends TccState {
  // Ata completa. Fechar a fase é ato administrativo do Responsável.
  canHomologateDefense(userRole) { return userRole === UserRole.INCHARGE; }
}

// ---------------------------------------------------------------- Fase 5

class DefenseHomologatedState extends TccState {
  // Revisão, RIU e entrega final correm por conta do aluno.
  canSubmitFinalWork(userRole) { return userRole === UserRole.STUDENT; }
}

class FinalWorkSubmittedState extends TccState {
  // Reenviar continua liberado enquanto o Responsável não fecha: o comprovante
  // do RIU pode chegar depois do PDF, e trocar um arquivo errado não deveria
  // exigir intervenção de ninguém.
  canSubmitFinalWork(userRole) { return userRole === UserRole.STUDENT; }
  canFinalize(userRole) { return userRole === UserRole.INCHARGE; }
}

/** Fim de linha: nada mais acontece, nem por override do Responsável. */
class FinishedState extends TccState {
  canCloseWithoutDefense(userRole) { return false; }
}

class ViewOnlyState extends TccState {
  // Completely locked fallback
}

class TccStateFactory {
  static create(statusString) {
    switch(statusString) {
      case TccStatus.NO_PROPOSAL:           return new NoProposalState();
      case TccStatus.PROPOSAL_DRAFT:        return new ProposalDraftState();
      case TccStatus.PROPOSAL_SUBMITTED:    return new ProposalSubmittedState();
      case TccStatus.PROPOSAL_RETURNED:     return new ProposalReturnedState();
      case TccStatus.PROPOSAL_APPROVED:     return new ProposalApprovedState();
      case TccStatus.IN_DEVELOPMENT:        return new DevelopmentState();
      case TccStatus.TCC_CONCLUDED:         return new ConcludedState();
      case TccStatus.COMMITTEE_SUBMITTED:   return new CommitteeSubmittedState();
      case TccStatus.COMMITTEE_HOMOLOGATED: return new CommitteeHomologatedState();
      case TccStatus.MINUTES_CREATED:       return new MinutesCreatedState();
      case TccStatus.MINUTES_IN_SIGNATURES: return new MinutesInSignaturesState();
      case TccStatus.MINUTES_SIGNED:        return new MinutesSignedState();
      case TccStatus.DEFENSE_HOMOLOGATED:   return new DefenseHomologatedState();
      case TccStatus.FINAL_WORK_SUBMITTED:  return new FinalWorkSubmittedState();
      case TccStatus.FINISHED:              return new FinishedState();
      case TccStatus.FINISHED_BY_CREDIT:    return new FinishedState();
      case TccStatus.NOT_FINISHED:          return new FinishedState();
      default: return new ViewOnlyState();
    }
  }
}
