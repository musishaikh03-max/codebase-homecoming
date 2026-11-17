import {
  ASSESSMENT_DECISION,
  AssessmentDecision,
  CaseRecord,
  CLARIFICATION_REVIEW,
  CLARIFICATION_STATUS,
  CLARIFICATION_TERMINAL,
  ClarificationDetails,
  ClarificationReviewOutcome,
  ClarificationRound,
  Correspondence,
  CORRESPONDENCE_STATUS,
  CorrespondenceTemplate,
  HOLD_TYPE,
  NO_RESPONSE_OUTCOME,
  NoResponseOutcome,
  displayDueDate,
  CORRESPONDENCE_TYPE,
} from './types';
import { draftLetter } from './templates';

export type ClarificationStep =
  | 'assess' | 'draft' | 'approval' | 'dispatch' | 'delivery-failed'
  | 'hold' | 'response' | 'review' | 'resume' | 'complete' | 'done';

export const isActiveRound = (round: ClarificationRound) => !CLARIFICATION_TERMINAL.includes(round.status);

export function roundsForCase(rounds: ClarificationRound[], caseId: string) {
  return rounds.filter(round => round.caseId === caseId).sort((a, b) => a.round - b.round);
}

export function activeRound(rounds: ClarificationRound[], caseId: string) {
  return roundsForCase(rounds, caseId).find(isActiveRound);
}

/** A clarification hold is open on the case clock (hold type recorded as Clarification). */
export function clarificationHoldActive(caseRecord: CaseRecord) {
  return caseRecord.clock.state === 'Hold recorded' && caseRecord.clock.holdType === HOLD_TYPE.CLARIFICATION;
}

export function nextStep(round: ClarificationRound, notice: Correspondence | undefined, caseRecord: CaseRecord): ClarificationStep {
  switch (round.status) {
    case CLARIFICATION_STATUS.ASSESSMENT:
    case CLARIFICATION_STATUS.INTERNAL_REVIEW:
      return 'assess';
    case CLARIFICATION_STATUS.PREPARING_NOTICE:
      if (!notice || notice.status === CORRESPONDENCE_STATUS.DRAFT) return 'draft';
      if (notice.status === CORRESPONDENCE_STATUS.PENDING_APPROVAL) return 'approval';
      if (notice.status === CORRESPONDENCE_STATUS.APPROVED) return 'dispatch';
      if (notice.status === CORRESPONDENCE_STATUS.DELIVERY_FAILED) return 'delivery-failed';
      return round.holdDecision ? 'response' : 'hold';
    case CLARIFICATION_STATUS.AWAITING_RESPONSE:
      return round.holdDecision ? 'response' : 'hold';
    case CLARIFICATION_STATUS.REVIEWING_RESPONSE:
      return 'review';
    case CLARIFICATION_STATUS.OUTCOME_RECORDED:
      return clarificationHoldActive(caseRecord) ? 'resume' : 'complete';
    default:
      return 'done';
  }
}

export const STEP_LABEL: Record<ClarificationStep, string> = {
  assess: 'Assess clarification need',
  draft: 'Prepare clarification notice',
  approval: 'Review clarification notice for approval',
  dispatch: 'Record dispatch of clarification notice',
  'delivery-failed': 'Retry or escalate failed delivery',
  hold: 'Record clock hold decision',
  response: 'Track requester response',
  review: 'Review requester response and record clarified scope',
  resume: 'Resume processing clock',
  complete: 'Complete clarification',
  done: 'Clarification complete',
};

/** Ordered lifecycle stages shown in the progress indicator. */
export const STAGES: Array<{ key: string; label: string; steps: ClarificationStep[] }> = [
  { key: 'assess', label: 'Assess', steps: ['assess'] },
  { key: 'draft', label: 'Draft', steps: ['draft'] },
  { key: 'approval', label: 'Approval', steps: ['approval'] },
  { key: 'dispatch', label: 'Dispatch', steps: ['dispatch', 'delivery-failed'] },
  { key: 'hold', label: 'Clock decision', steps: ['hold'] },
  { key: 'response', label: 'Response', steps: ['response'] },
  { key: 'review', label: 'Review & scope', steps: ['review'] },
  { key: 'resume', label: 'Resume clock', steps: ['resume'] },
  { key: 'complete', label: 'Complete', steps: ['complete', 'done'] },
];
export const stageIndex = (step: ClarificationStep) => STAGES.findIndex(stage => stage.steps.includes(step));

export interface ClarificationGate {
  roundId?: string;
  round?: number;
  step: ClarificationStep | 'start';
  label: string;
}

/**
 * The outstanding clarification action for a case, or null when clarification does not block
 * progression. Used for Next Action, and to block search planning and closure until resolved.
 */
export function clarificationGate(rounds: ClarificationRound[], correspondence: Correspondence[], caseRecord: CaseRecord): ClarificationGate | null {
  if (caseRecord.status === 'Closed') return null;
  const round = activeRound(rounds, caseRecord.id);
  if (round) {
    const notice = round.noticeId ? correspondence.find(item => item.id === round.noticeId) : undefined;
    const step = nextStep(round, notice, caseRecord);
    if (step === 'done') return null;
    return { roundId: round.id, round: round.round, step, label: stepLabel(round, notice, caseRecord) };
  }
  if (caseRecord.needsClarification) return { step: 'start', label: 'Start clarification' };
  return null;
}

export function stepLabel(round: ClarificationRound, notice: Correspondence | undefined, caseRecord: CaseRecord) {
  const step = nextStep(round, notice, caseRecord);
  if (step === 'assess' && round.status === CLARIFICATION_STATUS.INTERNAL_REVIEW) return 'Record internal review outcome';
  if (step === 'draft' && notice?.returnedReason) return 'Revise returned clarification notice';
  if (step === 'draft' && notice) return 'Edit and submit clarification notice';
  return STEP_LABEL[step];
}

export type FieldErrors = Partial<Record<string, string>>;

export function validateAssessment(details: ClarificationDetails, decision: AssessmentDecision | '', rationale: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!details.reason.trim()) errors.reason = 'Enter the clarification reason.';
  if (!details.ambiguity.trim()) errors.ambiguity = 'Describe what is unclear or missing.';
  if (!decision) errors.decision = 'Choose a decision.';
  if (!rationale.trim()) errors.rationale = 'Explain the reason for this decision.';
  if (decision === ASSESSMENT_DECISION.CLARIFY) {
    if (!details.informationNeeded.trim()) errors.informationNeeded = 'State what information is needed from the requester.';
    if (!details.questions.some(question => question.trim())) errors.questions = 'Add at least one focused question for the requester.';
  }
  if (decision === ASSESSMENT_DECISION.PROCEED && !details.processableScope.trim()) errors.processableScope = 'Describe the scope that will be processed.';
  return errors;
}

/** Response is late when it arrives after an explicitly recorded due date, or after the hold for this round was already ended. */
export function lateResponse(round: ClarificationRound, receivedDate: string, holdEndedOn?: string): { late: boolean; basis?: string } {
  if (round.responseDue?.date && receivedDate > round.responseDue.date) return { late: true, basis: `Received after the recorded response due date (${displayDueDate(round.responseDue.date)}).` };
  if (holdEndedOn && receivedDate > holdEndedOn) return { late: true, basis: `Received after the recorded hold period ended (${displayDueDate(holdEndedOn)}).` };
  return { late: false };
}

export const reviewNeedsScope = (outcome: ClarificationReviewOutcome | '') => outcome === CLARIFICATION_REVIEW.RESOLVED || outcome === CLARIFICATION_REVIEW.PARTIAL || outcome === CLARIFICATION_REVIEW.PROCEED_AVAILABLE;
export const reviewNeedsRemaining = (outcome: ClarificationReviewOutcome | '') => outcome === CLARIFICATION_REVIEW.PARTIAL || outcome === CLARIFICATION_REVIEW.FURTHER || outcome === CLARIFICATION_REVIEW.PROCEED_AVAILABLE;
export const noResponseNeedsScope = (outcome: NoResponseOutcome | '') => outcome === NO_RESPONSE_OUTCOME.PROCEED_AVAILABLE;

/** Builds the notice from the approved clarification wording plus the recorded ambiguity and questions only. */
export function composeNotice(_template: CorrespondenceTemplate | undefined, caseRecord: CaseRecord, details: ClarificationDetails, templates: CorrespondenceTemplate[] = []) {
  const questions = details.questions.map(item => item.trim()).filter(Boolean);
  const detailText = [
    details.ambiguity.trim() ? `What we need clarified: ${details.ambiguity.trim()}` : '',
    details.affectedPortion.trim() ? `This concerns the following part of your request: "${details.affectedPortion.trim()}"` : '',
  ].filter(Boolean).join('\n\n');
  const questionText = questions.length ? `Please answer the following:\n${questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}` : '';
  const { subject, body } = draftLetter(_template ? [_template, ...templates] : templates, CORRESPONDENCE_TYPE.CLARIFICATION, caseRecord, { clarificationDetails: detailText, clarificationQuestions: questionText });
  return { subject, body };
}

export const emptyDetails = (reason = ''): ClarificationDetails => ({
  reason, ambiguity: '', affectedPortion: '', informationNeeded: '', processableScope: '', questions: [''], internalNotes: '',
});
