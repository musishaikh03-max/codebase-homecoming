import { FormEvent, useEffect, useState } from 'react';
import { can } from '../permissions';
import { useStore } from '../store';
import { CaseRecord, Correspondence, CORRESPONDENCE_STATUS, DELIVERY_STATUS, DeliveryStatus, DISPATCH_CHANNELS } from '../types';

/** Plain-language state of an outbound letter. Nothing is transmitted by this system. */
export function noticeStateLabel(notice: Correspondence) {
  const last = notice.dispatches?.[notice.dispatches.length - 1];
  switch (notice.status) {
    case CORRESPONDENCE_STATUS.DRAFT: return notice.returnedReason ? 'Draft – returned for changes' : 'Draft';
    case CORRESPONDENCE_STATUS.PENDING_APPROVAL: return 'Pending approval';
    case CORRESPONDENCE_STATUS.APPROVED: return 'Approved – ready for dispatch';
    case CORRESPONDENCE_STATUS.DELIVERY_FAILED: return 'Delivery failed';
    case CORRESPONDENCE_STATUS.SENT: return last ? `Recorded as sent · ${last.outcome}` : 'Recorded as sent';
    default: return notice.status;
  }
}

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Edit, submit, approve and record dispatch for one outbound letter. Shared by Correspondence and the clarification workspace. */
export default function NoticeActions({ notice, caseRecord }: { notice: Correspondence; caseRecord: CaseRecord }) {
  const { state, saveCorrespondenceDraft, submitCorrespondence, decideCorrespondenceApproval, recordDispatch, updateDeliveryOutcome, escalateDeliveryFailure } = useStore();
  const role = state.ui.roleView;
  const [subject, setSubject] = useState(notice.subject);
  const [body, setBody] = useState(notice.body);
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatch, setDispatch] = useState({ dispatchedAt: nowLocal(), channel: DISPATCH_CHANNELS[0] as string, recipient: caseRecord.email || caseRecord.address || '', reference: '', outcome: DELIVERY_STATUS.NOT_CONFIRMED as DeliveryStatus, failureDetail: '' });
  const [dispatchError, setDispatchError] = useState('');
  const [escalation, setEscalation] = useState('');
  const [outcomeFor, setOutcomeFor] = useState<{ id: string; outcome: DeliveryStatus; detail: string } | null>(null);
  useEffect(() => { setSubject(notice.subject); setBody(notice.body); }, [notice.id, notice.subject, notice.body]);
  const dirty = subject !== notice.subject || body !== notice.body;
  const last = notice.dispatches?.[notice.dispatches.length - 1];

  const submitDispatch = (event: FormEvent) => {
    event.preventDefault();
    if (!dispatch.recipient.trim()) return setDispatchError('Enter the recipient the letter was sent to.');
    if (dispatch.outcome === DELIVERY_STATUS.FAILED && !dispatch.failureDetail.trim()) return setDispatchError('Describe the delivery failure.');
    if (recordDispatch(notice.id, { ...dispatch, failureDetail: dispatch.outcome === DELIVERY_STATUS.FAILED ? dispatch.failureDetail : undefined })) {
      setDispatchOpen(false); setDispatchError('');
      setDispatch(value => ({ ...value, reference: '', failureDetail: '', outcome: DELIVERY_STATUS.NOT_CONFIRMED, dispatchedAt: nowLocal() }));
    }
  };

  return <div className="notice-actions">
    {notice.status === CORRESPONDENCE_STATUS.DRAFT && can(role, 'composeCorrespondence') ? <div className="notice-editor">
      {notice.returnedReason && <p className="form-error" role="status">Returned for changes: {notice.returnedReason}</p>}
      <label>Subject<input value={subject} onChange={event => setSubject(event.target.value)}/></label>
      <label>Letter<textarea rows={12} value={body} onChange={event => setBody(event.target.value)}/></label>
      <div className="form-actions">
        <button className="button button--secondary" disabled={!dirty || !subject.trim() || !body.trim()} onClick={() => saveCorrespondenceDraft(notice.id, subject, body)}>Save draft</button>
        <button className="button button--primary" disabled={dirty} title={dirty ? 'Save your changes first.' : undefined} onClick={() => submitCorrespondence(notice.id)}>{state.settings.outboundApprovalRequired ? 'Submit for approval' : 'Mark ready for dispatch'}</button>
      </div>
    </div> : <div className="message-preview"><h3>{notice.subject}</h3><p>{notice.body}</p></div>}

    {notice.status === CORRESPONDENCE_STATUS.PENDING_APPROVAL && (can(role, 'approveCorrespondence')
      ? <div className="form-actions">
        {returning ? <><label>Reason for returning<input value={returnReason} onChange={event => setReturnReason(event.target.value)}/></label><button className="button button--secondary" onClick={() => setReturning(false)}>Cancel</button><button className="button button--primary" disabled={!returnReason.trim()} onClick={() => { if (decideCorrespondenceApproval(notice.id, false, returnReason)) { setReturning(false); setReturnReason(''); } }}>Return to draft</button></>
          : <><button className="button button--secondary" onClick={() => setReturning(true)}>Return for changes</button><button className="button button--primary" onClick={() => decideCorrespondenceApproval(notice.id, true, '')}>Approve</button></>}
      </div>
      : <p className="form-help">Awaiting approval by Supervisor / QC.</p>)}

    {notice.approvedBy && notice.status !== CORRESPONDENCE_STATUS.DRAFT && <p className="form-help">Approval: {notice.approvedBy}{notice.approvedAt ? ` · ${new Date(notice.approvedAt).toLocaleString()}` : ''}</p>}

    {notice.dispatches?.length ? <ul className="event-list">{notice.dispatches.map(item => <li key={item.id}>
      <strong>Attempt {item.attempt} · {item.outcome}</strong>
      <span>{item.dispatchedAt.replace('T', ' ')} · {item.channel} · {item.recipient}{item.reference ? ` · Ref. ${item.reference}` : ''}</span>
      <small>Recorded by {item.recordedBy} · {new Date(item.recordedAt).toLocaleString()}{item.failureDetail ? ` · ${item.failureDetail}` : ''}{item.escalation ? ` · Escalated: ${item.escalation.note}` : ''}</small>
      {item.outcome === DELIVERY_STATUS.NOT_CONFIRMED && can(role, 'sendCorrespondence') && (outcomeFor?.id === item.id
        ? <div className="form-actions"><label>Outcome<select value={outcomeFor.outcome} onChange={event => setOutcomeFor({ ...outcomeFor, outcome: event.target.value as DeliveryStatus })}><option>{DELIVERY_STATUS.CONFIRMED}</option><option>{DELIVERY_STATUS.FAILED}</option></select></label><label>Detail<input value={outcomeFor.detail} onChange={event => setOutcomeFor({ ...outcomeFor, detail: event.target.value })}/></label><button className="button button--secondary" onClick={() => setOutcomeFor(null)}>Cancel</button><button className="button button--primary" disabled={outcomeFor.outcome === DELIVERY_STATUS.FAILED && !outcomeFor.detail.trim()} onClick={() => { if (updateDeliveryOutcome(notice.id, item.id, outcomeFor.outcome, outcomeFor.detail)) setOutcomeFor(null); }}>Save outcome</button></div>
        : <button className="text-action" onClick={() => setOutcomeFor({ id: item.id, outcome: DELIVERY_STATUS.CONFIRMED, detail: '' })}>Record delivery outcome</button>)}
    </li>)}</ul> : null}

    {(notice.status === CORRESPONDENCE_STATUS.APPROVED || notice.status === CORRESPONDENCE_STATUS.DELIVERY_FAILED) && can(role, 'sendCorrespondence') && (dispatchOpen
      ? <form className="inline-action-form" onSubmit={submitDispatch} aria-label="Record dispatch">
        <h3>{notice.status === CORRESPONDENCE_STATUS.DELIVERY_FAILED ? 'Record another dispatch attempt' : 'Record dispatch'}</h3>
        <p className="form-help">Send the letter outside this system first, then record what happened.</p>
        <label>Dispatched on<input type="datetime-local" value={dispatch.dispatchedAt} onChange={event => setDispatch(value => ({ ...value, dispatchedAt: event.target.value }))} required/></label>
        <label>Channel<select value={dispatch.channel} onChange={event => setDispatch(value => ({ ...value, channel: event.target.value }))}>{DISPATCH_CHANNELS.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Recipient<input value={dispatch.recipient} onChange={event => setDispatch(value => ({ ...value, recipient: event.target.value }))}/></label>
        <label>Reference or evidence (optional)<input value={dispatch.reference} onChange={event => setDispatch(value => ({ ...value, reference: event.target.value }))}/></label>
        <label>Delivery outcome<select value={dispatch.outcome} onChange={event => setDispatch(value => ({ ...value, outcome: event.target.value as DeliveryStatus }))}>{Object.values(DELIVERY_STATUS).map(item => <option key={item}>{item}</option>)}</select></label>
        {dispatch.outcome === DELIVERY_STATUS.FAILED && <label>Failure detail<input value={dispatch.failureDetail} onChange={event => setDispatch(value => ({ ...value, failureDetail: event.target.value }))}/></label>}
        {dispatchError && <p className="form-error" role="alert">{dispatchError}</p>}
        <div className="form-actions"><button type="button" className="button button--secondary" onClick={() => setDispatchOpen(false)}>Cancel</button><button className="button button--primary">Save dispatch record</button></div>
      </form>
      : <div className="form-actions"><button className="button button--primary" onClick={() => setDispatchOpen(true)}>{notice.status === CORRESPONDENCE_STATUS.DELIVERY_FAILED ? 'Record another attempt' : 'Record dispatch'}</button></div>)}

    {notice.status === CORRESPONDENCE_STATUS.DELIVERY_FAILED && last && !last.escalation && <div className="form-actions">
      <label>Escalation note<input value={escalation} onChange={event => setEscalation(event.target.value)} placeholder="What should the supervisor resolve?"/></label>
      <button className="button button--secondary" disabled={!escalation.trim()} onClick={() => { if (escalateDeliveryFailure(notice.id, escalation)) setEscalation(''); }}>Escalate to supervisor</button>
    </div>}
  </div>;
}
