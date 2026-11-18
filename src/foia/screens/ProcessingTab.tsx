import { FormEvent, useEffect, useState } from 'react';
import CloseCaseDialog from '../components/CloseCaseDialog';
import ClarificationWorkspace from '../components/ClarificationWorkspace';
import { AssistItem, AssistPanel, Drawer, fmt, goToTab, hashParam, isOpen, rfdLabels, slug } from '../components/CaseWorkspaceKit';
import { clarificationGate, clarificationHoldActive, roundsForCase } from '../clarification';
import { can } from '../permissions';
import { useStore } from '../store';
import {
  CLOCK_EVENT_KIND, CaseRecord, DEMO_USERS, PROCESSING_TRACK, RFD_STATUS, Task, TASK_PRIORITY,
  TASK_STATUS, TaskPriority, TaskStatus, calendarDays, displayDueDate,
} from '../types';

const WORKSPACES = ['Processing', 'Records & Documents', 'Review & Redaction', 'Coordination & Fees', 'Correspondence', 'Determination & Release'];
type Control = 'track' | 'clock' | 'holds' | 'clarification' | 'scope' | 'closure';
const emptyTask = { title: '', description: '', ownerName: '', dueDate: '', priority: 'Medium' as TaskPriority, workspace: 'Processing', dependsOn: [] as string[] };

export default function ProcessingTab({ caseRecord, nextAction, onOpenAi }: { caseRecord: CaseRecord; nextAction: string; onOpenAi?: () => void }) {
  const { state, recordClockEvent, updateTask, addTask, requestClosure, decideClosure } = useStore();
  const role = state.ui.roleView;
  const mayManage = can(role, 'manageTasks');
  const [control, setControl] = useState<Control | null>(null);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [taskForm, setTaskForm] = useState<typeof emptyTask | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clockForm, setClockForm] = useState<'controlling' | 'target' | 'extension' | 'expedite' | null>(null);
  const [date, setDate] = useState('');
  const [basis, setBasis] = useState('Received date');
  const [reason, setReason] = useState('');
  const [targetSource, setTargetSource] = useState('');
  const [expedite, setExpedite] = useState('Pending');
  const [closureOpen, setClosureOpen] = useState(false);

  useEffect(() => { if (hashParam('focus') === 'clarification') setControl('clarification'); }, [caseRecord.id]);

  const tasks = state.tasks.filter(task => task.caseId === caseRecord.id);
  const rfds = state.rfds.filter(item => item.caseId === caseRecord.id);
  const labels = rfdLabels(rfds);
  const asOf = state.settings.asOfDate;
  const clockEvents = state.clockEvents.filter(event => event.caseId === caseRecord.id).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const pendingClosures = state.closureRequests.filter(item => item.caseId === caseRecord.id && item.status === 'Pending approval');
  const gate = clarificationGate(state.clarificationRounds, state.correspondence, caseRecord);
  const clarRounds = roundsForCase(state.clarificationRounds, caseRecord.id);
  const clarifiedScope = [...clarRounds].reverse().find(item => item.scopeUpdate)?.scopeUpdate;
  const selected = tasks.find(task => task.id === selectedId) || null;

  const active = tasks.filter(task => task.status !== TASK_STATUS.CANCELLED);
  const done = active.filter(task => task.status === TASK_STATUS.DONE).length;
  const pct = active.length ? Math.round((done / active.length) * 100) : 0;
  const count = (status: TaskStatus) => tasks.filter(task => task.status === status).length;
  const unmetDeps = (task: Task) => (task.dependsOn || []).map(id => tasks.find(item => item.id === id)).filter((item): item is Task => Boolean(item && isOpen(item)));
  const blocked = tasks.filter(task => isOpen(task) && (task.status === TASK_STATUS.BLOCKED || unmetDeps(task).length > 0));
  const depCount = tasks.filter(isOpen).reduce((sum, task) => sum + (task.dependsOn?.length || 0), 0);
  const overdue = tasks.filter(task => isOpen(task) && task.dueDate && task.dueDate < asOf);
  const milestones = [
    ...tasks.filter(task => isOpen(task) && task.dueDate).map(task => ({ date: task.dueDate!, label: task.title })),
    ...rfds.filter(rfd => rfd.status === RFD_STATUS.SENT || rfd.status === RFD_STATUS.DRAFT).map(rfd => ({ date: rfd.dueDate, label: `${labels.get(rfd.id)} response due` })),
    ...(caseRecord.dueDate ? [{ date: caseRecord.dueDate, label: 'Recorded target date' }] : []),
  ].filter(item => item.date && item.date >= asOf).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);

  const openTarget = (task: Task) => {
    const rfd = task.linkedRef && rfds.find(item => item.id === task.linkedRef);
    if (rfd) goToTab(caseRecord.id, 'Records & Documents', { view: 'rfd', rfd: rfd.id });
    else if (task.workspace && task.workspace !== 'Processing') goToTab(caseRecord.id, task.workspace);
  };
  const workspaceOf = (task: Task) => task.linkedRef && labels.has(task.linkedRef) ? 'Records & Documents' : task.workspace || 'Processing';

  const saveTask = (event: FormEvent) => {
    event.preventDefault();
    if (!taskForm || !taskForm.title.trim()) return;
    addTask({ caseId: caseRecord.id, type: 'General', title: taskForm.title.trim(), description: taskForm.description.trim() || undefined, ownerName: taskForm.ownerName.trim() || caseRecord.processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: taskForm.dueDate || null, priority: taskForm.priority, workspace: taskForm.workspace, dependsOn: taskForm.dependsOn });
    setTaskForm(null);
  };

  const resetClock = () => { setClockForm(null); setDate(''); setReason(''); setTargetSource(''); };
  const submitClock = (event: FormEvent) => {
    event.preventDefault();
    if (!clockForm || !date || !reason.trim()) return;
    if (clockForm === 'controlling') recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.CONTROLLING_DATE, reason, effectiveDate: date }, { controllingDate: { receivedDate: date, perfectedDate: basis === 'Date entered as considered perfected' ? date : undefined, basis, setBy: DEMO_USERS[role], setAt: new Date().toISOString() } });
    else if (clockForm === 'target') recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.TARGET_DATE, reason: `${targetSource}: ${reason}`, effectiveDate: date }, { dueDate: date, dueDateBasis: 'Entered by user', clock: { ...caseRecord.clock, state: 'Recorded' } });
    else if (clockForm === 'extension') recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.EXTENSION, reason, effectiveDate: date }, {}, { draftExtension: true });
    else recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.EXPEDITE, reason: `${expedite}: ${reason}`, effectiveDate: date }, expedite === 'Granted' ? { track: PROCESSING_TRACK.EXPEDITED } : {});
    resetClock();
  };
  const clockFormEl = clockForm && <form className="inline-action-form" onSubmit={submitClock}>
    {clockForm === 'controlling' && <label>Basis<select value={basis} onChange={event => setBasis(event.target.value)}><option>Received date</option><option>Date entered as considered perfected</option></select></label>}
    {clockForm === 'expedite' && <label>Decision<select value={expedite} onChange={event => setExpedite(event.target.value)}><option>Pending</option><option>Granted</option><option>Denied</option></select></label>}
    {clockForm === 'target' && <label>Source<input value={targetSource} onChange={event => setTargetSource(event.target.value)} required placeholder="Enter the recorded source"/></label>}
    <label>Effective date<input type="date" value={date} onChange={event => setDate(event.target.value)} required/></label>
    <label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} required/></label>
    <div><button type="button" onClick={resetClock}>Cancel</button><button className="button button--primary">Record</button></div>
  </form>;
  const eventList = (kinds?: string[]) => {
    const rows = kinds ? clockEvents.filter(item => kinds.includes(item.kind)) : clockEvents;
    return rows.length ? <ul className="event-list">{rows.map(item => <li key={item.id}><strong>{item.kind}</strong><span>{item.effectiveDate} · {item.reason} · {item.authorisedBy}</span></li>)}</ul> : <p className="cw-muted">No recorded events.</p>;
  };
  const manageClock = can(role, 'manageClock');
  const days = caseRecord.dueDate ? calendarDays(asOf, caseRecord.dueDate) : null;
  const ready = !gate && caseRecord.clock.state !== 'Hold recorded' && blocked.length === 0;

  const tiles: Array<{ id: Control; title: string; value: string; badge?: string }> = [
    { id: 'track', title: 'Processing Track', value: caseRecord.track || 'Not set' },
    { id: 'clock', title: 'Clock & Deadline', value: caseRecord.dueDate ? `Target: ${fmt(caseRecord.dueDate)}` : 'Target not established', badge: caseRecord.risk && caseRecord.risk !== '—' ? `Risk: ${caseRecord.risk}` : undefined },
    { id: 'holds', title: 'Holds & Extensions', value: caseRecord.clock.state === 'Hold recorded' ? `Hold: ${caseRecord.clock.holdType || 'recorded'}` : 'No active hold' },
    { id: 'clarification', title: 'Clarification', value: gate ? gate.label : clarRounds.length ? `${clarRounds.length} round${clarRounds.length > 1 ? 's' : ''} recorded` : 'Not required' },
    { id: 'scope', title: 'Scope Management', value: clarifiedScope ? 'Clarified scope recorded' : 'Original request scope' },
    { id: 'closure', title: 'Readiness & Closure', value: pendingClosures.length ? `${pendingClosures.length} closure request pending` : ready ? 'No blockers recorded' : 'Blockers recorded', badge: ready ? 'Ready to proceed' : undefined },
  ];

  const attention: AssistItem[] = [
    ...overdue.map(task => ({ text: `“${task.title}” was due ${fmt(task.dueDate)}.`, action: { label: 'Open task', onClick: () => setSelectedId(task.id) } })),
    ...rfds.filter(rfd => rfd.status === RFD_STATUS.SENT && rfd.dueDate < asOf).map(rfd => ({ text: `${labels.get(rfd.id)} response from ${rfd.office} is past its recorded due date.`, action: { label: `View ${labels.get(rfd.id)}`, onClick: () => goToTab(caseRecord.id, 'Records & Documents', { view: 'rfd', rfd: rfd.id }) } })),
    ...blocked.map(task => ({ text: `“${task.title}” is blocked${unmetDeps(task).length ? ` by ${unmetDeps(task).map(item => `“${item.title}”`).join(', ')}` : ''}.` })),
    ...(gate ? [{ text: `Clarification is outstanding: ${gate.label}.`, action: { label: 'Open', onClick: () => setControl('clarification') } }] : []),
    ...(!caseRecord.dueDate ? [{ text: 'No target date is recorded.', action: { label: 'Clock & Deadline', onClick: () => setControl('clock') } }] : []),
  ];
  const nextSteps: AssistItem[] = [
    { text: nextAction },
    ...tasks.filter(isOpen).filter(task => !unmetDeps(task).length).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9')).slice(0, 2).map(task => ({ text: task.title, action: { label: 'Open', onClick: () => setSelectedId(task.id) } })),
  ].filter((item, index, list) => list.findIndex(other => other.text === item.text) === index);

  return <div className="cw-layout">
    <div className="cw-main">
      {gate && <section className="cw-card"><ClarificationWorkspace caseRecord={caseRecord}/></section>}

      <section className="cw-card">
        <div className="cw-card-head"><div><h2>Case Tasks & Work Management</h2><p>All activities required to progress this case, across every stage of the FOIA lifecycle.</p></div>
          <div className="cw-actions">{mayManage && <button className="button button--primary" onClick={() => setTaskForm({ ...emptyTask, ownerName: caseRecord.processor })}>+ Create Task</button>}</div></div>
        {tasks.length ? <div className="table-scroll"><table className="cw-table"><thead><tr><th aria-label="Complete"/><th>Task</th><th>Related Workspace</th><th>Owner</th><th>Due Date</th><th>Priority</th><th>Status</th></tr></thead><tbody>
          {tasks.map(task => <tr key={task.id}>
            <td><input type="checkbox" aria-label={`Mark ${task.title} complete`} checked={task.status === TASK_STATUS.DONE} disabled={!mayManage || !isOpen(task) || unmetDeps(task).length > 0} onChange={() => updateTask(task.id, { status: TASK_STATUS.DONE }, 'Task completed.')}/></td>
            <td><button className="link cw-strong" onClick={() => setSelectedId(task.id)}>{task.title}</button>{unmetDeps(task).length > 0 && <small className="cw-sub">Waiting on {unmetDeps(task).length} task{unmetDeps(task).length > 1 ? 's' : ''}</small>}</td>
            <td>{workspaceOf(task) === 'Processing' ? <span className="cw-muted">Processing</span> : <button className="link" onClick={() => openTarget(task)}>{task.linkedRef && labels.get(task.linkedRef) ? labels.get(task.linkedRef) : workspaceOf(task)}</button>}</td>
            <td>{task.ownerName}</td>
            <td>{displayDueDate(task.dueDate)}{task.dueDate && task.dueDate < asOf && isOpen(task) && <span className="cw-pill cw-pill--danger">Overdue</span>}</td>
            <td>{task.priority ? <span className={`cw-pill cw-pill--${slug(task.priority)}`}>{task.priority}</span> : <span className="cw-muted">Not set</span>}</td>
            <td><span className={`cw-pill cw-pill--${slug(task.status)}`}>{task.status}</span></td>
          </tr>)}
        </tbody></table></div> : <div className="cw-empty"><strong>No tasks yet</strong><span>Create a task to plan and track work on this case.</span>{mayManage && <button className="button button--secondary" onClick={() => setTaskForm({ ...emptyTask, ownerName: caseRecord.processor })}>Create Task</button>}</div>}
      </section>

      <section className="cw-card">
        <div className="cw-card-head"><div><h2>Processing Progress & Dependencies</h2><p>Overall status of case work, key dependencies and upcoming milestones.</p></div></div>
        <div className="cw-progress-grid">
          <div><h3>Tasks Progress</h3><div className="cw-bar"><span><i style={{ width: `${pct}%` }}/></span><strong>{pct}%</strong></div><p className="cw-muted">{done} of {active.length} tasks completed</p></div>
          <div><h3>Task Status</h3><div className="cw-stats-inline">
            <div><strong>{count(TASK_STATUS.DONE)}</strong><span>Completed</span></div><div><strong>{count(TASK_STATUS.IN_PROGRESS)}</strong><span>In Progress</span></div><div><strong>{count(TASK_STATUS.OPEN)}</strong><span>Open</span></div><div><strong>{count(TASK_STATUS.BLOCKED)}</strong><span>Blocked</span></div>
          </div></div>
          <div><h3>Dependencies & Blockers</h3><div className="cw-chips"><span className={`cw-pill ${blocked.length ? 'cw-pill--danger' : ''}`}>{blocked.length} blocker{blocked.length === 1 ? '' : 's'}</span><span className="cw-pill">{depCount} dependenc{depCount === 1 ? 'y' : 'ies'}</span></div></div>
          <div><h3>Upcoming Milestones</h3>{milestones.length ? <ul className="cw-milestones">{milestones.map(item => <li key={item.label + item.date}>{item.label} – {fmt(item.date)}</li>)}</ul> : <p className="cw-muted">No upcoming dates recorded.</p>}</div>
        </div>
      </section>

      <section className="cw-card">
        <div className="cw-card-head"><div><h2>Processing Controls & Assessment</h2><p>Case-level controls, assessments and conditions that govern processing.</p></div>
          <button className="cw-icon-btn" aria-expanded={controlsOpen} aria-label={controlsOpen ? 'Collapse controls' : 'Expand controls'} onClick={() => setControlsOpen(value => !value)}>{controlsOpen ? '▴' : '▾'}</button></div>
        {controlsOpen && <div className="cw-tiles cw-tiles--6">{tiles.map(tile => <button key={tile.id} className="cw-tile" onClick={() => setControl(tile.id)}>
          <strong>{tile.title}</strong><span>{tile.value}</span>{tile.badge && <em className="cw-pill">{tile.badge}</em>}<i aria-hidden="true">›</i>
        </button>)}</div>}
      </section>
    </div>

    <AssistPanel caseId={caseRecord.id} context="Processing" attention={attention} nextSteps={nextSteps} onAsk={() => onOpenAi?.()}/>

    {taskForm && <Drawer title="Create task" onClose={() => setTaskForm(null)}>
      <form className="cw-form" onSubmit={saveTask}>
        <label>Task title<input required value={taskForm.title} onChange={event => setTaskForm({ ...taskForm, title: event.target.value })}/></label>
        <label>Description<textarea value={taskForm.description} onChange={event => setTaskForm({ ...taskForm, description: event.target.value })}/></label>
        <div className="cw-form-row"><label>Owner<input value={taskForm.ownerName} onChange={event => setTaskForm({ ...taskForm, ownerName: event.target.value })}/></label><label>Due date<input type="date" value={taskForm.dueDate} onChange={event => setTaskForm({ ...taskForm, dueDate: event.target.value })}/></label></div>
        <div className="cw-form-row"><label>Priority<select value={taskForm.priority} onChange={event => setTaskForm({ ...taskForm, priority: event.target.value as TaskPriority })}>{TASK_PRIORITY.map(item => <option key={item}>{item}</option>)}</select></label><label>Related workspace<select value={taskForm.workspace} onChange={event => setTaskForm({ ...taskForm, workspace: event.target.value })}>{WORKSPACES.map(item => <option key={item}>{item}</option>)}</select></label></div>
        <fieldset className="cw-deps"><legend>Depends on</legend>{tasks.filter(isOpen).length ? tasks.filter(isOpen).map(task => <label key={task.id}><input type="checkbox" checked={taskForm.dependsOn.includes(task.id)} onChange={event => setTaskForm({ ...taskForm, dependsOn: event.target.checked ? [...taskForm.dependsOn, task.id] : taskForm.dependsOn.filter(id => id !== task.id) })}/>{task.title}</label>) : <p className="cw-muted">No open tasks to depend on.</p>}</fieldset>
        <p className="cw-fine">To request documents from a custodian, create the RFD in Records & Documents; a linked tracking task can be added there. <button type="button" className="link" onClick={() => { setTaskForm(null); goToTab(caseRecord.id, 'Records & Documents', { view: 'rfds', create: 'rfd' }); }}>Create RFD →</button></p>
        <div className="cw-form-actions"><button type="button" className="button button--secondary" onClick={() => setTaskForm(null)}>Cancel</button><button className="button button--primary">Create task</button></div>
      </form>
    </Drawer>}

    {selected && <Drawer title={selected.title} onClose={() => setSelectedId(null)}>
      <TaskDetail task={selected} tasks={tasks} mayManage={mayManage} rfdLabel={selected.linkedRef ? labels.get(selected.linkedRef) : undefined} onOpenTarget={() => openTarget(selected)} workspace={workspaceOf(selected)} processor={caseRecord.processor} onUpdate={(changes, why) => updateTask(selected.id, changes, why)}/>
    </Drawer>}

    {control && <Drawer title={tiles.find(tile => tile.id === control)!.title} onClose={() => { setControl(null); resetClock(); }}>
      {control === 'track' && <>
        <dl className="cw-dl"><div><dt>Processing track</dt><dd>{caseRecord.track || 'Not set'}</dd></div><div><dt>Expedited processing requested</dt><dd>{caseRecord.expeditedRequested ? 'Yes' : 'No'}</dd></div></dl>
        {can(role, 'decideExpedite') && !clockForm && <button className="button button--secondary" onClick={() => setClockForm('expedite')}>Record expedite decision</button>}
        {clockFormEl}{eventList([CLOCK_EVENT_KIND.EXPEDITE])}
      </>}
      {control === 'clock' && <>
        <dl className="cw-dl">
          <div><dt>Received date</dt><dd>{displayDueDate(caseRecord.received)}</dd></div>
          <div><dt>Controlling date and basis</dt><dd>{caseRecord.controllingDate ? `${displayDueDate(caseRecord.controllingDate.receivedDate)} – ${caseRecord.controllingDate.basis}` : 'Not established'}</dd></div>
          <div><dt>Recorded target date</dt><dd>{caseRecord.dueDate ? `${displayDueDate(caseRecord.dueDate)} – ${caseRecord.dueDateBasis}` : 'Not established – no date is generated'}</dd></div>
          <div><dt>Calendar days to target</dt><dd>{days ?? 'Not established'}</dd></div>
          <div><dt>Clock state</dt><dd>{caseRecord.clock.state}</dd></div>
        </dl>
        {manageClock && !clockForm && <div className="cw-actions"><button className="button button--secondary" onClick={() => setClockForm('controlling')}>Set controlling date</button><button className="button button--secondary" onClick={() => setClockForm('target')}>Record target date</button></div>}
        {clockFormEl}<h3>Clock events</h3>{eventList()}
      </>}
      {control === 'holds' && <>
        <dl className="cw-dl"><div><dt>Clock state</dt><dd>{caseRecord.clock.state}{caseRecord.clock.holdType ? ` · ${caseRecord.clock.holdType}` : ''}</dd></div></dl>
        {clarificationHoldActive(caseRecord) && <p className="cw-muted">This hold is managed in the clarification workflow.</p>}
        {manageClock && !clockForm && <div className="cw-actions">
          {caseRecord.clock.state === 'Hold recorded' && !clarificationHoldActive(caseRecord) && <button className="button button--secondary" onClick={() => recordClockEvent({ caseId: caseRecord.id, kind: CLOCK_EVENT_KIND.HOLD_ENDED, reason: 'Hold ended by authorised user.', effectiveDate: asOf }, { clock: { ...caseRecord.clock, state: 'Recorded' } })}>End hold</button>}
          <button className="button button--secondary" onClick={() => setClockForm('extension')}>Record extension</button>
        </div>}
        {clockFormEl}{eventList([CLOCK_EVENT_KIND.EXTENSION, CLOCK_EVENT_KIND.HOLD_ENDED, ...Object.values(CLOCK_EVENT_KIND).filter(kind => /hold/i.test(kind))])}
      </>}
      {control === 'clarification' && <ClarificationWorkspace caseRecord={caseRecord}/>}
      {control === 'scope' && <>
        <dl className="cw-dl"><div><dt>Original request</dt><dd>{caseRecord.description || caseRecord.title}</dd></div><div><dt>Records date range</dt><dd>{caseRecord.dateRange || [caseRecord.dateRangeStart, caseRecord.dateRangeEnd].filter(Boolean).join(' – ') || 'Not provided'}</dd></div>
          <div><dt>Clarified scope</dt><dd>{clarifiedScope ? <>{clarifiedScope.scope}<small className="cw-sub">{clarifiedScope.sourceRef} · {clarifiedScope.by}</small></> : 'No clarified scope recorded'}</dd></div></dl>
        <p className="cw-fine">Scope is changed through the clarification workflow so every change is recorded.</p>
        <button className="button button--secondary" onClick={() => setControl('clarification')}>Open clarification</button>
      </>}
      {control === 'closure' && <>
        <h3>Readiness</h3>
        <ul className="cw-checks">
          <li className={gate ? 'no' : 'ok'}>{gate ? `Clarification outstanding: ${gate.label}` : 'No outstanding clarification'}</li>
          <li className={caseRecord.clock.state === 'Hold recorded' ? 'no' : 'ok'}>{caseRecord.clock.state === 'Hold recorded' ? 'Clock hold recorded' : 'No active clock hold'}</li>
          <li className={blocked.length ? 'no' : 'ok'}>{blocked.length ? `${blocked.length} blocked task(s)` : 'No blocked tasks'}</li>
          <li className={tasks.some(isOpen) ? 'no' : 'ok'}>{tasks.filter(isOpen).length} open task(s)</li>
        </ul>
        <div className="cw-row-between"><h3>Closure requests</h3>{can(role, 'requestClosure') && <button className="button button--secondary" onClick={() => setClosureOpen(true)}>Request closure</button>}</div>
        {pendingClosures.length ? <ul className="event-list">{pendingClosures.map(item => <li key={item.id}><strong>{item.kind}</strong><span>{item.reason} · Requested by {item.requestedBy}</span>{can(role, 'approveClosure') && <div><button onClick={() => decideClosure(item.id, true, 'Supervisor / QC approval recorded.')}>Approve</button><button onClick={() => decideClosure(item.id, false, 'Supervisor / QC rejection recorded.')}>Reject</button></div>}</li>)}</ul> : <p className="cw-muted">No pending closure requests.</p>}
      </>}
    </Drawer>}
    {closureOpen && <CloseCaseDialog onClose={() => setClosureOpen(false)} onSubmit={(kind, closureReason) => { requestClosure(caseRecord.id, kind, closureReason); setClosureOpen(false); }}/>}
  </div>;
}

function TaskDetail({ task, tasks, mayManage, rfdLabel, workspace, processor, onOpenTarget, onUpdate }: { task: Task; tasks: Task[]; mayManage: boolean; rfdLabel?: string; workspace: string; processor: string; onOpenTarget: () => void; onUpdate: (changes: Partial<Task>, reason: string) => void }) {
  const deps = (task.dependsOn || []).map(id => tasks.find(item => item.id === id)).filter(Boolean) as Task[];
  const dependants = tasks.filter(item => item.dependsOn?.includes(task.id));
  const open = isOpen(task);
  return <div className="cw-form">
    <dl className="cw-dl">
      <div><dt>Status</dt><dd>{mayManage && open ? <select value={task.status} onChange={event => onUpdate({ status: event.target.value as TaskStatus }, 'Status changed.')}>{[TASK_STATUS.OPEN, TASK_STATUS.IN_PROGRESS, TASK_STATUS.BLOCKED, TASK_STATUS.DONE].map(item => <option key={item}>{item}</option>)}</select> : task.status}</dd></div>
      <div><dt>Priority</dt><dd>{mayManage && open ? <select value={task.priority || ''} onChange={event => onUpdate({ priority: event.target.value as TaskPriority }, 'Priority changed.')}><option value="" disabled>Not set</option>{TASK_PRIORITY.map(item => <option key={item}>{item}</option>)}</select> : task.priority || 'Not set'}</dd></div>
      <div><dt>Owner</dt><dd>{task.ownerName}</dd></div>
      <div><dt>Due date</dt><dd>{displayDueDate(task.dueDate)}</dd></div>
      <div><dt>Type</dt><dd>{task.type}</dd></div>
      <div><dt>Description</dt><dd>{task.description || 'No description recorded'}</dd></div>
      <div><dt>Depends on</dt><dd>{deps.length ? deps.map(item => <span key={item.id} className="cw-sub">{item.title} · {item.status}</span>) : 'None'}</dd></div>
      <div><dt>Required by</dt><dd>{dependants.length ? dependants.map(item => <span key={item.id} className="cw-sub">{item.title}</span>) : 'None'}</dd></div>
      <div><dt>Related workspace</dt><dd>{workspace === 'Processing' ? 'Processing' : <button className="link" onClick={onOpenTarget}>{rfdLabel ? `Open ${rfdLabel} in Records & Documents` : `Open ${workspace}`} →</button>}</dd></div>
    </dl>
    {mayManage && open && <div className="cw-actions">
      <button className="button button--primary" disabled={deps.some(isOpen)} title={deps.some(isOpen) ? 'Complete the tasks this depends on first' : undefined} onClick={() => onUpdate({ status: TASK_STATUS.DONE }, 'Task completed.')}>Mark complete</button>
      <button className="button button--secondary" onClick={() => { const owner = window.prompt('New task owner', processor); if (!owner?.trim()) return; const why = window.prompt('Reason for task reassignment'); if (why?.trim()) onUpdate({ ownerName: owner.trim() }, why.trim()); }}>Reassign</button>
      <button className="button button--secondary" onClick={() => { const why = window.prompt('Reason for task cancellation'); if (why?.trim()) onUpdate({ status: TASK_STATUS.CANCELLED }, why.trim()); }}>Cancel task</button>
    </div>}
  </div>;
}
