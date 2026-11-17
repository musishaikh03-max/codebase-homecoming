import { FormEvent, useMemo, useState } from 'react';
import CloseCaseDialog from '../components/CloseCaseDialog';
import ClarificationWorkspace from '../components/ClarificationWorkspace';
import { activeRound, clarificationGate, clarificationHoldActive, roundsForCase } from '../clarification';
import { allowedRoles, can } from '../permissions';
import { useStore } from '../store';
import {
  CASE_STATUS,
  CLOCK_EVENT_KIND,
  CaseRecord,
  CORRESPONDENCE_STATUS,
  CORRESPONDENCE_TYPE,
  DEMO_USERS,
  displayDueDate,
  HOLD_TYPE,
  openTask,
  PROCESSING_TRACK,
  RFD,
  RFD_STATUS,
  RfdStatus,
  TASK_STATUS,
  calendarDays,
} from '../types';

const emptyRfd = { office: '', systemsOrLocations: '', searchTerms: '', dateRangeStart: '', dateRangeEnd: '', instructions: '', dueDate: '' };

export default function ProcessingTab({ caseRecord, nextAction }: { caseRecord: CaseRecord; nextAction: string }) {
  const {
    state, recordClockEvent, updateTask, addTask,
    requestClosure, decideClosure, createRfd, updateRfd, returnRfd, completeSearch,
  } = useStore();
  const [clockForm, setClockForm] = useState<'controlling' | 'target' | 'extension' | 'expedite' | null>(null);
  const [date, setDate] = useState('');
  const [basis, setBasis] = useState('Received date');
  const [reason, setReason] = useState('');
  const [targetSource, setTargetSource] = useState('');
  const [expedite, setExpedite] = useState('Pending');
  const [closureOpen, setClosureOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskOwner, setTaskOwner] = useState(caseRecord.processor);
  const [taskDue, setTaskDue] = useState('');
  const [rfdOpen, setRfdOpen] = useState(false);
  const [rfdDraft, setRfdDraft] = useState(emptyRfd);
  const [returning, setReturning] = useState<RFD | null>(null);
  const [returnKind, setReturnKind] = useState<'records' | 'none'>('records');
  const [returnFiles, setReturnFiles] = useState<File[]>([]);
  const [evidence, setEvidence] = useState({ locationsSearched: '', systems: '', timeSpentHours: 0, searchedBy: '', notes: '' });
  const [statement, setStatement] = useState('');
  const [custodianOffice, setCustodianOffice] = useState(state.offices[0]?.name || '');
  const role = state.ui.roleView;
  const clockEvents = state.clockEvents.filter(event => event.caseId === caseRecord.id).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const tasks = state.tasks.filter(task => task.caseId === caseRecord.id);
  const rfds = state.rfds.filter(item => item.caseId === caseRecord.id);
  const pendingClosures = state.closureRequests.filter(item => item.caseId === caseRecord.id && item.status === 'Pending approval');
  const gate = clarificationGate(state.clarificationRounds, state.correspondence, caseRecord);
  const clarifiedScope = [...roundsForCase(state.clarificationRounds, caseRecord.id)].reverse().find(item => item.scopeUpdate)?.scopeUpdate;
  const searchBlocked = Boolean(gate);
  const allReconciled = rfds.length > 0 && rfds.every(item => item.status === RFD_STATUS.ACCEPTED || item.status === RFD_STATUS.CANCELLED);
  const accepted = rfds.filter(item => item.status === RFD_STATUS.ACCEPTED).length;
  const outstanding = rfds.filter(item => item.status !== RFD_STATUS.ACCEPTED && item.status !== RFD_STATUS.CANCELLED);
  const allNoRecords = rfds.some(item => item.status === RFD_STATUS.ACCEPTED) && rfds.filter(item => item.status === RFD_STATUS.ACCEPTED).every(item => item.noRecordsStatement);

  const resetClock = () => { setClockForm(null); setDate(''); setReason(''); setTargetSource(''); };
  const submitClock = (event: FormEvent) => {
    event.preventDefault();
    if (!clockForm || !date || !reason.trim()) return;
    if (clockForm === 'controlling') {
      recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.CONTROLLING_DATE, reason, effectiveDate: date }, {
        controllingDate: { receivedDate: date, perfectedDate: basis === 'Date entered as considered perfected' ? date : undefined, basis, setBy: DEMO_USERS[role], setAt: new Date().toISOString() },
      });
    } else if (clockForm === 'target') {
      recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.TARGET_DATE, reason: `${targetSource}: ${reason}`, effectiveDate: date }, { dueDate: date, dueDateBasis: 'Entered by user', clock: { ...caseRecord.clock, state: 'Recorded' } });
    } else if (clockForm === 'extension') {
      recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.EXTENSION, reason, effectiveDate: date }, {}, { draftExtension: true });
    } else if (clockForm === 'expedite') {
      recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.EXPEDITE, reason: `${expedite}: ${reason}`, effectiveDate: date }, expedite === 'Granted' ? { track: PROCESSING_TRACK.EXPEDITED } : {});
    }
    resetClock();
  };

  const addRfd = (event: FormEvent) => {
    event.preventDefault();
    const office = state.offices.find(item => item.name === rfdDraft.office);
    if (!office || !rfdDraft.dueDate) return;
    createRfd({ caseId: caseRecord.id, custodianName: office.custodianName, ...rfdDraft });
    setRfdDraft(emptyRfd); setRfdOpen(false);
  };

  const submitReturn = (event: FormEvent) => {
    event.preventDefault();
    if (!returning) return;
    returnRfd(returning.id, returnKind === 'none', evidence, returnFiles.map(file => ({ name: file.name, sizeKb: Math.round(file.size / 1024), mime: file.type || 'application/octet-stream' })), statement);
    setReturning(null); setReturnFiles([]); setStatement('');
  };

  const suggestedDraft = () => {
    const office = state.offices[0];
    setRfdDraft({ office: office.name, systemsOrLocations: 'Program repositories and shared records locations', searchTerms: clarifiedScope?.scope || caseRecord.title, dateRangeStart: caseRecord.dateRangeStart || '', dateRangeEnd: caseRecord.dateRangeEnd || '', instructions: 'Confirm scope and document the systems and locations searched.', dueDate: '' });
    setRfdOpen(true);
  };

  return <div className="processing-stack">
    <section className="next-action-banner"><strong>Next action</strong><span>{nextAction}</span></section>

    <section className="workspace-section">
      <div className="workspace-section-title"><h2>Recorded dates and clock</h2></div>
      <div className="processing-summary">
        <div><span>Received date</span><strong>{displayDueDate(caseRecord.received)}</strong></div>
        <div><span>Controlling date and basis</span><strong>{caseRecord.controllingDate ? `${displayDueDate(caseRecord.controllingDate.receivedDate)} - ${caseRecord.controllingDate.basis}` : 'Not established'}</strong></div>
        <div><span>Recorded target date</span><strong>{caseRecord.dueDate ? `${displayDueDate(caseRecord.dueDate)} - ${caseRecord.dueDateBasis}` : 'Not established - no date is generated'}</strong><small>Recorded operational target</small></div>
        <div><span>Calendar days to target</span><strong>{caseRecord.dueDate ? calendarDays(state.settings.asOfDate, caseRecord.dueDate) : 'Not established'}</strong></div>
        <div><span>Clock state</span><strong>{caseRecord.clock.state}{caseRecord.clock.holdType ? ` · ${caseRecord.clock.holdType}` : ''}</strong>{clarificationHoldActive(caseRecord) && <small>Managed in the clarification workflow below</small>}</div>
      </div>
      {can(role, 'manageClock') && <div className="section-actions">
        <button onClick={() => setClockForm('controlling')}>Set controlling date</button><button onClick={() => setClockForm('target')}>Record target date</button>
        {caseRecord.clock.state === 'Hold recorded' && !clarificationHoldActive(caseRecord) && <button onClick={() => recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.HOLD_ENDED, reason: 'Hold ended by authorised user.', effectiveDate: state.settings.asOfDate }, { clock: { ...caseRecord.clock, state: 'Recorded' } })}>End hold</button>}
        <button onClick={() => setClockForm('extension')}>Record extension</button>
        {can(role, 'decideExpedite') && <button onClick={() => setClockForm('expedite')}>Expedite decision</button>}
      </div>}
      {clockForm && <form className="inline-action-form" onSubmit={submitClock}>
        {clockForm === 'controlling' && <label>Basis<select value={basis} onChange={event => setBasis(event.target.value)}><option>Received date</option><option>Date entered as considered perfected</option></select></label>}
                {clockForm === 'expedite' && <label>Decision<select value={expedite} onChange={event => setExpedite(event.target.value)}><option>Pending</option><option>Granted</option><option>Denied</option></select></label>}
        {clockForm === 'target' && <label>Source<input value={targetSource} onChange={event => setTargetSource(event.target.value)} required placeholder="Enter the recorded source"/></label>}
        <label>Effective date<input type="date" value={date} onChange={event => setDate(event.target.value)} required/></label>
        <label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} required/></label>
        <div><button type="button" onClick={resetClock}>Cancel</button><button className="button button--primary">Record</button></div>
      </form>}
      {clockEvents.length ? <ul className="event-list">{clockEvents.map(item => <li key={item.id}><strong>{item.kind}</strong><span>{item.effectiveDate} · {item.reason} · {item.authorisedBy}</span></li>)}</ul> : <div className="tab-empty tab-empty--small"><p>No recorded clock events.</p></div>}
    </section>

    <ClarificationWorkspace caseRecord={caseRecord}/>

    <section className="workspace-section">
      <div className="workspace-section-title"><h2>Closure requests</h2>{can(role, 'requestClosure') && <button onClick={() => setClosureOpen(true)}>Request closure</button>}</div>
      {pendingClosures.length ? <ul className="event-list">{pendingClosures.map(item => <li key={item.id}><strong>{item.kind}</strong><span>{item.reason} · Requested by {item.requestedBy}</span>{can(role, 'approveClosure') && <div><button onClick={() => decideClosure(item.id, true, 'Supervisor / QC approval recorded.')}>Approve</button><button onClick={() => decideClosure(item.id, false, 'Supervisor / QC rejection recorded.')}>Reject</button></div>}</li>)}</ul> : <div className="tab-empty tab-empty--small"><p>No pending closure requests.</p></div>}
      {closureOpen && <CloseCaseDialog onClose={() => setClosureOpen(false)} onSubmit={(kind, closureReason) => { requestClosure(caseRecord.id, kind, closureReason); setClosureOpen(false); }}/>}
    </section>

    <section className="workspace-section">
      <div className="workspace-section-title"><h2>Tasks</h2></div>
      {can(role, 'manageTasks') && <form className="inline-action-form inline-action-form--row" onSubmit={event => { event.preventDefault(); if (!taskTitle.trim()) return; addTask({ caseId: caseRecord.id, type: 'General', title: taskTitle, ownerName: taskOwner, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: taskDue || null }); setTaskTitle(''); }}>
        <label>Task title<input value={taskTitle} onChange={event => setTaskTitle(event.target.value)}/></label><label>Owner<input value={taskOwner} onChange={event => setTaskOwner(event.target.value)}/></label><label>Due date<input type="date" value={taskDue} onChange={event => setTaskDue(event.target.value)}/></label><button>Add task</button>
      </form>}
      <div className="table-scroll"><table className="management-table"><thead><tr><th>Type</th><th>Task</th><th>Owner</th><th>Due</th><th>Task status</th><th>Actions</th></tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td>{task.type}</td><td>{task.title}</td><td>{task.ownerName}</td><td>{displayDueDate(task.dueDate)} {task.dueDate && task.dueDate < state.settings.asOfDate && openTask(task) && <span className="badge risk-high">Overdue</span>}</td><td><span className={`badge status-${task.status.toLowerCase().replaceAll(' ', '-')}`}>{task.status}</span></td><td>{can(role, 'manageTasks') && openTask(task) && <><button onClick={() => updateTask(task.id, { status: TASK_STATUS.DONE }, 'Task completed.')}>Complete</button><button onClick={() => { const why = window.prompt('Reason for task cancellation'); if (why?.trim()) updateTask(task.id, { status: TASK_STATUS.CANCELLED }, why.trim()); }}>Cancel</button><button onClick={() => { const owner = window.prompt('New task owner', caseRecord.processor); if (!owner?.trim()) return; const why = window.prompt('Reason for task reassignment'); if (why?.trim()) updateTask(task.id, { ownerName: owner.trim() }, why.trim()); }}>Reassign</button></>}</td></tr>)}</tbody></table></div>
      {!tasks.length && <div className="table-empty table-empty--compact"><strong>No tasks</strong></div>}
    </section>

    <section className="workspace-section">
      <div className="workspace-section-title"><h2>Search Plan & RFDs</h2>{can(role, 'manageRfd') && !searchBlocked && <button onClick={() => setRfdOpen(true)}>Add RFD</button>}</div>
      {searchBlocked && <p className="status-flag" role="status">Search planning starts once clarification is resolved. Outstanding: {gate!.label}{gate!.round ? ` (round ${gate!.round})` : ''}.</p>}
      {clarifiedScope && <div className="processing-summary"><div><span>Clarified scope for search</span><strong>{clarifiedScope.scope}</strong><small>{clarifiedScope.sourceRef} · {clarifiedScope.by}</small></div></div>}
      {role === 'Custodian / Action Office' && <label className="office-role-selector">Acting as office contact<select value={custodianOffice} onChange={event => setCustodianOffice(event.target.value)}>{state.offices.map(office => <option key={office.id}>{office.name}</option>)}</select><small>{state.offices.find(office => office.name === custodianOffice)?.custodianName}</small></label>}
      {!searchBlocked && <div className="ai-draft-card"><strong>Suggested search plan</strong><span>AI-assisted · review before use</span><p>Search offices likely to maintain records described by “{clarifiedScope?.scope || caseRecord.title}”, using the confirmed scope and date range.</p><button onClick={suggestedDraft}>Use as draft</button></div>}
      {rfdOpen && !searchBlocked && <form className="inline-action-form" onSubmit={addRfd}>
        <label>Office<select value={rfdDraft.office} onChange={event => setRfdDraft(value => ({ ...value, office: event.target.value }))}><option value="">Select office</option>{state.offices.map(office => <option key={office.id}>{office.name}</option>)}</select></label>
        <label>Systems or locations<input value={rfdDraft.systemsOrLocations} onChange={event => setRfdDraft(value => ({ ...value, systemsOrLocations: event.target.value }))}/></label>
        <label>Search terms<input value={rfdDraft.searchTerms} onChange={event => setRfdDraft(value => ({ ...value, searchTerms: event.target.value }))}/></label>
        <label>Date range start<input type="date" value={rfdDraft.dateRangeStart} onChange={event => setRfdDraft(value => ({ ...value, dateRangeStart: event.target.value }))}/></label>
        <label>Date range end<input type="date" value={rfdDraft.dateRangeEnd} onChange={event => setRfdDraft(value => ({ ...value, dateRangeEnd: event.target.value }))}/></label>
        <label>Recorded operational due date<input type="date" value={rfdDraft.dueDate} onChange={event => setRfdDraft(value => ({ ...value, dueDate: event.target.value }))}/></label>
        <label>Instructions<textarea value={rfdDraft.instructions} onChange={event => setRfdDraft(value => ({ ...value, instructions: event.target.value }))}/></label>
        <div><button type="button" onClick={() => setRfdOpen(false)}>Cancel</button><button>Create draft</button></div>
      </form>}
      <div className="reconciliation"><div><strong>{rfds.length}</strong><span>Expected returns</span></div><div><strong>{accepted}</strong><span>Accepted</span></div><div><strong>{outstanding.length}</strong><span>Outstanding</span></div><p>{outstanding.length ? `Outstanding offices: ${outstanding.map(item => item.office).join(', ')}` : 'No outstanding offices'}</p></div>
      {rfds.length ? <ul className="rfd-list">{rfds.map(rfd => <li key={rfd.id}><div><strong>{rfd.office}</strong><span>{rfd.custodianName} · {rfd.status} · target {displayDueDate(rfd.dueDate)}</span></div><div className="row-actions">
        {can(role, 'manageRfd') && rfd.status === RFD_STATUS.DRAFT && <button onClick={() => updateRfd(rfd.id, { status: RFD_STATUS.SENT }, 'RFD marked as sent')}>Mark RFD as sent</button>}
        {can(role, 'manageRfd') && rfd.status === RFD_STATUS.SENT && <button onClick={() => updateRfd(rfd.id, {}, 'RFD reminder recorded')}>Record reminder</button>}
        {can(role, 'returnRfd') && rfd.office === custodianOffice && ([RFD_STATUS.SENT, RFD_STATUS.FOLLOW_UP] as RfdStatus[]).includes(rfd.status) && <button onClick={() => setReturning(rfd)}>Record return</button>}
        {can(role, 'manageRfd') && ([RFD_STATUS.RETURNED_RECORDS, RFD_STATUS.RETURNED_NO_RECORDS] as RfdStatus[]).includes(rfd.status) && <><button onClick={() => updateRfd(rfd.id, { status: RFD_STATUS.ACCEPTED }, 'RFD return accepted')}>Accept</button><button onClick={() => updateRfd(rfd.id, { status: RFD_STATUS.FOLLOW_UP }, 'RFD follow-up requested')}>Request follow-up</button></>}
        {can(role, 'manageRfd') && !([RFD_STATUS.ACCEPTED, RFD_STATUS.CANCELLED] as RfdStatus[]).includes(rfd.status) && <button onClick={() => { const why = window.prompt('Reason for RFD cancellation'); if (why?.trim()) updateRfd(rfd.id, { status: RFD_STATUS.CANCELLED, cancellationReason: why.trim() }, 'RFD cancelled', why.trim()); }}>Cancel</button>}
      </div>{rfd.noRecordsStatement && <p>No-records statement: {rfd.noRecordsStatement.text}</p>}</li>)}</ul> : <div className="table-empty table-empty--compact"><strong>No RFDs</strong><span>Add an RFD to begin the recorded search plan.</span></div>}
      {returning && <form className="inline-action-form" onSubmit={submitReturn}><h3>Return from {returning.office}</h3><fieldset className="return-outcome"><legend>Outcome</legend><label><input type="radio" checked={returnKind === 'records'} onChange={() => setReturnKind('records')}/>Upload records</label><label><input type="radio" checked={returnKind === 'none'} onChange={() => setReturnKind('none')}/>No responsive records</label></fieldset>{returnKind === 'records' ? <label>Files<input type="file" multiple onChange={event => setReturnFiles(Array.from(event.target.files || []))}/></label> : <label>No-records statement<textarea value={statement} onChange={event => setStatement(event.target.value)}/></label>}<label>Locations searched<input value={evidence.locationsSearched} onChange={event => setEvidence(value => ({ ...value, locationsSearched: event.target.value }))}/></label><label>Systems<input value={evidence.systems} onChange={event => setEvidence(value => ({ ...value, systems: event.target.value }))}/></label><label>Time spent hours<input type="number" min="0" step=".25" value={evidence.timeSpentHours} onChange={event => setEvidence(value => ({ ...value, timeSpentHours: Number(event.target.value) }))}/></label><label>Searched by<input value={evidence.searchedBy} onChange={event => setEvidence(value => ({ ...value, searchedBy: event.target.value }))}/></label><label>Notes<textarea value={evidence.notes} onChange={event => setEvidence(value => ({ ...value, notes: event.target.value }))}/></label><div><button type="button" onClick={() => setReturning(null)}>Cancel</button><button>Record return</button></div></form>}
      <div className="section-actions"><button disabled={!allReconciled} title={!allReconciled ? 'Every RFD must be Accepted or Cancelled.' : undefined} onClick={() => completeSearch(caseRecord.id)}>Search complete</button><button disabled={searchBlocked} onClick={() => setRfdOpen(true)}>Add another RFD</button></div>
      {allNoRecords && <div className="deferred-card"><strong>No responsive records returned</strong><p>Use the no-records determination and QC controls to continue.</p></div>}
    </section>
  </div>;
}
