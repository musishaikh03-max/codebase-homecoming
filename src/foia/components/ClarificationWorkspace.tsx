import { FormEvent, useEffect, useState } from 'react';
import {
  activeRound, clarificationHoldActive, emptyDetails, FieldErrors, nextStep, noResponseNeedsScope, reviewNeedsRemaining, reviewNeedsScope,
  roundsForCase, stepLabel, validateAssessment,
} from '../clarification';
import { can } from '../permissions';
import { useStore } from '../store';
import {
  ASSESSMENT_DECISION, AssessmentDecision, CaseRecord, CASE_STATUS, CLARIFICATION_REVIEW, ClarificationDetails, ClarificationReviewOutcome,
  ClarificationRound, CLARIFICATION_STATUS, displayDueDate, LATE_CLOCK_DECISION, NO_RESPONSE_OUTCOME, NoResponseOutcome,
} from '../types';
import NoticeActions, { noticeStateLabel } from './NoticeActions';

const STEPS: Array<[string, string]> = [
  ['assess', 'Assess'], ['notice', 'Notice'], ['dispatch', 'Dispatch'], ['hold', 'Clock decision'], ['response', 'Response'], ['review', 'Review'], ['complete', 'Complete'],
];
const stepGroup = (step: string) => step === 'draft' || step === 'approval' ? 'notice' : step === 'delivery-failed' ? 'dispatch' : step === 'resume' ? 'complete' : step === 'done' ? 'done' : step;

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return <label className={error ? 'field-invalid' : ''}>{label}{children}{hint && <small>{hint}</small>}{error && <span className="field-error" role="alert">{error}</span>}</label>;
}

function RoundSummary({ round }: { round: ClarificationRound }) {
  const last = round.assessments[round.assessments.length - 1];
  return <dl className="detail-list detail-list--compact">
    <div><dt>Entry point</dt><dd>{round.entryPoint}</dd></div>
    <div><dt>Reason</dt><dd>{round.details.reason || 'Not recorded'}</dd></div>
    {round.details.ambiguity && <div><dt>Unclear or missing</dt><dd>{round.details.ambiguity}</dd></div>}
    {round.details.questions.filter(Boolean).length > 0 && <div><dt>Questions</dt><dd>{round.details.questions.filter(Boolean).map((q, i) => `${i + 1}. ${q}`).join(' ')}</dd></div>}
    {last && <div><dt>Assessment</dt><dd>{last.decision} – {last.rationale} ({last.by})</dd></div>}
    {round.holdDecision && <div><dt>Clock decision</dt><dd>{round.holdDecision.outcome} – {round.holdDecision.reason} ({round.holdDecision.by}{round.holdDecision.effectiveDate ? `, effective ${displayDueDate(round.holdDecision.effectiveDate)}` : ''})</dd></div>}
    {round.responseDue && <div><dt>Response due (recorded)</dt><dd>{displayDueDate(round.responseDue.date)} – {round.responseDue.basis}</dd></div>}
    {round.reminders.length > 0 && <div><dt>Reminders</dt><dd>{round.reminders.map(item => `${displayDueDate(item.date)} by ${item.method}`).join('; ')}</dd></div>}
    {round.response && <div><dt>Response received</dt><dd>{displayDueDate(round.response.receivedDate)}{round.response.reference ? ` (ref. ${round.response.reference})` : ''} – {round.response.summary || 'See correspondence'}{round.response.late ? ` · ${round.response.lateBasis}` : ''}</dd></div>}
    {round.noResponseDecisions.map((item, index) => <div key={index}><dt>No-response decision</dt><dd>{item.outcome} – {item.rationale} ({item.by})</dd></div>)}
    {round.review && <div><dt>Review outcome</dt><dd>{round.review.outcome} – {round.review.rationale}</dd></div>}
    {round.lateClockDecision && <div><dt>Late-response clock decision</dt><dd>{round.lateClockDecision.decision} – {round.lateClockDecision.rationale}</dd></div>}
    {round.completion && <div><dt>Next action recorded</dt><dd>{round.completion.nextAction} ({round.completion.by}, {new Date(round.completion.at).toLocaleDateString()})</dd></div>}
  </dl>;
}

export default function ClarificationWorkspace({ caseRecord }: { caseRecord: CaseRecord }) {
  const store = useStore();
  const { state } = store;
  const role = state.ui.roleView;
  const rounds = roundsForCase(state.clarificationRounds, caseRecord.id);
  const round = activeRound(state.clarificationRounds, caseRecord.id);
  const notice = round?.noticeId ? state.correspondence.find(item => item.id === round.noticeId) : undefined;
  const step = round ? nextStep(round, notice, caseRecord) : 'done';
  const group = stepGroup(step);
  const mayManage = can(role, 'manageClarification');
  const closed = caseRecord.status === CASE_STATUS.CLOSED;
  const past = rounds.filter(item => item.id !== round?.id).reverse();

  const [details, setDetails] = useState<ClarificationDetails>(round?.details || emptyDetails());
  const [decision, setDecision] = useState<AssessmentDecision | ''>('');
  const [rationale, setRationale] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  useEffect(() => { setDetails(round?.details ? { ...round.details, questions: round.details.questions.length ? round.details.questions : [''] } : emptyDetails()); setErrors({}); setDecision(''); setRationale(''); }, [round?.id, round?.status]);

  const submitAssessment = (event: FormEvent) => {
    event.preventDefault();
    if (!round) return;
    const found = validateAssessment(details, decision, rationale);
    setErrors(found);
    if (Object.keys(found).length || !decision) return;
    store.recordAssessment(round.id, details, decision, rationale);
  };

  const [hold, setHold] = useState({ applies: '' as '' | 'yes' | 'no', reason: '', effectiveDate: '', reference: '', authorisation: '' });
  const [holdError, setHoldError] = useState('');
  const submitHold = (event: FormEvent) => {
    event.preventDefault();
    if (!round) return;
    if (!hold.applies) return setHoldError('Choose whether a clock hold applies.');
    if (!hold.reason.trim()) return setHoldError('Enter the reason for this decision.');
    if (hold.applies === 'yes' && caseRecord.clock.state !== 'Hold recorded' && !hold.effectiveDate) return setHoldError('Enter the effective hold date.');
    if (store.decideClarificationHold(round.id, { applies: hold.applies === 'yes', reason: hold.reason, effectiveDate: hold.effectiveDate || undefined, reference: hold.reference, authorisation: hold.authorisation })) setHoldError('');
    else setHoldError('The decision could not be recorded. Check your role and the entered dates.');
  };

  const [due, setDue] = useState({ date: '', basis: '' });
  const [reminder, setReminder] = useState({ date: '', method: '', note: '' });
  const [response, setResponse] = useState({ receivedDate: '', summary: '', reference: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [noResponse, setNoResponse] = useState({ outcome: '' as NoResponseOutcome | '', rationale: '', scope: '', remainingAmbiguity: '' });
  const [panel, setPanel] = useState<'response' | 'none' | 'due' | 'reminder' | null>(null);

  const [review, setReview] = useState({ outcome: '' as ClarificationReviewOutcome | '', resolvedItems: '', remainingItems: '', rationale: '', scope: '', changeSummary: '', lateDecision: '', lateDate: '', lateRationale: '' });
  const [reviewError, setReviewError] = useState('');
  const submitReview = (event: FormEvent) => {
    event.preventDefault();
    if (!round || !review.outcome) return setReviewError('Choose the review outcome.');
    if (!review.rationale.trim()) return setReviewError('Explain the reason for this outcome.');
    if (reviewNeedsScope(review.outcome) && !review.scope.trim()) return setReviewError('Record the scope that will be processed.');
    if (reviewNeedsRemaining(review.outcome) && !review.remainingItems.trim()) return setReviewError('Record what remains unresolved.');
    if (round.response?.late && (!review.lateDecision || !review.lateRationale.trim())) return setReviewError('Record the late-response clock decision and its basis.');
    const ok = store.reviewClarificationResponse(round.id, {
      outcome: review.outcome, resolvedItems: review.resolvedItems, remainingItems: review.remainingItems, rationale: review.rationale,
      scope: reviewNeedsScope(review.outcome) ? { scope: review.scope, changeSummary: review.changeSummary } : undefined,
      lateClock: round.response?.late ? { decision: review.lateDecision, effectiveDate: review.lateDate || undefined, rationale: review.lateRationale } : undefined,
    });
    setReviewError(ok ? '' : 'The review could not be recorded.');
  };

  const [resume, setResume] = useState({ effectiveDate: '', reason: '', reference: '' });
  const [completion, setCompletion] = useState('Continue processing: plan the records search');

  if (!round && !rounds.length && !caseRecord.needsClarification) {
    return <section className="workspace-section" id="clarification">
      <div className="workspace-section-title"><h2>Clarification</h2>{mayManage && !closed && <button className="button button--secondary" onClick={() => store.startClarification(caseRecord.id)}>Start clarification</button>}</div>
      <p className="form-help">No clarification has been recorded for this case. Start one if the request wording, scope or required information is unclear.</p>
    </section>;
  }

  return <section className="workspace-section" id="clarification" aria-labelledby="clarification-title">
    <div className="workspace-section-title">
      <h2 id="clarification-title">Clarification{round ? ` · Round ${round.round}` : ''}</h2>
      {!round && mayManage && !closed && <button className="button button--secondary" onClick={() => store.startClarification(caseRecord.id)}>{rounds.length ? 'Start another round' : 'Start clarification'}</button>}
    </div>
    {round && <>
      <ol className="clar-steps" aria-label="Clarification progress">{STEPS.map(([key, label]) => {
        const index = STEPS.findIndex(([k]) => k === key);
        const current = STEPS.findIndex(([k]) => k === group);
        const status = key === group ? 'current' : index < current ? 'done' : 'todo';
        return <li key={key} className={`clar-step clar-step--${status}`} aria-current={status === 'current' ? 'step' : undefined}><span>{status === 'done' ? '✓' : index + 1}</span>{label}</li>;
      })}</ol>
      <dl className="clar-status">
        <div><dt>Clarification</dt><dd>{round.status}</dd></div>
        <div><dt>Notice</dt><dd>{notice ? noticeStateLabel(notice) : 'Not drafted'}</dd></div>
        <div><dt>Clock</dt><dd>{caseRecord.clock.state}{clarificationHoldActive(caseRecord) && caseRecord.clock.holdSince ? ` since ${displayDueDate(caseRecord.clock.holdSince)}` : ''}</dd></div>
        <div><dt>Next step</dt><dd>{stepLabel(round, notice, caseRecord)}</dd></div>
      </dl>
    </>}

    {round && !mayManage && <p className="form-help">Your role can view this clarification but cannot record steps.</p>}

    {round && mayManage && <div className="clar-panel">
      {step === 'assess' && <form onSubmit={submitAssessment} className="inline-action-form" noValidate aria-label="Assess clarification">
        <h3>{round.status === CLARIFICATION_STATUS.INTERNAL_REVIEW ? 'Record the internal review outcome' : 'Assess whether clarification is needed'}</h3>
        <div className="original-request"><strong>Original request (unchanged)</strong><p>{caseRecord.description || caseRecord.title}</p></div>
        <Field label="Clarification reason" error={errors.reason}><input value={details.reason} onChange={event => setDetails({ ...details, reason: event.target.value })}/></Field>
        <Field label="What is unclear or missing" error={errors.ambiguity}><textarea value={details.ambiguity} onChange={event => setDetails({ ...details, ambiguity: event.target.value })}/></Field>
        <Field label="Affected part of the request (optional)"><input value={details.affectedPortion} onChange={event => setDetails({ ...details, affectedPortion: event.target.value })}/></Field>
        <Field label="Information needed from the requester" error={errors.informationNeeded}><textarea value={details.informationNeeded} onChange={event => setDetails({ ...details, informationNeeded: event.target.value })}/></Field>
        <fieldset className={errors.questions ? 'field-invalid' : ''}><legend>Questions for the requester</legend>
          {details.questions.map((question, index) => <div className="question-row" key={index}><input aria-label={`Question ${index + 1}`} value={question} onChange={event => setDetails({ ...details, questions: details.questions.map((q, i) => i === index ? event.target.value : q) })}/>{details.questions.length > 1 && <button type="button" className="text-action" onClick={() => setDetails({ ...details, questions: details.questions.filter((_, i) => i !== index) })}>Remove</button>}</div>)}
          <button type="button" className="text-action" onClick={() => setDetails({ ...details, questions: [...details.questions, ''] })}>Add question</button>
          {errors.questions && <span className="field-error" role="alert">{errors.questions}</span>}
        </fieldset>
        <Field label="Could the request be processed as written? Describe the processable scope" error={errors.processableScope}><textarea value={details.processableScope} onChange={event => setDetails({ ...details, processableScope: event.target.value })}/></Field>
        <Field label="Internal notes (not sent to the requester)"><textarea value={details.internalNotes} onChange={event => setDetails({ ...details, internalNotes: event.target.value })}/></Field>
        <fieldset className={errors.decision ? 'field-invalid' : ''}><legend>Decision</legend>
          {Object.values(ASSESSMENT_DECISION).map(item => <label className="radio-label" key={item}><input type="radio" name="assessment" checked={decision === item} onChange={() => setDecision(item)}/>{item}</label>)}
          {errors.decision && <span className="field-error" role="alert">{errors.decision}</span>}
        </fieldset>
        <Field label="Reason for this decision" error={errors.rationale}><textarea value={rationale} onChange={event => setRationale(event.target.value)}/></Field>
        <div className="form-actions"><button className="button button--primary">Record assessment</button></div>
      </form>}

      {(step === 'draft' && !notice) && <div className="inline-action-form"><h3>Draft the clarification notice</h3><p className="form-help">The letter is built from the approved clarification wording, the recorded ambiguity and your questions.</p><div className="form-actions"><button className="button button--primary" disabled={!can(role, 'composeCorrespondence')} onClick={() => store.draftClarificationNotice(round.id)}>Create draft letter</button></div></div>}
      {notice && ['draft', 'approval', 'dispatch', 'delivery-failed'].includes(step) && <div className="inline-action-form"><h3>{stepLabel(round, notice, caseRecord)}</h3>
        {step === 'draft' && <div className="form-actions"><button className="text-action" onClick={() => store.draftClarificationNotice(round.id)}>Rebuild letter from recorded questions</button></div>}
        <NoticeActions notice={notice} caseRecord={caseRecord}/></div>}

      {step === 'hold' && <form className="inline-action-form" onSubmit={submitHold} aria-label="Clock hold decision">
        <h3>Does a processing clock hold apply?</h3>
        <p className="form-help">Awaiting clarification does not by itself place the clock on hold. Apply a hold only where the agency rule permits it.</p>
        <fieldset><legend>Decision</legend>
          <label className="radio-label"><input type="radio" name="hold" checked={hold.applies === 'yes'} onChange={() => setHold({ ...hold, applies: 'yes' })}/>Yes – apply a hold</label>
          <label className="radio-label"><input type="radio" name="hold" checked={hold.applies === 'no'} onChange={() => setHold({ ...hold, applies: 'no' })}/>No – track the response without a hold</label>
        </fieldset>
        <label>Reason<textarea value={hold.reason} onChange={event => setHold({ ...hold, reason: event.target.value })}/></label>
        {hold.applies === 'yes' && <>
          <label>Effective hold date<input type="date" value={hold.effectiveDate} onChange={event => setHold({ ...hold, effectiveDate: event.target.value })}/></label>
          <label>Authorisation (optional)<input value={hold.authorisation} onChange={event => setHold({ ...hold, authorisation: event.target.value })}/></label>
          <label>Supporting reference (optional)<input value={hold.reference} onChange={event => setHold({ ...hold, reference: event.target.value })}/></label>
        </>}
        {holdError && <p className="form-error" role="alert">{holdError}</p>}
        {!can(role, 'manageClock') && <p className="form-help">Only a Processor, Supervisor / QC or Administrator can record this decision.</p>}
        <div className="form-actions"><button className="button button--primary" disabled={!can(role, 'manageClock')}>Record clock decision</button></div>
      </form>}

      {step === 'response' && <div className="inline-action-form">
        <h3>Awaiting requester response</h3>
        <p className="form-help">Notice sent {notice?.sentAt ? displayDueDate(notice.sentAt.slice(0, 10)) : '—'} · {round.holdDecision?.outcome}. {round.responseDue ? `Response due (recorded): ${displayDueDate(round.responseDue.date)}.` : 'No response due date recorded.'}</p>
        <div className="form-actions">
          <button className="button button--primary" onClick={() => setPanel('response')}>Record response</button>
          <button className="button button--secondary" onClick={() => setPanel('none')}>Record no-response decision</button>
          <button className="button button--secondary" onClick={() => setPanel('due')}>{round.responseDue ? 'Change response due date' : 'Record response due date'}</button>
          <button className="button button--secondary" onClick={() => setPanel('reminder')}>Record reminder</button>
        </div>
        {panel === 'response' && <form className="inline-action-form" aria-label="Record response" onSubmit={event => { event.preventDefault(); if (store.recordClarificationResponse(round.id, { ...response, files: files.map(file => ({ name: file.name, sizeKb: Math.round(file.size / 1024), mime: file.type || 'application/octet-stream' })) })) { setPanel(null); setResponse({ receivedDate: '', summary: '', reference: '' }); setFiles([]); } }}>
          <label>Received date<input type="date" value={response.receivedDate} onChange={event => setResponse({ ...response, receivedDate: event.target.value })} required/></label>
          <label>Response content or summary<textarea value={response.summary} onChange={event => setResponse({ ...response, summary: event.target.value })} required/></label>
          <label>Reference (optional)<input value={response.reference} onChange={event => setResponse({ ...response, reference: event.target.value })}/></label>
          <label>Documents (optional; file details recorded)<input type="file" multiple onChange={event => setFiles(Array.from(event.target.files || []))}/></label>
          <div className="form-actions"><button type="button" className="button button--secondary" onClick={() => setPanel(null)}>Cancel</button><button className="button button--primary" disabled={!response.receivedDate || !response.summary.trim()}>Save response</button></div>
        </form>}
        {panel === 'none' && <form className="inline-action-form" aria-label="No-response decision" onSubmit={event => { event.preventDefault(); if (!noResponse.outcome) return; if (store.recordNoResponseDecision(round.id, { outcome: noResponse.outcome, rationale: noResponse.rationale, scope: noResponse.scope, remainingAmbiguity: noResponse.remainingAmbiguity })) { setPanel(null); setNoResponse({ outcome: '', rationale: '', scope: '', remainingAmbiguity: '' }); } }}>
          <p className="form-help">Nothing happens automatically when a date passes. Record the decision taken under the agency’s policy.</p>
          <label>Decision<select value={noResponse.outcome} onChange={event => setNoResponse({ ...noResponse, outcome: event.target.value as NoResponseOutcome })}><option value="">Select</option>{Object.values(NO_RESPONSE_OUTCOME).map(item => <option key={item}>{item}</option>)}</select></label>
          {noResponseNeedsScope(noResponse.outcome) && <><label>Scope that will be processed<textarea value={noResponse.scope} onChange={event => setNoResponse({ ...noResponse, scope: event.target.value })}/></label><label>Remaining ambiguity<input value={noResponse.remainingAmbiguity} onChange={event => setNoResponse({ ...noResponse, remainingAmbiguity: event.target.value })}/></label></>}
          <label>Reason<textarea value={noResponse.rationale} onChange={event => setNoResponse({ ...noResponse, rationale: event.target.value })}/></label>
          <div className="form-actions"><button type="button" className="button button--secondary" onClick={() => setPanel(null)}>Cancel</button><button className="button button--primary" disabled={!noResponse.outcome || !noResponse.rationale.trim() || (noResponseNeedsScope(noResponse.outcome) && !noResponse.scope.trim())}>Save decision</button></div>
        </form>}
        {panel === 'due' && <form className="inline-action-form" aria-label="Response due date" onSubmit={event => { event.preventDefault(); if (store.setClarificationResponseDue(round.id, due.date, due.basis)) setPanel(null); }}>
          <label>Response due date<input type="date" value={due.date} onChange={event => setDue({ ...due, date: event.target.value })} required/></label>
          <label>Basis (agency policy or instruction)<input value={due.basis} onChange={event => setDue({ ...due, basis: event.target.value })} required/></label>
          <div className="form-actions"><button type="button" className="button button--secondary" onClick={() => setPanel(null)}>Cancel</button><button className="button button--primary" disabled={!due.date || !due.basis.trim()}>Save due date</button></div>
        </form>}
        {panel === 'reminder' && <form className="inline-action-form" aria-label="Record reminder" onSubmit={event => { event.preventDefault(); if (store.recordClarificationReminder(round.id, reminder)) { setPanel(null); setReminder({ date: '', method: '', note: '' }); } }}>
          <label>Reminder date<input type="date" value={reminder.date} onChange={event => setReminder({ ...reminder, date: event.target.value })} required/></label>
          <label>Method<input value={reminder.method} onChange={event => setReminder({ ...reminder, method: event.target.value })} placeholder="e.g. Phone call" required/></label>
          <label>Note (optional)<input value={reminder.note} onChange={event => setReminder({ ...reminder, note: event.target.value })}/></label>
          <div className="form-actions"><button type="button" className="button button--secondary" onClick={() => setPanel(null)}>Cancel</button><button className="button button--primary" disabled={!reminder.date || !reminder.method.trim()}>Save reminder</button></div>
        </form>}
      </div>}

      {step === 'review' && round.response && <form className="inline-action-form" onSubmit={submitReview} aria-label="Review response">
        <h3>Review the requester response</h3>
        <div className="original-request"><strong>Response received {displayDueDate(round.response.receivedDate)}</strong><p>{round.response.summary}</p>{round.response.late && <p className="form-error">{round.response.lateBasis}</p>}</div>
        <label>Outcome<select value={review.outcome} onChange={event => setReview({ ...review, outcome: event.target.value as ClarificationReviewOutcome })}><option value="">Select</option>{Object.values(CLARIFICATION_REVIEW).map(item => <option key={item}>{item}</option>)}</select></label>
        <label>What the response resolved<textarea value={review.resolvedItems} onChange={event => setReview({ ...review, resolvedItems: event.target.value })}/></label>
        {reviewNeedsRemaining(review.outcome) && <label>What remains unresolved<textarea value={review.remainingItems} onChange={event => setReview({ ...review, remainingItems: event.target.value })}/></label>}
        {reviewNeedsScope(review.outcome) && <>
          <label>Clarified scope to process<textarea value={review.scope} onChange={event => setReview({ ...review, scope: event.target.value })}/><small>Recorded separately; the original request text is not changed.</small></label>
          <label>What changed from the original request<input value={review.changeSummary} onChange={event => setReview({ ...review, changeSummary: event.target.value })}/></label>
        </>}
        {review.outcome === CLARIFICATION_REVIEW.FURTHER && <p className="form-help">A new round will open on this case. This round and its records are kept.</p>}
        {round.response.late && <fieldset><legend>Late response – clock effect</legend>
          <label>Decision<select value={review.lateDecision} onChange={event => setReview({ ...review, lateDecision: event.target.value })}><option value="">Select</option>{Object.values(LATE_CLOCK_DECISION).map(item => <option key={item}>{item}</option>)}</select></label>
          <label>Effective date (optional)<input type="date" value={review.lateDate} onChange={event => setReview({ ...review, lateDate: event.target.value })}/></label>
          <label>Basis for the decision<input value={review.lateRationale} onChange={event => setReview({ ...review, lateRationale: event.target.value })}/></label>
        </fieldset>}
        <label>Reason for this outcome<textarea value={review.rationale} onChange={event => setReview({ ...review, rationale: event.target.value })}/></label>
        {reviewError && <p className="form-error" role="alert">{reviewError}</p>}
        <div className="form-actions"><button className="button button--primary">Record review</button></div>
      </form>}

      {step === 'resume' && <form className="inline-action-form" aria-label="Resume clock" onSubmit={event => { event.preventDefault(); store.resumeClock(caseRecord.id, resume); }}>
        <h3>Resume the processing clock</h3>
        <p className="form-help">The clock has been on hold since {displayDueDate(caseRecord.clock.holdSince || null)}. Enter the actual effective resumption date. No deadline is recalculated automatically.</p>
        <label>Effective resumption date<input type="date" value={resume.effectiveDate} min={caseRecord.clock.holdSince} onChange={event => setResume({ ...resume, effectiveDate: event.target.value })} required/></label>
        <label>Reason<textarea value={resume.reason} onChange={event => setResume({ ...resume, reason: event.target.value })} required/></label>
        <label>Reference (optional)<input value={resume.reference} onChange={event => setResume({ ...resume, reference: event.target.value })}/></label>
        <div className="form-actions"><button className="button button--primary" disabled={!can(role, 'manageClock') || !resume.effectiveDate || !resume.reason.trim()}>Resume clock</button></div>
      </form>}

      {step === 'complete' && <form className="inline-action-form" aria-label="Complete clarification" onSubmit={event => { event.preventDefault(); store.completeClarification(round.id, completion); }}>
        <h3>Complete clarification</h3>
        {round.scopeUpdate && <div className="original-request"><strong>Recorded scope</strong><p>{round.scopeUpdate.scope}</p></div>}
        <label>Next processing action<input value={completion} onChange={event => setCompletion(event.target.value)}/></label>
        <p className="form-help">Completing clarification does not close the case; it returns to processing.</p>
        <div className="form-actions"><button className="button button--primary" disabled={!completion.trim()}>Complete clarification</button></div>
      </form>}
    </div>}

    {round && <details className="clar-round"><summary>Round {round.round} details</summary><RoundSummary round={round}/></details>}
    {past.length > 0 && <div className="clar-history"><h3>Earlier rounds</h3>{past.map(item => <details key={item.id} className="clar-round"><summary>Round {item.round} · {item.status}</summary><RoundSummary round={item}/></details>)}</div>}
  </section>;
}
