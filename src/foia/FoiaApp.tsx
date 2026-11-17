import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, allowedRoles, can } from './permissions';
import { clarificationGate, ClarificationGate, roundsForCase } from './clarification';
import { useStore } from './store';
import { FilterPopover, RowMenu, matches, type FilterSelections } from './components/FilterPopover';
import CorrespondenceTab from './screens/CorrespondenceTab';
import CoordinationFeesTab from './screens/CoordinationFeesTab';
import CoordinationWorklist from './screens/CoordinationWorklist';
import DeterminationReleaseTab from './screens/DeterminationReleaseTab';
import AppealsPage from './screens/AppealsPage';
import FeesWorklist from './screens/FeesWorklist';
import ProcessingTab from './screens/ProcessingTab';
import ProcessingWorklist from './screens/ProcessingWorklist';
import RecordsDocumentsTab from './screens/RecordsDocumentsTab';
import RecordsWorklist from './screens/RecordsWorklist';
import ReviewRedactionTab from './screens/ReviewRedactionTab';
import ReviewWorklist from './screens/ReviewWorklist';
import PortalApp from './screens/PortalApp';
import { Administration as AdministrationPage, ReportsAnalytics } from './screens/AdminReports';
import {
  CASE_STATUS,
  CaseRecord,
  COMPLETENESS,
  Completeness,
  DEMO_USERS,
  INTAKE_ROUTING_FLAG,
  displayDueDate,
  ROLE_VIEWS,
  PROCESSING_TRACK,
  REQUEST_SOURCE,
  REQUESTER_CATEGORY,
  REQUEST_TYPE,
  RequestType,
  TASK_STATUS,
  TERMINAL_STATUSES,
  calendarDays,
  openTask,
} from './types';

type IconName =
  | 'appeals'
  | 'bell'
  | 'briefcase'
  | 'calendar'
  | 'cases'
  | 'chevron'
  | 'clock'
  | 'close'
  | 'collapse'
  | 'coordination'
  | 'dashboard'
  | 'documents'
  | 'download'
  | 'fees'
  | 'folder-up'
  | 'menu'
  | 'more'
  | 'plus'
  | 'plus-circle'
  | 'reports'
  | 'review'
  | 'search'
  | 'settings'
  | 'sparkles'
  | 'tasks'
  | 'trend'
  | 'upload'
  | 'users'
  | 'warning';

const iconPaths: Record<IconName, React.ReactNode> = {
  dashboard: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V21h13V10.5M9 21v-6h6v6"/></>,
  cases: <><path d="M4 5h6l2 2h8v13H4z"/><path d="M4 8h16"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="1"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/></>,
  documents: <><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h4M10 12h6M10 16h6"/></>,
  review: <><path d="M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M12 3v19"/></>,
  coordination: <><path d="M5 8h14M15 4l4 4-4 4M19 16H5M9 12l-4 4 4 4"/></>,
  fees: <><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v5c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 11v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"/></>,
  appeals: <><path d="m14 4 6 6-3 3-6-6zM11 7 5 13M4 20h8M7 13l4 4"/></>,
  reports: <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20"/></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.5-1.2.9-1.9-2.1-2.1-1.9.9-1.2-.5L10.5 3h-3l-.7 2-1.2.5-1.9-.9-2.1 2.1.9 1.9-.5 1.2-2 .7v3l2 .7.5 1.2-.9 1.9 2.1 2.1 1.9-.9 1.2.5.7 2h3l.7-2 1.2-.5 1.9.9 2.1-2.1-.9-1.9.5-1.2z" transform="translate(3) scale(.75)"/></>,
  sparkles: <><path d="m12 2 1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z"/><path d="m5 14 .9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9zM19 14l.7 1.3L21 16l-1.3.7L19 18l-.7-1.3L17 16l1.3-.7z"/></>,
  trend: <><path d="m4 16 5-5 4 4 7-8"/><path d="M15 7h5v5"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  'plus-circle': <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
  'folder-up': <><path d="M3 7h7l2 2h9v10H3z"/><path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5"/></>,
  collapse: <><path d="m14 7-5 5 5 5"/></>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  users: <><circle cx="9" cy="8" r="4"/><path d="M2 21v-2c0-3 3-5 7-5s7 2 7 5v2M16 6a4 4 0 0 1 0 8M18 15c2.5.7 4 2.2 4 4v2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M11 14h2M15 14h2M7 18h2M11 18h2"/></>,
  warning: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17.5h.01"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
  tasks: <><rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
};

function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

const modules = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' as IconName },
  { id: 'cases', label: 'Cases', icon: 'cases' as IconName },
  { id: 'processing', label: 'Processing & Work', icon: 'briefcase' as IconName },
  { id: 'records', label: 'Records & Documents', icon: 'documents' as IconName },
  { id: 'review', label: 'Review & Redaction', icon: 'review' as IconName },
  { id: 'coordination', label: 'Coordination & Referrals', icon: 'coordination' as IconName },
  { id: 'fees', label: 'Fees & Payments', icon: 'fees' as IconName },
  { id: 'appeals', label: 'Appeals & Reopenings', icon: 'appeals' as IconName },
  { id: 'reports', label: 'Reports & Analytics', icon: 'reports' as IconName },
  { id: 'notifications', label: 'Notifications', icon: 'bell' as IconName },
  { id: 'administration', label: 'Administration', icon: 'settings' as IconName },
];

const dashboardRoles = [
  { label: 'FOIA Processor', value: 'Processor' },
  { label: 'Supervisor', value: 'Supervisor / QC' },
  { label: 'Intake Officer', value: 'Intake Staff' },
  { label: 'Reviewer', value: 'Reviewer / Redactor' },
  { label: 'Administrator', value: 'Administrator' },
] as const;

const moduleDescriptions: Record<string, string> = {
  processing: 'Assignments, tasks, queues, and case-processing activities will be managed here.',
  records: 'The case-linked document repository and version history interface has not yet been designed.',
  review: 'The records review, exemption coding, redaction, and quality review interface has not yet been designed.',
  coordination: 'Consultations, referrals, transfers, and related correspondence will be managed here.',
  fees: 'The fee assessment, waiver, notice, and payment interface is pending agency policy decisions.',
  appeals: 'Appeals, decisions, remands, and linked case reopenings will be managed here.',
  reports: 'Operational and approved statutory reporting interfaces have not yet been designed.',
  notifications: 'Assignment, deadline, reminder, and case-event notifications will appear here.',
  administration: 'Authorised user, role, office, template, and reference-data administration will appear here.',
};

function Logo() {
  return <div className="brand-mark" aria-hidden="true"><span className="roof"/><span className="columns">||||</span><span className="steps"/></div>;
}

function Sidebar({ page, collapsed, onCollapse, onNavigate, onToast }: { page: string; collapsed: boolean; onCollapse: () => void; onNavigate: (id: string) => void; onToast: (message: string) => void }) {
  const { state, setRoleView } = useStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const role = state.ui.roleView;
  const user = DEMO_USERS[role];
  const visibleNotifications = state.notifications.filter(item => role === 'Administrator' || item.forRole === role || item.forName === user);
  const initials = user.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  return <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
    <div className="brand">
      <Logo />
      {!collapsed && <strong>FOIA</strong>}
      <button className="icon-button sidebar-toggle" onClick={onCollapse} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
        <Icon name={collapsed ? 'menu' : 'collapse'} size={20} />
      </button>
    </div>
    <nav className="nav-list" aria-label="Primary navigation">
      {modules.map(item => <button key={item.id} className={`nav-item ${page === item.id || (item.id === 'cases' && ['intake', 'case-detail', 'case-confirmation', 'case-assignment'].includes(page)) ? 'active' : ''}`} onClick={() => onNavigate(item.id)} title={collapsed ? item.label : undefined} aria-current={page === item.id ? 'page' : undefined}>
        <Icon name={item.icon} size={24} /><span>{item.label}</span>
        {item.id === 'notifications' && visibleNotifications.some(item => !item.read) && <i className="notification-dot" aria-label="Unread notifications"/>}
      </button>)}
    </nav>
    <div className="profile-wrap">
      {profileOpen && <div className="profile-menu" role="menu">
        <strong>Switch role</strong>
        {dashboardRoles.map(item => <button key={item.value} role="menuitemradio" className={role === item.value ? 'active' : ''} aria-checked={role === item.value} onClick={() => { setRoleView(item.value); setProfileOpen(false); }}>
          <i aria-hidden="true"/><span>{item.label}</span>
        </button>)}
        <button role="menuitem" onClick={() => onToast('Sign-out is managed by your agency sign-in service')}>Sign out</button>
      </div>}
      <button className="profile" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} title={collapsed ? `${user}, ${role}` : undefined}>
        <span className="avatar">{initials}</span>
        <span className="profile-copy"><strong>{user}</strong><small>{dashboardRoles.find(item => item.value === role)?.label || role}</small><em>Role view is a demonstration filter, not access control</em></span>
        <Icon name="chevron" size={16}/>
      </button>
    </div>
  </aside>;
}

function SearchBox({ value, onChange, onSubmit, placeholder, label = 'Search cases' }: { value: string; onChange: (v: string) => void; onSubmit?: () => void; placeholder: string; label?: string }) {
  return <label className="search-box">
    <span className="sr-only">{label}</span><Icon name="search" size={22}/>
    <input value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSubmit?.(); }} placeholder={placeholder}/>
    {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search"><Icon name="close" size={18}/></button>}
  </label>;
}

function PageHeader({ title, subtitle, search, setSearch, onSearchSubmit, onIntake, filter }: { title: string; subtitle?: string; search?: string; setSearch?: (v: string) => void; onSearchSubmit?: () => void; onIntake?: () => void; filter?: React.ReactNode }) {
  const { state } = useStore();
  const mayCreate = can(state.ui.roleView, 'createCase');
  return <header className="page-header">
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {(setSearch || onIntake) && <div className="header-actions">
      {setSearch && <SearchBox value={search || ''} onChange={setSearch} onSubmit={onSearchSubmit} placeholder="Search cases by case ID, requester or request title"/>}
      {filter}
      {onIntake && <button className={`button ${mayCreate ? 'button--primary' : 'button--inactive'}`} onClick={mayCreate ? onIntake : undefined} disabled={!mayCreate} title={!mayCreate ? `Allowed roles: ${allowedRoles('createCase')}` : undefined}><Icon name="plus" size={20}/>Create Intake</button>}
    </div>}
  </header>;
}

type DashboardCaseOpen = (id: string, tab?: string, context?: string) => void;

const taskDestination = (title: string, type: string) => {
  const value = `${title} ${type}`.toLowerCase();
  if (value.includes('redact') || value.includes('review draft')) return 'review-redaction';
  if (value.includes('custodian') || value.includes('follow-up')) return 'coordination-fees';
  if (value.includes('response package') || value.includes('determination')) return 'determination-release';
  if (value.includes('record')) return 'records-documents';
  return 'processing';
};

type AiContext = {
  kind: 'dashboard' | 'module' | 'case';
  label: string;
  caseId?: string;
  moduleId?: string;
};

type AiOpenRequest = {
  token: number;
  question: string;
  context: AiContext;
};

type AiMessage = {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
};

function SharedAiSidebar({ request, onClose }: { request: AiOpenRequest | null; onClose: () => void }) {
  const { state } = useStore();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const role = state.ui.roleView;
  const activeUser = DEMO_USERS[role];
  const allOpen = state.cases.filter(record => !TERMINAL_STATUSES.includes(record.status));
  const authorizedCases = role === 'Processor'
    ? allOpen.filter(record => record.processor === activeUser)
    : role === 'Intake Staff'
      ? allOpen.filter(record => record.status === CASE_STATUS.PENDING_ASSIGNMENT || record.needsClarification)
      : role === 'Reviewer / Redactor'
        ? allOpen.filter(record => [CASE_STATUS.REVIEW, CASE_STATUS.QC_REVIEW].some(status => status === record.status) || record.processor === activeUser)
        : allOpen;
  const answerQuestion = (question: string) => {
    if (!request) return 'The assistant context is unavailable.';
    if (/(approve|release records|official determination|exemption decision)/i.test(question)) {
      return 'That action requires an authorized human decision. I can summarize available information and recommend a review workflow, but I cannot approve exemptions, issue determinations, or release records.';
    }
    if (request.context.kind === 'case' && request.context.caseId) {
      const referencedCases = question.match(/FOIA-\d{4}-\d{4}/g) || [];
      if (referencedCases.some(id => id !== request.context.caseId)) {
        return `This conversation is restricted to ${request.context.caseId}. Open the other case or use the dashboard assistant to ask about unrelated cases.`;
      }
      const record = state.cases.find(item => item.id === request.context.caseId);
      if (!record) return `Case ${request.context.caseId} is unavailable in the current authorized view.`;
      const tasks = state.tasks.filter(task => task.caseId === record.id && openTask(task));
      return `${record.id} is currently ${record.status}, assigned to ${record.processor} on ${record.team}. It has ${tasks.length} open task${tasks.length === 1 ? '' : 's'} and a recorded target of ${displayDueDate(record.dueDate)}. This response is advisory and limited to the selected case.`;
    }
    const overdue = authorizedCases.filter(record => record.dueDate && record.dueDate < state.settings.asOfDate);
    const dueSoon = authorizedCases.filter(record => record.dueDate && calendarDays(state.settings.asOfDate, record.dueDate) >= 0 && calendarDays(state.settings.asOfDate, record.dueDate) <= 5);
    if (request.context.moduleId === 'processing') {
      const tasks = state.tasks.filter(task => openTask(task) && (role === 'Administrator' || role === 'Supervisor / QC' || task.ownerName === activeUser));
      return `${request.context.label} contains ${tasks.length} open work item${tasks.length === 1 ? '' : 's'} available to this role view. ${overdue.length} authorized case${overdue.length === 1 ? ' is' : 's are'} past the recorded target.`;
    }
    if (request.context.moduleId === 'records') {
      const ids = new Set(authorizedCases.map(record => record.id));
      const documents = state.documents.filter(document => ids.has(document.caseId));
      return `${request.context.label} contains ${documents.length} document record${documents.length === 1 ? '' : 's'} across ${authorizedCases.length} authorized open case${authorizedCases.length === 1 ? '' : 's'}.`;
    }
    return `${request.context.label}: ${authorizedCases.length} open case${authorizedCases.length === 1 ? '' : 's'} are available to this role view, including ${overdue.length} overdue and ${dueSoon.length} due within 5 days. Recommendations are advisory and limited to authorized data.`;
  };
  const addQuestion = (question: string, replace = false) => {
    const value = question.trim();
    if (!value || !request) return;
    const next: AiMessage[] = [
      { id: `user-${Date.now()}`, sender: 'user', text: value },
      { id: `assistant-${Date.now()}`, sender: 'assistant', text: answerQuestion(value) },
    ];
    setMessages(current => replace ? next : [...current, ...next]);
    setInput('');
  };
  useEffect(() => {
    if (!request) return;
    setInput('');
    if (request.question.trim()) addQuestion(request.question, true);
    else setMessages([]);
  }, [request?.token]);
  useEffect(() => {
    if (!request) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [request, onClose]);
  if (!request) return null;
  return <div className="shared-ai-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="shared-ai-sidebar" role="dialog" aria-modal="true" aria-labelledby="shared-ai-title">
      <header className="shared-ai-header"><div><span><Icon name="sparkles" size={18}/>AI Assistant</span><h2 id="shared-ai-title">{request.context.label}</h2></div><button onClick={onClose} aria-label="Close AI Assistant"><Icon name="close" size={18}/></button></header>
      <div className="shared-ai-context"><strong>{request.context.kind === 'case' ? `Case ${request.context.caseId}` : request.context.label}</strong><span>UI context does not replace backend authorization.</span></div>
      <div className="shared-ai-conversation" aria-live="polite">
        {messages.length ? messages.map(message => <div className={`ai-message ai-message--${message.sender}`} key={message.id}><strong>{message.sender === 'user' ? 'You' : 'AI Assistant'}</strong><p>{message.text}</p></div>) : <div className="shared-ai-empty"><Icon name="sparkles" size={22}/><strong>Start a conversation</strong><span>Ask a question using the current authorized context.</span></div>}
      </div>
      <form className="shared-ai-composer" onSubmit={event => { event.preventDefault(); addQuestion(input); }}>
        <label className="sr-only" htmlFor="shared-ai-input">Ask a follow-up question</label>
        <input id="shared-ai-input" value={input} onChange={event => setInput(event.target.value)} placeholder="Ask a follow-up question"/>
        <button type="submit" disabled={!input.trim()} aria-label="Send follow-up question">→</button>
      </form>
      <button className="shared-ai-new" onClick={() => { setMessages([]); setInput(''); }}>Start new conversation</button>
    </aside>
  </div>;
}

function Dashboard({ onNavigate, onCase, onIntake, onOpenAi }: { onNavigate: (id: string) => void; onCase: DashboardCaseOpen; onIntake: () => void; onOpenAi: (question: string) => void }) {
  const { state, bulkAssignCases } = useStore();
  const [search, setSearch] = useState('');
  const [question, setQuestion] = useState('');
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [casePicker, setCasePicker] = useState<'upload' | 'search' | null>(null);
  const [casePickerSearch, setCasePickerSearch] = useState('');
  const [bulkAssignments, setBulkAssignments] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!insightsOpen && !activityOpen && !assignmentOpen && !casePicker) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInsightsOpen(false);
        setActivityOpen(false);
        setAssignmentOpen(false);
        setCasePicker(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [insightsOpen, activityOpen, assignmentOpen, casePicker]);
  const role = state.ui.roleView;
  const dashboardRole = dashboardRoles.some(item => item.value === role) ? role : 'Processor';
  const roleLabel = dashboardRoles.find(item => item.value === dashboardRole)?.label || 'FOIA Processor';
  const activeUser = DEMO_USERS[dashboardRole];
  const allOpenCases = state.cases.filter(record => !TERMINAL_STATUSES.includes(record.status));
  const roleCases = dashboardRole === 'Processor'
    ? allOpenCases.filter(record => record.processor === activeUser)
    : dashboardRole === 'Intake Staff'
      ? allOpenCases.filter(record => record.status === CASE_STATUS.PENDING_ASSIGNMENT || record.needsClarification)
      : dashboardRole === 'Reviewer / Redactor'
        ? allOpenCases.filter(record => [CASE_STATUS.REVIEW, CASE_STATUS.QC_REVIEW].some(status => status === record.status) || record.processor === activeUser)
        : allOpenCases;
  const dueSoon = roleCases.filter(record => record.dueDate && calendarDays(state.settings.asOfDate, record.dueDate) >= 0 && calendarDays(state.settings.asOfDate, record.dueDate) <= 5);
  const overdue = roleCases.filter(record => record.dueDate && record.dueDate < state.settings.asOfDate);
  const unassignedCases = state.cases.filter(record => !TERMINAL_STATUSES.includes(record.status) && (record.status === CASE_STATUS.PENDING_ASSIGNMENT || record.processor === 'Unassigned'));
  const scope = dashboardRole === 'Administrator' || dashboardRole === 'Supervisor / QC' ? '' : '&roleScope=1';
  const kpis = [
    ['cases', roleCases.length, 'Open Cases', `cases?open=1${scope}&origin=dashboard`, 'blue'],
    ['calendar', dueSoon.length, 'Due Soon', `cases?due=5${scope}&origin=dashboard`, 'amber'],
    ['warning', overdue.length, 'Overdue', `cases?overdue=1${scope}&origin=dashboard`, 'red'],
    ['users', unassignedCases.length, 'Awaiting Assignment', 'cases?assignment=unassigned&origin=dashboard', 'purple'],
  ] as const;
  const stageDefinitions = [
    ['Intake', [CASE_STATUS.PENDING_ASSIGNMENT, CASE_STATUS.IN_PROGRESS, CASE_STATUS.REOPENED], 'intake'],
    ['Records Search', [CASE_STATUS.RECORDS_SEARCH], 'records'],
    ['Review & Redaction', [CASE_STATUS.REVIEW], 'review'],
    ['Quality Control', [CASE_STATUS.QC_REVIEW], 'qc'],
    ['Pending Response', [CASE_STATUS.DETERMINATION, CASE_STATUS.PENDING_RESPONSE], 'response'],
  ] as const;
  const stages = stageDefinitions.map(([label, statuses, query]) => {
    const cases = roleCases.filter(record => statuses.some(status => status === record.status));
    const atRisk = cases.filter(record => record.risk === 'High' || Boolean(record.dueDate && record.dueDate < state.settings.asOfDate));
    return { label, query, count: cases.length, atRisk: atRisk.length };
  });
  const recordsSearch = stages.find(item => item.query === 'records')!;
  const recordsPercent = roleCases.length ? Math.round(recordsSearch.count / roleCases.length * 100) : 0;
  const suggestedQuestions = [
    roleCases.length > 0 && 'Which cases need my attention today?',
    dueSoon.length > 0 && 'What deadlines are approaching?',
    recordsSearch.count > 0 && 'Why is Records Search becoming a bottleneck?',
  ].filter(Boolean) as string[];
  const roleTasks = state.tasks.filter(openTask).filter(task => dashboardRole === 'Administrator' || dashboardRole === 'Supervisor / QC' || task.ownerName === activeUser || task.ownerRole === dashboardRole).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  const processors = [...new Set(['A. Carter', 'L. Brooks', 'M. Rivera', 'S. Patel', ...state.cases.map(record => record.processor).filter(value => value !== 'Unassigned')])];
  const casePickerCases = roleCases.filter(record => casePicker !== 'search' || record.processor !== 'Unassigned').filter(record => {
    const query = casePickerSearch.trim().toLowerCase();
    return !query || [record.id, record.title, record.requester].some(value => value.toLowerCase().includes(query));
  });
  const quickActions = [
    can(dashboardRole, 'createCase') && { id: 'intake', icon: 'plus-circle' as IconName, title: 'Create Intake', description: 'Register a new FOIA request.', primary: true, action: onIntake },
    can(dashboardRole, 'assignCase') && { id: 'assign', icon: 'users' as IconName, title: 'Assign Cases', description: 'Assign pending intake cases to a processor.', action: () => setAssignmentOpen(true) },
    can(dashboardRole, 'uploadDocument') && { id: 'upload', icon: 'folder-up' as IconName, title: 'Upload Records', description: 'Select a case and open its document upload workflow.', action: () => { setCasePickerSearch(''); setCasePicker('upload'); } },
    can(dashboardRole, 'manageRfd') && { id: 'search', icon: 'search' as IconName, title: 'Start Records Search', description: 'Select an assigned case and open search planning.', action: () => { setCasePickerSearch(''); setCasePicker('search'); } },
    dashboardRole === 'Supervisor / QC' && { id: 'overdue', icon: 'warning' as IconName, title: 'Review Overdue Cases', description: 'Open the current overdue case queue.', action: () => onNavigate('cases?overdue=1&origin=quick-actions') },
    dashboardRole === 'Supervisor / QC' && { id: 'workload', icon: 'tasks' as IconName, title: 'View Workload', description: 'Open the team processing queue.', action: () => onNavigate('processing?segment=Team%20Queue&origin=quick-actions') },
    dashboardRole === 'Intake Staff' && { id: 'new-requests', icon: 'cases' as IconName, title: 'Review New Requests', description: 'Open requests awaiting intake assignment.', action: () => onNavigate('cases?assignment=unassigned&origin=quick-actions') },
    dashboardRole === 'Reviewer / Redactor' && can(dashboardRole, 'reviewDocuments') && { id: 'review-queue', icon: 'review' as IconName, title: 'Open Review Queue', description: 'Continue document review and redaction work.', action: () => onNavigate('review?origin=quick-actions') },
  ].filter(Boolean).slice(0, 4) as Array<{ id: string; icon: IconName; title: string; description: string; primary?: boolean; action: () => void }>;
  const primaryOverdue = overdue[0];
  const insights = [
    primaryOverdue ? {
      title: `Case is overdue: ${primaryOverdue.id}`,
      description: `${displayDueDate(primaryOverdue.dueDate)} recorded target · ${primaryOverdue.status} · Review the outstanding work and next action.`,
      action: 'Open Case',
      onAction: () => onCase(primaryOverdue.id, primaryOverdue.status === CASE_STATUS.REVIEW ? 'review-redaction' : 'processing', 'Overdue case recommendation'),
    } : {
      title: 'No overdue cases in this role view',
      description: 'No open case in the current role scope is past its recorded target date.',
      action: 'Review Open Cases',
      onAction: () => onNavigate(`cases?open=1${scope}&origin=dashboard`),
    },
    {
      title: `Upcoming deadlines: ${dueSoon.length} case${dueSoon.length === 1 ? '' : 's'}`,
      description: dueSoon.length ? `${dueSoon.slice(0, 3).map(record => record.id).join(', ')} ${dueSoon.length === 1 ? 'is' : 'are'} due within 5 days.` : 'No cases in this role view are due within 5 days.',
      action: 'Review Cases',
      onAction: () => onNavigate(`cases?due=5${scope}&origin=dashboard`),
    },
    can(dashboardRole, 'assignCase') ? {
      title: `Unassigned cases: ${unassignedCases.length} case${unassignedCases.length === 1 ? '' : 's'}`,
      description: unassignedCases.length ? 'New intake cases are ready for team and processor assignment.' : 'No intake cases are currently awaiting assignment.',
      action: 'Assign Cases',
      onAction: () => setAssignmentOpen(true),
    } : {
      title: `Records Search workload: ${recordsSearch.count} active case${recordsSearch.count === 1 ? '' : 's'}`,
      description: recordsSearch.count ? `${recordsSearch.atRisk} case${recordsSearch.atRisk === 1 ? '' : 's'} currently meet the configured high-risk or overdue criteria.` : 'No cases in this role view are currently in Records Search.',
      action: 'Review Cases',
      onAction: () => onNavigate(`cases?status=records${scope}&origin=dashboard`),
    },
  ];
  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const value = question.trim();
    if (!value) return;
    onOpenAi(value);
  };
  const roleCaseIds = new Set(roleCases.map(record => record.id));
  const roleActivity = state.audit.filter(event => dashboardRole === 'Administrator' || dashboardRole === 'Supervisor / QC' || (event.caseId ? roleCaseIds.has(event.caseId) : event.actorName === activeUser)).sort((a, b) => b.at.localeCompare(a.at));
  const recent = roleActivity.slice(0, 4);
  return <>
    <header className="dashboard-header">
      <h1>Good morning, Muskaan</h1>
      <div className="dashboard-header-actions">
        <SearchBox value={search} onChange={setSearch} onSubmit={() => search.trim() && onNavigate(`cases?search=${encodeURIComponent(search)}&origin=dashboard`)} placeholder="Search cases, records, or people" label="Search cases, records, or people"/>
        <button className="dashboard-notifications" onClick={() => onNavigate('notifications')} aria-label="Open notifications"><Icon name="bell" size={22}/><i aria-hidden="true"/></button>
      </div>
    </header>
    <section className="dashboard-ai" aria-labelledby="dashboard-ai-title">
      <div className="dashboard-ai-main">
        <div className="dashboard-ai-heading">
          <Icon name="sparkles" size={24}/>
          <div><h2 id="dashboard-ai-title">Ask AI Assistant <span>Beta</span></h2><p>Get case insights, identify risks, and recommend next steps using authorized case data.</p></div>
          <button className="ai-info" aria-label="About AI Assistant" title="Uses only authorized case data. Recommendations are advisory and cannot make determinations, approve exemptions, release records, or perform restricted actions.">i</button>
        </div>
        <form className="dashboard-ai-form" onSubmit={submitQuestion}>
          <label className="sr-only" htmlFor="dashboard-ai-question">Ask AI Assistant a question</label>
          <input id="dashboard-ai-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask a question, e.g., “Which cases should I prioritize today?”"/>
          <button type="submit" disabled={!question.trim()} aria-label="Submit AI question"><span aria-hidden="true">→</span></button>
        </form>
        {suggestedQuestions.length > 0 && <div className="ai-suggestions"><strong>Suggested questions</strong><div>{suggestedQuestions.map(item => <button key={item} onClick={() => { setQuestion(item); onOpenAi(item); }}>{item}</button>)}</div></div>}
      </div>
      <aside className="bottleneck-panel" aria-labelledby="bottleneck-title">
        <div><Icon name="trend" size={18}/><h2 id="bottleneck-title">Potential Bottleneck</h2><button onClick={() => onNavigate(`cases?status=records${scope}&origin=dashboard-bottleneck`)}>Review →</button></div>
        <p><strong>Records Search has {recordsSearch.count} active case{recordsSearch.count === 1 ? '' : 's'} ({recordsPercent}% of open cases).</strong> Average time in stage is unavailable because stage-entry timestamps are not recorded in the current data.</p>
      </aside>
    </section>

    <div className="dashboard-overview-grid">
      <div className="dashboard-kpi-grid">
        {kpis.map(([icon, value, label, target, tone]) => <button className={`dashboard-kpi dashboard-kpi--${tone}`} key={label} onClick={() => onNavigate(target)}>
          <span className="dashboard-kpi-icon"><Icon name={icon} size={20}/></span><span><strong>{value}</strong><small>{label}</small></span><b aria-hidden="true">›</b>
        </button>)}
      </div>
      {quickActions.length > 0 && <section className="dashboard-quick-actions" aria-labelledby="quick-actions-title">
        <div className="quick-actions-heading"><h2 id="quick-actions-title">Quick Actions</h2></div>
        <div className="quick-actions-grid">{quickActions.map(action => <button className={`quick-action-card ${action.primary ? 'quick-action-card--primary' : ''}`} key={action.id} onClick={action.action}>
          <span><Icon name={action.icon} size={20}/></span><div><strong>{action.title}</strong><small>{action.description}</small></div>
        </button>)}</div>
      </section>}
    </div>

    <div className="dashboard-primary-grid">
      <section className="dashboard-card dashboard-insights">
        <div className="dashboard-card-title"><h2><Icon name="sparkles" size={18}/>AI Insights &amp; Recommended Actions</h2><button onClick={() => setInsightsOpen(true)}>View All Insights →</button></div>
        {insights.map(insight => <div className="insight-row" key={insight.title}><div><strong>{insight.title}</strong><p>{insight.description}</p></div><button onClick={insight.onAction}>{insight.action}</button></div>)}
      </section>
      <section className="dashboard-card">
        <div className="dashboard-card-title"><h2>{dashboardRole === 'Supervisor / QC' || dashboardRole === 'Administrator' ? 'Pending Tasks' : 'My Pending Tasks'} ({roleTasks.length})</h2><button onClick={() => onNavigate(dashboardRole === 'Supervisor / QC' || dashboardRole === 'Administrator' ? 'processing?segment=Team%20Queue&origin=dashboard' : 'processing?owner=me&origin=dashboard')}>View All →</button></div>
        <table className="dashboard-task-table"><caption className="sr-only">Pending tasks for the selected {roleLabel} role</caption><thead><tr><th scope="col">Due Date</th><th scope="col">Priority</th><th scope="col">Case ID</th><th scope="col">Next Action</th></tr></thead>
          <tbody>{roleTasks.slice(0, 4).map(task => { const record = state.cases.find(item => item.id === task.caseId); const priority = record?.risk === 'High' || record?.risk === 'Medium' || record?.risk === 'Low' ? record.risk : 'Low'; const tab = taskDestination(task.title, task.type); return <tr key={task.id}><td>{displayDueDate(task.dueDate)}</td><td><span className={`dashboard-priority dashboard-priority--${priority.toLowerCase()}`}>{priority}</span></td><td><button className="link" onClick={() => onCase(task.caseId, tab, task.title)}>{task.caseId}</button></td><td><button className="task-action" onClick={() => onCase(task.caseId, tab, task.title)}>{task.title}</button></td></tr>; })}</tbody>
        </table>
        {!roleTasks.length && <div className="dashboard-empty"><strong>No pending tasks</strong><span>No open task is assigned to this role view.</span></div>}
      </section>
    </div>

    <div className="dashboard-secondary-grid">
      <section className="dashboard-card processing-overview">
        <div className="dashboard-card-title"><h2>Processing Overview</h2><button onClick={() => onNavigate('processing?segment=Team%20Queue&origin=dashboard')}>View Details →</button></div>
        <div className="processing-head processing-head--operational"><span>Processing Stage</span><span>Active</span><span>Avg. Time</span><span>At Risk</span></div>
        {stages.map(stage => <div className="processing-row processing-row--operational" key={stage.label}>
          <button onClick={() => onNavigate(`cases?status=${stage.query}${scope}&origin=dashboard`)}>{stage.label}</button>
          <strong>{stage.count}</strong><span className="unavailable-value" title="Stage-entry timestamps are not recorded">Unavailable</span>
          <button className="risk-count" disabled={!stage.atRisk} onClick={() => onNavigate(`cases?status=${stage.query}&atRisk=1${scope}&origin=dashboard`)}>{stage.atRisk}</button>
        </div>)}
      </section>
      <section className="dashboard-card">
        <div className="dashboard-card-title"><h2>Recent Activity</h2><button onClick={() => setActivityOpen(true)}>View All →</button></div>
        <div className="dashboard-activity">
          {recent.map(event => <button key={event.id} onClick={() => event.caseId ? onCase(event.caseId, 'history', event.action) : onNavigate('cases')}><span><strong>{event.action}</strong>{event.caseId ? ` – ${event.caseId}` : ''}</span><time>{new Date(event.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></button>)}
        </div>
      </section>
    </div>
    {insightsOpen && <div className="dashboard-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setInsightsOpen(false); }}>
      <aside className="insights-drawer" role="dialog" aria-modal="true" aria-labelledby="all-insights-title">
        <div className="drawer-heading"><div><span>Operational AI</span><h2 id="all-insights-title">All Insights</h2></div><button onClick={() => setInsightsOpen(false)} aria-label="Close insights"><Icon name="close" size={18}/></button></div>
        <p>Recommendations use authorized demonstration data for the {roleLabel} view and require human review.</p>
        {insights.map(insight => <article key={insight.title}><h3>{insight.title}</h3><p>{insight.description}</p><button onClick={() => { setInsightsOpen(false); insight.onAction(); }}>{insight.action}</button></article>)}
        <button className="drawer-ai-link" onClick={() => { setInsightsOpen(false); document.getElementById('dashboard-ai-question')?.focus(); }}>Ask an operational question</button>
      </aside>
    </div>}
    {activityOpen && <div className="dashboard-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setActivityOpen(false); }}>
      <aside className="insights-drawer activity-drawer" role="dialog" aria-modal="true" aria-labelledby="all-activity-title">
        <div className="drawer-heading"><div><span>{roleLabel}</span><h2 id="all-activity-title">Activity History</h2></div><button onClick={() => setActivityOpen(false)} aria-label="Close activity history"><Icon name="close" size={18}/></button></div>
        <p>Recent case and workflow events available to the selected role view.</p>
        <div className="activity-drawer-list">{roleActivity.map(event => <button key={event.id} disabled={!event.caseId} onClick={() => { if (event.caseId) { setActivityOpen(false); onCase(event.caseId, 'history', event.action); } }}><span><strong>{event.action}</strong><small>{event.detail}</small></span><time>{new Date(event.at).toLocaleString()}</time></button>)}</div>
        {!roleActivity.length && <div className="dashboard-empty"><strong>No recent activity</strong><span>No activity is available for this role view.</span></div>}
      </aside>
    </div>}
    {assignmentOpen && <div className="dashboard-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAssignmentOpen(false); }}>
      <section className="assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-modal-title">
        <div className="drawer-heading"><div><span>Assignment queue</span><h2 id="assignment-modal-title">Assign Cases</h2></div><button onClick={() => setAssignmentOpen(false)} aria-label="Close assignment"><Icon name="close" size={18}/></button></div>
        <p>Select a processor for each case you are ready to assign. Only selected rows will be updated.</p>
        <div className="assignment-modal-list">{unassignedCases.map(record => <div className="assignment-modal-row" key={record.id}>
          <div><strong>{record.id}</strong><span>{record.title}</span><small>{record.requester} · {record.status}</small></div>
          <label><span>Processor</span><select value={bulkAssignments[record.id] || ''} onChange={event => setBulkAssignments(values => ({ ...values, [record.id]: event.target.value }))}><option value="">Select processor</option>{processors.map(processor => <option key={processor}>{processor}</option>)}</select></label>
        </div>)}</div>
        {!unassignedCases.length && <div className="dashboard-empty"><strong>No cases awaiting assignment</strong><span>The assignment queue is clear.</span></div>}
        <div className="modal-actions"><button className="button button--secondary" onClick={() => setAssignmentOpen(false)}>Cancel</button><button className="button button--primary" disabled={!Object.values(bulkAssignments).some(Boolean)} onClick={() => { const count = bulkAssignCases(Object.entries(bulkAssignments).map(([caseId, processor]) => ({ caseId, processor }))); if (count) { setAssignmentOpen(false); setBulkAssignments({}); } }}>Confirm Assignment</button></div>
      </section>
    </div>}
    {casePicker && <div className="dashboard-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCasePicker(null); }}>
      <section className="case-picker-modal" role="dialog" aria-modal="true" aria-labelledby="case-picker-title">
        <div className="drawer-heading"><div><span>Quick Action</span><h2 id="case-picker-title">{casePicker === 'upload' ? 'Select a Case to Upload Records' : 'Select a Case to Start Records Search'}</h2></div><button onClick={() => setCasePicker(null)} aria-label="Close case selection"><Icon name="close" size={18}/></button></div>
        <p>{casePicker === 'upload' ? 'Choose an authorized case to open its Records & Documents workspace.' : 'Choose an assigned case to open its Processing search-planning workflow.'}</p>
        <label className="case-picker-search"><span>Search cases</span><input value={casePickerSearch} onChange={event => setCasePickerSearch(event.target.value)} placeholder="Search by Case ID, title, or requester"/></label>
        <div className="case-picker-list">{casePickerCases.map(record => <button key={record.id} onClick={() => { const mode = casePicker; setCasePicker(null); onCase(record.id, mode === 'upload' ? 'records-documents' : 'processing', mode === 'upload' ? 'Upload Records quick action' : 'Start Records Search quick action'); }}>
          <span><strong>{record.id}</strong><small>{record.title}</small></span><span>{record.requester}<small>{record.status} · {record.processor}</small></span><b aria-hidden="true">→</b>
        </button>)}</div>
        {!casePickerCases.length && <div className="dashboard-empty"><strong>No matching cases</strong><span>{casePicker === 'search' ? 'No assigned case in this role view matches the search.' : 'No authorized case matches the search.'}</span></div>}
      </section>
    </div>}
  </>;
}
function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return <label className="filter-field"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o}>{o}</option>)}</select></label>;
}

const filterLabels: Record<string, string> = { status: 'Status', team: 'Team', processor: 'Processor', track: 'Track', risk: 'Risk', source: 'Source' };

function Cases({ params, onIntake, onCase, onNavigate }: { params: URLSearchParams; onIntake: () => void; onCase: (id: string) => void; onNavigate: (path: string) => void }) {
  const { state, assignCase } = useStore();
  const [multi, setMulti] = useState<FilterSelections>({});
  const [bulkTeam, setBulkTeam] = useState('');
  const [bulkProcessor, setBulkProcessor] = useState('');
  const [bulkNotice, setBulkNotice] = useState('');
  const cases = state.cases;
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState(params.get('status') || 'All Statuses');
  const [team, setTeam] = useState(params.get('team') || 'All Teams');
  const [processor, setProcessor] = useState(params.get('processor') || 'All Processors');
  const [track, setTrack] = useState(params.get('track') || 'All Tracks');
  const [risk, setRisk] = useState(params.get('risk') || 'All');
  const [sourceFilter, setSourceFilter] = useState(params.get('source') || 'All Sources');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>(DEFAULT_SORT);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [due, setDue] = useState(params.get('due') || '');
  const [overdue, setOverdue] = useState(params.get('overdue') || '');
  const [age, setAge] = useState(params.get('age') || '');
  const [owner, setOwner] = useState(params.get('owner') || '');
  const [hold, setHold] = useState(params.get('hold') || '');
  const [openOnly, setOpenOnly] = useState(params.get('open') || '');
  const [assignment, setAssignment] = useState(params.get('assignment') || '');
  const [roleScope, setRoleScope] = useState(params.get('roleScope') || '');
  const [atRisk, setAtRisk] = useState(params.get('atRisk') || '');
  const clear = () => { setSearch(''); setStatus('All Statuses'); setTeam('All Teams'); setProcessor('All Processors'); setTrack('All Tracks'); setRisk('All'); setSourceFilter('All Sources'); setSort(DEFAULT_SORT); };
  const clearAll = () => { clear(); setMulti({}); setDue(''); setOverdue(''); setAge(''); setOwner(''); setHold(''); setOpenOnly(''); setAssignment(''); setRoleScope(''); setAtRisk(''); };
  const stageStatuses: Record<string, CaseRecord['status'][]> = {
    intake: [CASE_STATUS.PENDING_ASSIGNMENT, CASE_STATUS.IN_PROGRESS, CASE_STATUS.REOPENED],
    records: [CASE_STATUS.RECORDS_SEARCH],
    review: [CASE_STATUS.REVIEW],
    qc: [CASE_STATUS.QC_REVIEW],
    response: [CASE_STATUS.DETERMINATION, CASE_STATUS.PENDING_RESPONSE],
  };
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const activeRoleUser = DEMO_USERS[state.ui.roleView];
    const inRoleScope = (record: CaseRecord) => state.ui.roleView === 'Processor'
      ? record.processor === activeRoleUser
      : state.ui.roleView === 'Intake Staff'
        ? record.status === CASE_STATUS.PENDING_ASSIGNMENT || record.needsClarification
        : state.ui.roleView === 'Reviewer / Redactor'
          ? [CASE_STATUS.REVIEW, CASE_STATUS.QC_REVIEW].some(item => item === record.status) || record.processor === activeRoleUser
          : true;
    const result = cases.filter(c =>
      (!q || [c.id, c.title, c.requester].some(v => v.toLowerCase().includes(q))) &&
      (status === 'All Statuses' || (stageStatuses[status] ? stageStatuses[status].includes(c.status) : status === 'other' ? false : c.status === status)) &&
      (team === 'All Teams' || c.team === team) &&
      (processor === 'All Processors' || c.processor === processor) &&
      (track === 'All Tracks' || c.track === track) &&
      (risk === 'All' || c.risk === risk) &&
      (sourceFilter === 'All Sources' || (c.source || 'Not provided') === sourceFilter) &&
      (!due || Boolean(c.dueDate && due === '5' && calendarDays(state.settings.asOfDate, c.dueDate) >= 0 && calendarDays(state.settings.asOfDate, c.dueDate) <= 5)) &&
      (!overdue || Boolean(c.dueDate && c.dueDate < state.settings.asOfDate && !TERMINAL_STATUSES.includes(c.status))) &&
      (!owner || owner !== 'me' || (state.ui.roleView !== 'Administrator' && c.processor === DEMO_USERS[state.ui.roleView])) &&
      (!hold || (hold === '1' && c.clock.state === 'Hold recorded')) &&
      (!openOnly || !TERMINAL_STATUSES.includes(c.status)) &&
      (!assignment || (assignment === 'unassigned' && !TERMINAL_STATUSES.includes(c.status) && (c.status === CASE_STATUS.PENDING_ASSIGNMENT || c.processor === 'Unassigned'))) &&
      (!roleScope || inRoleScope(c)) &&
      (!atRisk || c.risk === 'High' || Boolean(c.dueDate && c.dueDate < state.settings.asOfDate)) &&
      matches(multi, 'status', c.status) && matches(multi, 'team', c.team) && matches(multi, 'processor', c.processor) && matches(multi, 'track', c.track) && matches(multi, 'risk', c.risk) && matches(multi, 'source', c.source || 'Not provided') &&
      (!age || (() => { const days = calendarDays(c.received, state.settings.asOfDate); if (age === '31+') return days > 30; const [min, max] = age.split('-').map(Number); return days >= min && days <= max; })())
    );
    return sortCases(result, sort.key, sort.dir);
  }, [cases, multi, search, status, team, processor, track, risk, sourceFilter, sort, due, overdue, age, owner, hold, openOnly, assignment, roleScope, atRisk, state.settings.asOfDate, state.ui.roleView]);
  const chips = [
    search && ['Search', search, () => setSearch('')],
    status !== 'All Statuses' && ['Status', status, () => setStatus('All Statuses')],
    team !== 'All Teams' && ['Team', team, () => setTeam('All Teams')],
    processor !== 'All Processors' && ['Processor', processor, () => setProcessor('All Processors')],
    risk !== 'All' && ['Risk', risk, () => setRisk('All')],
    sourceFilter !== 'All Sources' && ['Source', sourceFilter, () => setSourceFilter('All Sources')],
    due && ['Due', 'Next 5 calendar days', () => setDue('')],
    overdue && ['Due', 'Overdue', () => setOverdue('')],
    age && ['Age', age, () => setAge('')],
    owner && ['Owner', 'Me', () => setOwner('')],
    hold && ['Clock', 'Recorded hold', () => setHold('')],
    openOnly && ['Status', 'Open cases', () => setOpenOnly('')],
    assignment && ['Assignment', 'Awaiting assignment', () => setAssignment('')],
    roleScope && ['Role scope', dashboardRoles.find(item => item.value === state.ui.roleView)?.label || state.ui.roleView, () => setRoleScope('')],
    atRisk && ['Risk', 'High risk or overdue', () => setAtRisk('')],
    ...Object.entries(multi).flatMap(([key, values]) => values.map(value => [filterLabels[key], value, () => setMulti(m => ({ ...m, [key]: m[key].filter(v => v !== value) }))])),
  ].filter(Boolean) as Array<[string, string, () => void]>;
  const filterCategories = [
    { id: 'status', label: 'Status', options: Object.values(CASE_STATUS).map(value => ({ value })) },
    { id: 'team', label: 'Assigned Team', options: [...new Set(cases.map(c => c.team))].map(value => ({ value })) },
    { id: 'processor', label: 'Assigned Processor', options: [...new Set(cases.map(c => c.processor))].map(value => ({ value })) },
    { id: 'track', label: 'Processing Track', options: Object.values(PROCESSING_TRACK).map(value => ({ value })) },
    { id: 'risk', label: 'Due Date Risk', options: ['High', 'Medium', 'Low'].map(value => ({ value })) },
    { id: 'source', label: 'Source', options: [...new Set(cases.map(c => c.source || 'Not provided'))].map(value => ({ value })) },
  ];
  const mayAssign = can(state.ui.roleView, 'assignCase');
  const selectedCases = cases.filter(c => selected.includes(c.id));
  const assignable = selectedCases.filter(isBulkAssignable);
  const ineligible = selectedCases.filter(c => !isBulkAssignable(c));
  const bulkTeams = Object.keys(prototypeTeams);
  const runBulkAssign = () => {
    if (bulkBusy || !bulkTeam || !bulkProcessor) return;
    setBulkBusy(true);
    let done = 0;
    assignable.filter(isBulkAssignable).forEach(c => { if (assignCase(c.id, bulkTeam, bulkProcessor, '', c.track === PROCESSING_TRACK.COMPLEX ? PROCESSING_TRACK.COMPLEX : PROCESSING_TRACK.STANDARD, 'Bulk assignment from Cases list')) done += 1; });
    setBulkNotice(`${done} case${done === 1 ? '' : 's'} assigned to ${bulkProcessor} (${bulkTeam}).`);
    setSelected([]); setBulkTeam(''); setBulkProcessor(''); setBulkBusy(false);
  };
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id));
  return <>
    <PageHeader title="Cases" search={search} setSearch={setSearch} onIntake={onIntake} filter={<FilterPopover categories={filterCategories} applied={multi} onApply={next => { setMulti(next); setStatus('All Statuses'); setTeam('All Teams'); setProcessor('All Processors'); setTrack('All Tracks'); setRisk('All'); setSourceFilter('All Sources'); }}/>}/>
    {chips.length > 0 && <div className="cases-toolbar"><button className="clear-button" onClick={clearAll}>Clear all filters</button></div>}
    {chips.length > 0 && <div className="filter-chips" aria-label="Applied filters">{chips.map(([label, value, remove]) => <button key={`${label}-${value}`} onClick={remove}>{label}: {value} <span aria-hidden="true">×</span></button>)}</div>}
    {bulkNotice && <p className="bulk-notice" role="status">{bulkNotice} <button className="link" onClick={() => setBulkNotice('')}>Dismiss</button></p>}
    {selected.length > 0 && <div className="bulk-toolbar" role="region" aria-label="Bulk actions">
      <div className="bulk-summary">
        <strong>{selected.length} case{selected.length === 1 ? '' : 's'} selected{mayAssign && <> · {assignable.length} eligible for bulk assignment</>}</strong>
        {mayAssign && ineligible.length > 0 && <span className="bulk-hint">{assignable.length > 0 ? 'Will assign: ' + assignable.map(c => c.id).join(', ') + '. ' : 'Bulk assignment is unavailable: only cases pending assignment can be bulk assigned. '}Excluded (already assigned or in progress): {ineligible.map(c => c.id).join(', ')}.</span>}
      </div>
      {mayAssign && <>{assignable.length > 0 ? <>
        <label><span className="sr-only">Team</span><select value={bulkTeam} onChange={e => { setBulkTeam(e.target.value); setBulkProcessor(''); }}><option value="">Select a team</option>{bulkTeams.map(t => <option key={t}>{t}</option>)}</select></label>
        <label><span className="sr-only">Processor</span><select value={bulkProcessor} disabled={!bulkTeam} onChange={e => setBulkProcessor(e.target.value)}><option value="">Select a processor</option>{(prototypeTeams[bulkTeam] || []).map(p => <option key={p}>{p}</option>)}</select></label>
        <button className="button button--primary" disabled={!bulkTeam || !bulkProcessor || bulkBusy} onClick={runBulkAssign}>Assign {assignable.length} eligible case{assignable.length === 1 ? '' : 's'}</button>
      </> : <button className="button button--primary" disabled>Assign 0 eligible cases</button>}</>}
      <button className="button button--secondary" onClick={() => setSelected([])}>Clear selection</button>
    </div>}
    <section className="case-table-panel">
      <div className="table-scroll"><table className="case-table">
        <thead><tr>
          <th><input type="checkbox" aria-label="Select all cases" checked={filtered.length > 0 && selected.length === filtered.length} onChange={toggleAll}/></th>
          {SORT_COLUMNS.map(([label, key]) => key ? <SortHeader key={label} label={label} active={sort.key === key} dir={sort.dir} onSort={() => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'received' ? 'desc' : 'asc' })}/> : <th key={label}>{label}</th>)}<th><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>{filtered.map(c => <tr key={c.id} className={selected.includes(c.id) ? 'selected' : ''}>
          <td><input type="checkbox" aria-label={`Select ${c.id}`} checked={selected.includes(c.id)} onChange={() => setSelected(s => s.includes(c.id) ? s.filter(id => id !== c.id) : [...s, c.id])}/></td>
          <td><button className="link" onClick={() => onCase(c.id)}>{c.id}</button></td><td className="title-cell">{c.title}</td><td>{c.requester}</td>
          <td>{new Date(`${c.received}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
          <td><span className={`badge badge--neutral status-${c.status.toLowerCase().replaceAll(' ', '-').replace('–', '-')}`}>{c.status}</span></td><td>{c.team}</td><td>{c.processor}</td><td><span>{displayDueDate(c.dueDate)}</span><small className="date-sublabel">Recorded target - not a statutory deadline</small></td>
          <td>{c.risk === '—' ? '—' : <span className={`badge badge--neutral risk-${c.risk.toLowerCase().replaceAll(' ', '-')}`}>{c.risk}</span>}</td>
          <td><RowMenu label={`Actions for ${c.id}`} items={[
            { label: 'Open case', onSelect: () => onCase(c.id) },
            ...(mayAssign && c.status === CASE_STATUS.PENDING_ASSIGNMENT ? [{ label: 'Assign case', onSelect: () => onNavigate(`case-assignment?id=${encodeURIComponent(c.id)}`) }] : []),
            ...(mayAssign && c.status !== CASE_STATUS.PENDING_ASSIGNMENT && !TERMINAL_STATUSES.includes(c.status) ? [{ label: 'Reassign case', onSelect: () => onNavigate(`case-assignment?id=${encodeURIComponent(c.id)}&mode=reassign`) }] : []),
            { label: 'View correspondence', onSelect: () => onNavigate(`case-detail?id=${encodeURIComponent(c.id)}&tab=correspondence`) },
          ]}/></td>
        </tr>)}</tbody>
      </table></div>
      {filtered.length === 0 && <div className="table-empty"><Icon name="search" size={32}/><strong>No cases found</strong><span>Try adjusting your search or filters.</span><button className="link" onClick={clearAll}>Clear filters</button></div>}
      <div className="pagination"><label>Rows per page <select defaultValue="25"><option>25</option><option>50</option></select></label><span>1 – {filtered.length} of {filtered.length}</span><div><button disabled aria-label="Previous page">‹</button><button className="current">1</button><button disabled aria-label="Next page">›</button></div></div>
    </section>
  </>;
}

type SortKey = 'id' | 'title' | 'requester' | 'received' | 'status' | 'team' | 'processor' | 'dueDate';
const DEFAULT_SORT: { key: SortKey; dir: 'asc' | 'desc' } = { key: 'received', dir: 'desc' };
const SORT_COLUMNS: Array<[string, SortKey | null]> = [['Case ID', 'id'], ['Request Title', 'title'], ['Requester', 'requester'], ['Date Received', 'received'], ['Case Status', 'status'], ['Assigned Team', 'team'], ['Assigned Processor', 'processor'], ['Due Date', 'dueDate'], ['Risk', null]];
/** Only unassigned cases still pending assignment are eligible for bulk assignment. */
export const isBulkAssignable = (c: { status: string }) => c.status === CASE_STATUS.PENDING_ASSIGNMENT;
export function sortCases<T extends Record<SortKey, unknown>>(list: T[], key: SortKey, dir: 'asc' | 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = String(a[key] ?? ''), bv = String(b[key] ?? '');
    if (!av && bv) return 1; if (av && !bv) return -1;
    return sign * av.localeCompare(bv, 'en', { numeric: true }) || String(b.id).localeCompare(String(a.id));
  });
}
function SortHeader({ label, active, dir, onSort }: { label: string; active: boolean; dir: 'asc' | 'desc'; onSort: () => void }) {
  return <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={`sort-header ${active ? 'is-active' : ''}`} onClick={onSort}>
      {label}
      <svg className="sort-icon" width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
        <path d="M5 1 9 5H1z" className={active && dir === 'asc' ? 'on' : ''}/>
        <path d="M5 13 1 9h8z" className={active && dir === 'desc' ? 'on' : ''}/>
      </svg>
      <span className="sr-only">{active ? `, sorted ${dir === 'asc' ? 'ascending' : 'descending'}. Activate to reverse.` : ', activate to sort'}</span>
    </button>
  </th>;
}

type FormErrors = Record<string, string>;

function FieldError({ error }: { error?: string }) {
  return error ? <span className="field-error" role="alert">{error}</span> : null;
}

const MATCH_DECISIONS = ['Not reviewed', 'Possible duplicate', 'Related', 'Unrelated'] as const;
type MatchDecision = (typeof MATCH_DECISIONS)[number];

function Intake({ onCancel, onCreate }: { onCancel: () => void; onCreate: (data: Parameters<ReturnType<typeof useStore>['createCase']>[0]) => void }) {
  const { state } = useStore();
  const [requesterType, setRequesterType] = useState('Individual');
  const [requestName, setRequestName] = useState('');
  const [title, setTitle] = useState('');
  const [received, setReceived] = useState('');
  const [description, setDescription] = useState('');
  const [requestType, setRequestType] = useState<RequestType>(REQUEST_TYPE.FOIA);
  const [completeness, setCompleteness] = useState<Completeness>(COMPLETENESS.COMPLETE);
  const [matchDecisions, setMatchDecisions] = useState<Record<string, MatchDecision>>({});
  const [clarificationReason, setClarificationReason] = useState('');
  const [routingFlags, setRoutingFlags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [source, setSource] = useState('');
  const emailRequired = source === REQUEST_SOURCE.EMAIL;
  const relatedCaseIds = Object.entries(matchDecisions).filter(([, value]) => value === 'Related' || value === 'Possible duplicate').map(([id]) => id);
  const duplicateIds = Object.entries(matchDecisions).filter(([, value]) => value === 'Possible duplicate').map(([id]) => id);
  const [errors, setErrors] = useState<FormErrors>({});
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const next: FormErrors = {};
    ['source', 'received', 'fullName', 'title'].forEach(name => { if (!String(data.get(name) || '').trim()) next[name] = 'This field is required.'; });
    if (!description.trim()) next.description = 'This field is required.';
    const emailValue = String(data.get('email') || '').trim();
    if (emailRequired && !emailValue) next.email = 'Email address is required when the request source is Email.';
    else if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) next.email = 'Enter a valid email address, such as name@example.com.';
    const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (!next.received && String(data.get('received')) > todayIso) next.received = 'Date received cannot be later than the current date.';
    if (requesterType === 'Organization' && !String(data.get('organization') || '').trim()) next.organization = 'Enter the organization name.';
    if (completeness === COMPLETENESS.NEEDS_CLARIFICATION && !clarificationReason.trim()) next.clarificationReason = 'Explain what the requester needs to clarify.';
    if (submitting) return;
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.field-error')?.parentElement?.querySelector<HTMLElement>('input, select, textarea')?.focus());
      return;
    }
    setSubmitting(true);
    onCreate({
      title: String(data.get('title')),
      requester: String(data.get('fullName')),
      received: String(data.get('received')),
      requesterType,
      requestType,
      needsClarification: completeness === COMPLETENESS.NEEDS_CLARIFICATION,
      relatedCaseIds,
      possibleDuplicateOfIds: duplicateIds,
      intakeRoutingFlags: routingFlags,
      clarificationReason: completeness === COMPLETENESS.NEEDS_CLARIFICATION ? clarificationReason.trim() : undefined,
      source: String(data.get('source')),
      description,
      email: String(data.get('email')),
      phone: String(data.get('phone')),
      address: String(data.get('address')),
      responseFormat: String(data.get('responseFormat') || 'Not specified'),
      feeCategory: String(data.get('feeCategory') || ''),
      dateRangeStart: String(data.get('dateRangeStart') || ''),
      dateRangeEnd: String(data.get('dateRangeEnd') || ''),
      dateRange: data.get('dateRangeStart') || data.get('dateRangeEnd') ? `${String(data.get('dateRangeStart') || 'Not provided')} - ${String(data.get('dateRangeEnd') || 'Not provided')}` : undefined,
      expeditedRequested: data.get('expeditedRequested') === 'on',
      willingToPayFees: data.get('willingToPayFees') === 'on',
      attachments: files.map(file => ({ name: file.name, sizeKb: Math.round(file.size / 1024), mime: file.type || 'application/octet-stream' })),
    });
  };
  const titleWords = new Set(title.toLowerCase().match(/[a-z0-9]+/g)?.filter(word => word.length >= 4) || []);
  const possibleRelated = state.cases.filter(record => {
    const sameRequester = requestName.trim() && record.requesterKey === requestName.trim().toLowerCase();
    const words = record.title.toLowerCase().match(/[a-z0-9]+/g)?.filter(word => word.length >= 4) || [];
    const sharedWords = words.filter(word => titleWords.has(word)).length;
    return sameRequester || sharedWords >= 2;
  }).slice(0, 5);
  const addFiles = (incoming: FileList | null) => incoming && setFiles(current => [...current, ...Array.from(incoming)]);
  return <>
    <div className="intake-heading">
      <div className="breadcrumb"><button onClick={onCancel}>Cases</button><span>›</span><strong>Create Intake</strong></div>
      <h1>Create Intake</h1><p>Capture a new FOIA request and create a case for tracking and processing.</p>
    </div>
    <form className="intake-form" onSubmit={submit} noValidate>
      <FormSection title="Request Information"><div className="form-grid form-grid--three">
        <label>Request Source <Required/><select name="source" className={errors.source ? 'invalid' : ''} value={source} onChange={event => { setSource(event.target.value); if (event.target.value !== REQUEST_SOURCE.EMAIL) setErrors(current => { const { email, ...rest } = current; return email?.startsWith('Email address is required') ? rest : current; }); }}><option value="" disabled>Select source</option>{Object.values(REQUEST_SOURCE).filter(value => value !== REQUEST_SOURCE.NOT_PROVIDED).map(value => <option key={value}>{value}</option>)}</select><FieldError error={errors.source}/></label>
        <label>Date Received <Required/><input name="received" type="date" value={received} onChange={event => setReceived(event.target.value)} className={errors.received ? 'invalid' : ''}/><FieldError error={errors.received}/></label>
        <label>Received By<input value={DEMO_USERS[state.ui.roleView]} readOnly aria-readonly="true"/></label>
        <fieldset className="span-two"><legend>Request Type</legend><div className="radio-row"><label><input type="radio" checked={requestType === REQUEST_TYPE.FOIA} onChange={() => setRequestType(REQUEST_TYPE.FOIA)}/> {REQUEST_TYPE.FOIA}</label><label><input type="radio" checked={requestType === REQUEST_TYPE.PRIVACY_ACT} onChange={() => setRequestType(REQUEST_TYPE.PRIVACY_ACT)}/> {REQUEST_TYPE.PRIVACY_ACT}</label></div><small>Privacy Act requests may be handled by a separate office depending on the agency; Privacy Act routing rules are pending agency confirmation</small></fieldset>
      </div></FormSection>
      <FormSection title="Requester Details"><div className="form-grid form-grid--two">
        <fieldset><legend>Requester Type <Required/></legend><div className="radio-row"><label><input type="radio" name="requesterType" checked={requesterType === 'Individual'} onChange={() => setRequesterType('Individual')}/> Individual</label><label><input type="radio" name="requesterType" checked={requesterType === 'Organization'} onChange={() => setRequesterType('Organization')}/> Organization</label></div></fieldset>
        <label>Full Name <Required/><input name="fullName" value={requestName} onChange={event => setRequestName(event.target.value)} placeholder="Enter full name" className={errors.fullName ? 'invalid' : ''}/><FieldError error={errors.fullName}/></label>
        {requesterType === 'Organization' && <label>Organization Name <Required/><input name="organization" placeholder="Enter organization name" className={errors.organization ? 'invalid' : ''}/><FieldError error={errors.organization}/></label>}
        <label>Email Address {emailRequired && <Required/>}<input name="email" type="email" placeholder="Enter email address" aria-required={emailRequired} className={errors.email ? 'invalid' : ''}/><FieldError error={errors.email}/></label>
        <label>Phone Number<input name="phone" type="tel" placeholder="Enter phone number"/></label>
        <label className="span-two">Mailing Address <small>(if available)</small><input name="address" placeholder="Enter mailing address"/></label>
        <label>Requester / Fee Category <small>(if configured)</small><select name="feeCategory" defaultValue=""><option value="">Select a configured category</option>{Object.values(REQUESTER_CATEGORY).map(value => <option key={value}>{value}</option>)}</select></label>
      </div></FormSection>
      <FormSection title="Request Details"><div className="form-grid form-grid--two">
        <label className="span-two">Request Title <Required/><input name="title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Enter a concise request title" className={errors.title ? 'invalid' : ''}/><FieldError error={errors.title}/></label>
        <label className="span-two">Request Description <Required/><span className="textarea-wrap"><textarea name="description" value={description} maxLength={4000} onChange={e => setDescription(e.target.value)} placeholder="Describe the records being requested" className={errors.description ? 'invalid' : ''}/><small>{description.length.toLocaleString()} / 4,000</small></span><FieldError error={errors.description}/></label>
        <fieldset><legend>Requested Records Date Range <small>(if known)</small></legend><div className="date-range"><input name="dateRangeStart" type="date" aria-label="Records start date"/><span>to</span><input name="dateRangeEnd" type="date" aria-label="Records end date"/></div></fieldset>
        <label>Preferred Response Format <small>(if applicable)</small><select name="responseFormat" defaultValue=""><option value="">Select format</option><option>Electronic</option><option>Paper</option><option>Other configured format</option></select></label>
      </div></FormSection>
      <FormSection title="Possible duplicate or related requests">
        <p className="form-help">Suggestions use a simple check: same requester name, or at least two shared title words. This is not automated duplicate detection. Review each match and record a decision; nothing is merged, rejected or closed.</p>
        {possibleRelated.length ? <ul className="related-match-list">{possibleRelated.map(record => <li key={record.id}><div><strong>{record.id}</strong><span>{record.title} · {record.requester} · {record.status}</span></div>
          <label className="match-decision"><span className="sr-only">Decision for {record.id}</span><select value={matchDecisions[record.id] || 'Not reviewed'} onChange={event => setMatchDecisions(current => ({ ...current, [record.id]: event.target.value as MatchDecision }))}>{MATCH_DECISIONS.map(value => <option key={value}>{value}</option>)}</select></label>
        </li>)}</ul> : <div className="table-empty table-empty--compact"><strong>No possible matches found</strong><span>Enter a requester name or request title to check for matches.</span></div>}
        {duplicateIds.length > 0 && <p className="field-warning">Marked as a possible duplicate of {duplicateIds.join(', ')}. The case will still be registered and linked; how duplicates are handled follows agency policy.</p>}
      </FormSection>
      <FormSection title="Is the request clear and complete?">
        <div className="radio-stack">
          <label><input type="radio" checked={completeness === COMPLETENESS.COMPLETE} onChange={() => setCompleteness(COMPLETENESS.COMPLETE)}/> Yes — register the case and draft an acknowledgement</label>
          <label><input type="radio" checked={completeness === COMPLETENESS.NEEDS_CLARIFICATION} onChange={() => setCompleteness(COMPLETENESS.NEEDS_CLARIFICATION)}/> No — register the case and start a clarification request</label>
        </div>
        {completeness === COMPLETENESS.NEEDS_CLARIFICATION && <label className="clarification-reason">What needs clarification? <Required/><textarea value={clarificationReason} onChange={event => setClarificationReason(event.target.value)} placeholder="For example: the date range and the office that holds the records are not specified" className={errors.clarificationReason ? 'invalid' : ''}/><FieldError error={errors.clarificationReason}/></label>}
        <p className="form-help">{completeness === COMPLETENESS.NEEDS_CLARIFICATION ? 'A clarification letter draft and a task for Intake are created. Sending the letter and placing the clock on hold continue in the case’s Correspondence and Processing tabs.' : 'An acknowledgement letter draft is created and the case waits for team assignment. No statutory due date is calculated.'}</p>
        <fieldset className="routing-flags"><legend>Routing considerations <small>(if applicable)</small></legend>
          {Object.values(INTAKE_ROUTING_FLAG).map(flag => <label key={flag}><input type="checkbox" checked={routingFlags.includes(flag)} onChange={() => setRoutingFlags(current => current.includes(flag) ? current.filter(item => item !== flag) : [...current, flag])}/> {flag}</label>)}
          <small>Recorded on the case for the assigning supervisor. Transfer and multi-office rules are not yet defined, so nothing is routed automatically.</small>
        </fieldset>
      </FormSection>
      <FormSection title="Additional Information"><div className="check-grid">
        <label><input name="expeditedRequested" type="checkbox"/> Expedited Processing Requested <span className="info" title="A request does not indicate approval.">i</span></label>
        <label><input name="willingToPayFees" type="checkbox"/> Willing to Pay Fees <small>(if applicable)</small> <span className="info" title="Fee handling follows approved agency policy.">i</span></label>
      </div></FormSection>
      <FormSection title={<>Attachments <span>(Optional)</span></>}>
        <div className="drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
          <Icon name="upload" size={28}/><p>Drag and drop files here, or <button type="button" onClick={() => fileRef.current?.click()}>Browse files</button></p>
          <small>File formats and maximum size follow approved technical configuration.</small>
          <input ref={fileRef} type="file" multiple hidden onChange={e => addFiles(e.target.files)}/>
        </div>
        {files.length > 0 && <ul className="file-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><Icon name="documents" size={20}/><span><strong>{file.name}</strong><small>{file.type || 'File'} · {(file.size / 1024).toFixed(0)} KB · Uploaded</small></span><button type="button" onClick={() => setFiles(f => f.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><Icon name="close" size={18}/></button></li>)}</ul>}
      </FormSection>
      <div className="form-actions"><button type="button" className="button button--secondary" onClick={onCancel}>Cancel</button><button className="button button--primary" type="submit" disabled={submitting}>{submitting ? 'Registering…' : 'Register Case'}</button></div>
    </form>
  </>;
}

function Required() { return <span className="required" aria-label="required">*</span>; }
function FormSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return <section className="form-section"><h2>{title}</h2><div className="form-section-body">{children}</div></section>;
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return <><PageHeader title={title}/><div className="placeholder"><span><Icon name="briefcase" size={28}/></span><h2>Interface unavailable</h2><p>{description}</p></div></>;
}

function CaseConfirmation({ caseRecord, onView, onCases, onAssign, onClarify }: { caseRecord: CaseRecord; onView: () => void; onCases: () => void; onAssign: () => void; onClarify: () => void }) {
  const { state } = useStore();
  const clarification = caseRecord.needsClarification;
  const letter = state.correspondence.find(item => item.caseId === caseRecord.id && (item.type === (clarification ? 'Clarification request' : 'Acknowledgement')));
  const mayAssign = can(state.ui.roleView, 'assignCase');
  const assigned = caseRecord.team !== 'Unassigned';
  const ownership = assigned ? `${caseRecord.team} · ${caseRecord.processor}` : 'Not yet routed — awaiting team and processor assignment';
  return <div className="confirmation-wrap">
    <section className={`confirmation-card ${clarification ? 'confirmation-card--warning' : ''}`} aria-labelledby="confirmation-title">
      <div className="confirmation-heading"><span aria-hidden="true">{clarification ? '!' : '✓'}</span><div><h1 id="confirmation-title">{clarification ? 'Case registered — clarification needed' : 'Case registered'}</h1><p>{clarification ? 'The case was created and handed off to the clarification process. Send the clarification letter to the requester next.' : 'The request has been registered. Route it to the responsible team to begin processing.'}</p></div></div>
      <dl className="confirmation-summary">
        <div><dt>Case ID</dt><dd><button className="link" onClick={onView}>{caseRecord.id}</button></dd></div>
        <div><dt>Status</dt><dd>{caseRecord.status}{clarification ? ' · Clarification pending' : ''}</dd></div>
        <div><dt>Received</dt><dd>{displayDueDate(caseRecord.received)}</dd></div>
        <div><dt>{clarification ? 'Clarification letter' : 'Acknowledgement'}</dt><dd>{letter ? `${letter.status} — Not Sent` : 'Not created'}</dd></div>
        <div><dt>Ownership</dt><dd>{ownership}</dd></div>
        {clarification && <div><dt>Reason</dt><dd>{caseRecord.clarificationReason || 'Not provided'}</dd></div>}
        {caseRecord.relatedCaseIds.length > 0 && <div><dt>Linked cases</dt><dd>{caseRecord.relatedCaseIds.join(', ')}{caseRecord.possibleDuplicateOfIds?.length ? ` (possible duplicate: ${caseRecord.possibleDuplicateOfIds.join(', ')})` : ''}</dd></div>}
        {caseRecord.intakeRoutingFlags?.length ? <div><dt>Routing notes</dt><dd>{caseRecord.intakeRoutingFlags.join('; ')}</dd></div> : null}
      </dl>
      <div className="confirmation-actions">
        {clarification
          ? <button className="button button--primary" onClick={onClarify}>Prepare clarification letter</button>
          : !assigned && mayAssign ? <button className="button button--primary" onClick={onAssign}>Assign team and processor</button> : null}
        <button className={`button ${!clarification && (assigned || !mayAssign) ? 'button--primary' : 'button--secondary'}`} onClick={onView}>Open case workspace</button>
        <button className="button button--secondary" onClick={onCases}>Return to Cases</button>
      </div>
      {!clarification && !assigned && !mayAssign && <p className="form-help">Your role cannot assign cases. A routing task was created for the supervisor.</p>}
    </section>
  </div>;
}

const workspaceTabs = ['Overview', 'Processing', 'Records & Documents', 'Review & Redaction', 'Coordination & Fees', 'Correspondence', 'Determination & Release', 'History'];
const tabSlug = (tab: string) => tab.toLowerCase().replaceAll(' & ', '-').replaceAll(' ', '-');

function DetailList({ items }: { items: Array<[string, string]> }) {
  return <dl className="detail-list">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>;
}

export function nextAction(caseRecord: CaseRecord, tasks: ReturnType<typeof useStore>['state']['tasks'], asOfDate: string, gate?: ClarificationGate | null) {
  if (caseRecord.status === CASE_STATUS.PENDING_ASSIGNMENT) return 'Complete assignment';
  if (gate) return `Clarification${gate.round ? ` round ${gate.round}` : ''}: ${gate.label}`;
  if (caseRecord.clock.state === 'Hold recorded') return `Hold recorded${caseRecord.clock.holdType ? ` (${caseRecord.clock.holdType})` : ''}`;
  const active = tasks.filter(task => task.caseId === caseRecord.id && openTask(task));
  const overdue = active.filter(task => task.dueDate && task.dueDate < asOfDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  if (overdue[0]) return `Overdue: ${overdue[0].title}`;
  const earliest = [...active].sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))[0];
  if (earliest) return earliest.title;
  if (caseRecord.status === CASE_STATUS.IN_PROGRESS) return 'Plan records search';
  return 'No action currently available';
}

const LIFECYCLE = ['Intake & Registration', 'Assignment & Ownership', 'Processing', 'Records Search', 'Review & Redaction', 'Quality Control', 'Determination & Release', 'Closure'];
const fmtDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function lifecycleIndex(status: string) {
  switch (status) {
    case CASE_STATUS.PENDING_ASSIGNMENT: return 1;
    case CASE_STATUS.RECORDS_SEARCH: return 3;
    case CASE_STATUS.REVIEW: return 4;
    case CASE_STATUS.QC_REVIEW: return 5;
    case CASE_STATUS.DETERMINATION: case CASE_STATUS.PENDING_RESPONSE: return 6;
    case CASE_STATUS.CLOSED: case CASE_STATUS.TRANSFERRED: return 8;
    default: return 2;
  }
}

function CaseWorkspace({ caseRecord, initialTab, contextLabel, onBack, onAssign, onReassign, onCase, onOpenAi }: { caseRecord: CaseRecord; initialTab?: string; contextLabel?: string; onBack: () => void; onAssign: () => void; onReassign: () => void; onCase: (id: string) => void; onOpenAi: () => void }) {
  const { state, updateCase, addAudit, linkRelatedCases } = useStore();
  const validTab = workspaceTabs.find(item => tabSlug(item) === initialTab) || workspaceTabs.find(item => item === initialTab);
  const [tab, setTab] = useState(validTab || 'Overview');
  const [historyFilter, setHistoryFilter] = useState('All actions');
  const [editing, setEditing] = useState<'request' | 'requester' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [actionPanel, setActionPanel] = useState<'note' | 'link' | null>(null);
  const [note, setNote] = useState('');
  const [relatedId, setRelatedId] = useState('');
  useEffect(() => setTab(validTab || 'Overview'), [validTab, initialTab, caseRecord.id]);
  useEffect(() => { if (window.location.hash.includes('focus=clarification')) setTimeout(() => document.getElementById('clarification')?.scrollIntoView({ block: 'start' }), 150); }, [caseRecord.id, initialTab]);
  const assigned = caseRecord.team !== 'Unassigned' && caseRecord.processor !== 'Unassigned';
  const mayAssign = can(state.ui.roleView, 'assignCase');
  const mayEdit = can(state.ui.roleView, 'editCase');
  const received = new Date(`${caseRecord.received}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const days = caseRecord.dueDate ? calendarDays(state.settings.asOfDate, caseRecord.dueDate) : null;
  const caseTasks = state.tasks.filter(task => task.caseId === caseRecord.id);
  const outstandingTasks = caseTasks.filter(openTask);
  const gate = clarificationGate(state.clarificationRounds, state.correspondence, caseRecord);
  const action = nextAction(caseRecord, state.tasks, state.settings.asOfDate, gate);
  const clarRounds = roundsForCase(state.clarificationRounds, caseRecord.id);
  const latestRound = clarRounds[clarRounds.length - 1];
  const latestScope = [...clarRounds].reverse().find(item => item.scopeUpdate)?.scopeUpdate;
  const openClarification = () => { changeTab('Processing'); setTimeout(() => document.getElementById('clarification')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); };
  const recent = state.audit.filter(event => event.caseId === caseRecord.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const related = caseRecord.relatedCaseIds.map(id => state.cases.find(record => record.id === id)).filter(Boolean) as CaseRecord[];
  const controllingDate = caseRecord.controllingDate ? `${caseRecord.controllingDate.receivedDate} (${caseRecord.controllingDate.basis})` : 'Not yet set';
  const changeTab = (item: string) => {
    setTab(item);
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    params.set('id', caseRecord.id);
    params.set('tab', tabSlug(item));
    window.location.hash = `#/case-detail?${params.toString()}`;
  };
  const metrics: Array<[IconName, string, string]> = [
    ['review', 'Processing Track', caseRecord.track || 'Not set'],
    ['users', 'Assigned Team', caseRecord.team],
    ['users', 'Assigned To', caseRecord.processor],
    ['calendar', 'Controlling Received Date', caseRecord.controllingDate?.receivedDate ? fmtDate(caseRecord.controllingDate.receivedDate) : 'Not established'],
    ['calendar', 'Recorded Target Date', caseRecord.dueDate ? displayDueDate(caseRecord.dueDate) : 'Not established'],
    ['warning', 'Deadline Risk', !caseRecord.risk || caseRecord.risk === '—' ? 'Not assessed' : caseRecord.risk],
  ];
  const noAction = action === 'No action currently available';
  const runNextAction = () => { if (gate) openClarification(); else if (!assigned && mayAssign) onAssign(); else changeTab('Processing'); };
  const stageIdx = lifecycleIndex(caseRecord.status);
  const completed = Math.min(stageIdx, LIFECYCLE.length);
  const workflowLabel = gate ? `Clarification${gate.round ? ` — Round ${gate.round}` : ''}` : action;
  const priorRound = clarRounds.length > 1 ? clarRounds[clarRounds.length - 2] : undefined;
  const statusTitle = gate ? (gate.step === 'assess' ? 'Awaiting clarification assessment' : gate.label) : caseRecord.status;
  const statusText = gate
    ? `${priorRound ? `Clarification Round ${priorRound.round} is recorded as ${priorRound.status}. ` : ''}Clarification${gate.round ? ` Round ${gate.round}` : ''} is active. The next recorded step is: ${gate.label}.`
    : `The case is ${caseRecord.status}. The next recorded action is: ${action}.`;
  const insights = [
    clarRounds.length ? `${clarRounds.length} clarification round${clarRounds.length > 1 ? 's' : ''} recorded for this case${latestRound ? `; latest is ${latestRound.status}` : ''}.` : 'No clarification rounds are recorded for this case.',
    `${outstandingTasks.length} outstanding task${outstandingTasks.length === 1 ? '' : 's'} on this case.`,
    `Clock state: ${caseRecord.clock.state}.`,
    ...(latestScope?.scope ? [`Latest clarified scope: ${latestScope.scope}`] : []),
  ];
  const recommendation = gate ? `${gate.label}${gate.round ? ` (Round ${gate.round})` : ''}.` : action;
  const [stageOpen, setStageOpen] = useState(false);
  const caseDocs = state.documents.filter(document => document.caseId === caseRecord.id);
  return <>
    <div className="case-heading">
      <div className="breadcrumb"><button onClick={onBack}>Cases</button><span>›</span><strong>{caseRecord.id}</strong></div>
      <div className="case-title-row">
        <div><div className="case-id-line"><h1>{caseRecord.title}</h1><span className={`badge ${assigned ? 'status-in-progress' : 'status-records-search'}`}>{caseRecord.status}</span></div>
          <div className="case-meta"><span><Icon name="users" size={16}/>{caseRecord.requester}</span><span>{caseRecord.requesterType || 'Individual'}</span><span>Received: {received}</span><span>Source: {caseRecord.source || 'Email'}</span></div>
        </div>
        <div className="case-actions">
          <button className="button button--primary" onClick={runNextAction} disabled={noAction}>{noAction ? action : `Next Action: ${action}`}<span aria-hidden="true">→</span></button>
          <div className="more-actions-wrap"><button className="button button--secondary" onClick={() => setMoreOpen(value => !value)} aria-expanded={moreOpen}>More Actions ▾</button>
            {moreOpen && <div className="more-actions-menu">
              {mayAssign && !assigned && <button onClick={onAssign}>Complete assignment</button>}
              <button disabled={!can(state.ui.roleView, 'reassignCase') || !assigned} title={!can(state.ui.roleView, 'reassignCase') ? `Allowed roles: ${allowedRoles('reassignCase')}` : undefined} onClick={onReassign}>Reassign</button>
              <button disabled={!can(state.ui.roleView, 'addNote')} onClick={() => { setActionPanel('note'); setMoreOpen(false); }}>Add note</button>
              <button disabled={!state.settings.coordinationInScope} onClick={() => { changeTab('Coordination & Fees'); setMoreOpen(false); }}>Transfer request</button>
              <button onClick={() => { changeTab('Processing'); setMoreOpen(false); }}>Record withdrawal</button>
              <button onClick={() => { changeTab('Processing'); setMoreOpen(false); }}>Follow up / Administratively close</button>
              <button disabled={!can(state.ui.roleView, 'linkRelatedCase')} onClick={() => { setActionPanel('link'); setMoreOpen(false); }}>Link related case</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
    {contextLabel && <div className="viewing-banner" role="status">Opened from dashboard: {contextLabel}</div>}
    {actionPanel === 'note' && <section className="action-panel"><h2>Add internal note</h2><textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Enter an internal case note"/><div><button className="button button--secondary" onClick={() => setActionPanel(null)}>Cancel</button><button className="button button--primary" disabled={!note.trim()} onClick={() => { addAudit({ caseId: caseRecord.id, action: 'Note added', detail: note.trim() }); setNote(''); setActionPanel(null); }}>Add note</button></div></section>}
    {actionPanel === 'link' && <section className="action-panel"><h2>Link related case</h2><label>Related case<select value={relatedId} onChange={event => setRelatedId(event.target.value)}><option value="">Select a case</option>{state.cases.filter(record => record.id !== caseRecord.id && !caseRecord.relatedCaseIds.includes(record.id)).map(record => <option key={record.id} value={record.id}>{record.id} - {record.title}</option>)}</select></label><div><button className="button button--secondary" onClick={() => setActionPanel(null)}>Cancel</button><button className="button button--primary" disabled={!relatedId} onClick={() => { if (linkRelatedCases(caseRecord.id, relatedId)) { setRelatedId(''); setActionPanel(null); } }}>Link case</button></div></section>}
    <div className="case-strip">{metrics.map(([icon, label, value]) => <div className="case-strip-item" key={label}><Icon name={icon} size={20}/><div><span>{label}</span><strong>{value}</strong></div></div>)}</div>
    <div className="workspace-tabs" role="tablist" aria-label="Case workspace sections">{workspaceTabs.map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => changeTab(item)}>{item}</button>)}</div>
    {tab === 'Overview' ? <div className="ov">
      <section className="ov-card ov-lifecycle">
        <div className="ov-head"><h2>Case Lifecycle</h2><div className="ov-progress"><strong>{completed} of {LIFECYCLE.length} stages completed</strong><span><i style={{ width: `${(completed / LIFECYCLE.length) * 100}%` }}/></span></div></div>
        <ol className="lc-track">{LIFECYCLE.map((label, i) => <li key={label} className={i < stageIdx ? 'done' : i === stageIdx ? 'active' : ''} aria-current={i === stageIdx ? 'step' : undefined}><b>{i < stageIdx ? '✓' : i + 1}</b><span>{label}</span></li>)}</ol>
        <div className="lc-band"><strong>Current stage: {stageIdx < LIFECYCLE.length ? LIFECYCLE[stageIdx] : 'Closed'}</strong><span>Current workflow: {workflowLabel}</span><button className="link" aria-expanded={stageOpen} onClick={() => setStageOpen(v => !v)}>View stage details {stageOpen ? '▴' : '▾'}</button></div>
        {stageOpen && <DetailList items={[
          ['Case Status', caseRecord.status],
          ['Owner and Team', `${caseRecord.processor} · ${caseRecord.team}`],
          ['Next Action', action],
          ['Recorded Target Date', `${displayDueDate(caseRecord.dueDate)} · ${caseRecord.dueDateBasis}`],
          ['Clock State', caseRecord.clock.state],
          ['Controlling Date', controllingDate],
          ['Clarification Round', latestRound ? `Round ${latestRound.round} of ${clarRounds.length} · ${latestRound.status}` : 'Not started'],
          ['Clarified Scope', latestScope?.scope || 'Not yet recorded'],
        ]}/>}
      </section>
      <div className="ov-row ov-row--status">
        <section className="ov-card"><div className="ov-head"><h2><Icon name="documents" size={20}/>Current Case Status</h2>{gate && <button className="link" onClick={openClarification}>{gate.step === 'draft' || gate.step === 'start' ? 'Prepare clarification letter' : 'Continue clarification'}</button>}</div>
          <div className="ov-status"><div><h3>{statusTitle}</h3><p>{statusText}</p></div>
            <dl><div><dt>Current workflow</dt><dd>{workflowLabel}</dd></div><div><dt>Status</dt><dd>{gate ? <span className="ov-pill ov-pill--warn">{gate.step === 'assess' ? 'Assessment pending' : gate.label}</span> : caseRecord.status}</dd></div>{gate && <div><dt>Dependency</dt><dd>Records Search cannot proceed until clarification is resolved.</dd></div>}</dl>
          </div>
        </section>
        <section className="ov-card ov-ai" aria-label={`AI assistant for ${caseRecord.id}`}><div className="ov-head"><h2><Icon name="sparkles" size={20}/>AI Case Assistant</h2><span className="ov-ai-id">{caseRecord.id}</span></div>
          <ul>{insights.map(item => <li key={item}>{item}</li>)}</ul>
          <div className="ov-ai-foot"><div className="ov-rec"><span>Recommended next step</span><strong>{recommendation}</strong></div><button className="button button--secondary" onClick={onOpenAi}>Ask AI Assistant</button></div>
        </section>
      </div>
      <div className="ov-row ov-row--details">
        <section className="ov-card"><div className="ov-head"><h2><Icon name="documents" size={20}/>Request Details</h2>{mayEdit && <button className="link" onClick={() => setEditing('request')}>Edit</button>}</div>
          {editing === 'request' ? <InlineCaseEdit caseRecord={caseRecord} section="request" onCancel={() => setEditing(null)} onSave={changes => { updateCase(caseRecord.id, changes, 'Request details edited.'); setEditing(null); }}/> : <dl className="ov-fields">
            <div><dt>Request title</dt><dd>{caseRecord.title}</dd></div>
            <div><dt>Description</dt><dd>{caseRecord.description || 'Not provided'}</dd></div>
            <div className="ov-pair"><div><dt>Records date range</dt><dd>{caseRecord.dateRange || 'Not provided'}</dd></div><div><dt>Response format</dt><dd>{caseRecord.responseFormat || 'Not provided'}</dd></div></div>
          </dl>}
        </section>
        <section className="ov-card"><div className="ov-head"><h2><Icon name="users" size={20}/>Requester Details</h2>{mayEdit && <button className="link" onClick={() => setEditing('requester')}>Edit</button>}</div>
          {editing === 'requester' ? <InlineCaseEdit caseRecord={caseRecord} section="requester" onCancel={() => setEditing(null)} onSave={changes => { updateCase(caseRecord.id, changes, 'Requester details edited.'); setEditing(null); }}/> : <dl className="ov-fields">
            <div><dt>Name</dt><dd>{caseRecord.requester}</dd></div>
            <div><dt>Requester type</dt><dd>{caseRecord.requesterType || 'Individual'}</dd></div>
            <div><dt>Email / Phone</dt><dd>{[caseRecord.email, caseRecord.phone].filter(Boolean).join(' · ') || 'Not provided'}</dd></div>
          </dl>}
        </section>
        <section className="ov-card"><div className="ov-head"><h2><Icon name="tasks" size={20}/>Outstanding Tasks ({outstandingTasks.length})</h2><button className="link" onClick={() => changeTab('Processing')}>View all tasks →</button></div>
          {outstandingTasks.length ? <table className="ov-tasks"><thead><tr><th>Task</th><th>Owner</th><th>Status</th></tr></thead><tbody>{outstandingTasks.map(task => <tr key={task.id}><td>{task.title}</td><td>{task.ownerName}</td><td><span className={`ov-pill ov-pill--${task.status.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{task.status}</span></td></tr>)}</tbody></table> : <p className="ov-empty">No outstanding tasks.</p>}
        </section>
      </div>
      <div className="ov-row ov-row--two">
        <section className="ov-card"><div className="ov-head"><h2><Icon name="cases" size={20}/>Related Cases</h2>{related.length > 0 && <button className="link" onClick={() => onCase(related[0].id)}>View related cases →</button>}</div>
          {related.length ? <ul className="ov-list">{related.map(record => <li key={record.id}><button className="link" onClick={() => onCase(record.id)}>{record.id}</button><span>{record.title}</span></li>)}</ul> : <p className="ov-empty">No related cases found.</p>}
        </section>
        <section className="ov-card"><div className="ov-head"><h2><Icon name="documents" size={20}/>Attachments</h2><button className="link" onClick={() => changeTab('Records & Documents')}>View documents →</button></div>
          {caseDocs.length ? <ul className="ov-list">{caseDocs.map(document => <li key={document.id}><strong>{document.name}</strong><span>{document.sizeKb} KB · {document.uploadStatus}</span></li>)}</ul> : <p className="ov-empty">No attachments.</p>}
        </section>
      </div>
      <section className="ov-card"><div className="ov-head"><h2><Icon name="clock" size={20}/>Recent Activity</h2><button className="link" onClick={() => changeTab('History')}>View history →</button></div>
        {recent.length ? <ol className="ov-timeline">{recent.map((event, i) => <li key={event.id} className={i === recent.length - 1 ? 'first' : ''}><i/><strong>{event.action}</strong><span>{event.detail}</span><time>{new Date(event.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></li>)}</ol> : <p className="ov-empty">No recent activity.</p>}
      </section>
    </div> : tab === 'Processing' ? <ProcessingTab caseRecord={caseRecord} nextAction={action}/>
      : tab === 'Records & Documents' ? <RecordsDocumentsTab caseRecord={caseRecord}/>
      : tab === 'Review & Redaction' ? <ReviewRedactionTab caseRecord={caseRecord}/>
      : tab === 'Coordination & Fees' ? <CoordinationFeesTab caseRecord={caseRecord}/>
      : tab === 'Correspondence' ? <CorrespondenceTab caseRecord={caseRecord}/>
      : tab === 'Determination & Release' ? <DeterminationReleaseTab caseRecord={caseRecord}/>
      : tab === 'History' ? <HistoryTab caseId={caseRecord.id} filter={historyFilter} onFilter={setHistoryFilter}/>
      : <NotFound onCases={onBack}/>}
  </>;
}

function InlineCaseEdit({ caseRecord, section, onCancel, onSave }: { caseRecord: CaseRecord; section: 'request' | 'requester'; onCancel: () => void; onSave: (changes: Partial<CaseRecord>) => void }) {
  const [values, setValues] = useState({
    title: caseRecord.title,
    description: caseRecord.description || '',
    dateRange: caseRecord.dateRange || '',
    responseFormat: caseRecord.responseFormat || '',
    requesterType: caseRecord.requesterType || 'Individual',
    requester: caseRecord.requester,
    email: caseRecord.email || '',
    phone: caseRecord.phone || '',
    address: caseRecord.address || '',
  });
  const field = (name: keyof typeof values, label: string) => <label>{label}<input value={values[name]} onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))}/></label>;
  const save = () => section === 'request'
    ? onSave({ title: values.title, description: values.description, dateRange: values.dateRange, responseFormat: values.responseFormat })
    : onSave({ requesterType: values.requesterType, requester: values.requester, requesterKey: values.requester.trim().toLowerCase(), email: values.email, phone: values.phone, address: values.address });
  return <div className="inline-edit"><div className="form-grid form-grid--two">
    {section === 'request' ? <>{field('title', 'Request Title')}<label className="span-two">Request Description<textarea value={values.description} onChange={event => setValues(current => ({ ...current, description: event.target.value }))}/></label>{field('dateRange', 'Requested Records Date Range')}{field('responseFormat', 'Preferred Response Format')}</> : <>{field('requesterType', 'Requester Type')}{field('requester', 'Full Name')}{field('email', 'Email Address')}{field('phone', 'Phone Number')}<span className="span-two">{field('address', 'Mailing Address')}</span></>}
  </div><div className="inline-edit-actions"><button className="button button--secondary" onClick={onCancel}>Cancel</button><button className="button button--primary" onClick={save}>Save</button></div></div>;
}

function HistoryTab({ caseId, filter, onFilter }: { caseId: string; filter: string; onFilter: (value: string) => void }) {
  const { state } = useStore();
  const events = state.audit.filter(event => event.caseId === caseId);
  const actions = [...new Set(events.map(event => event.action))];
  const visible = events.filter(event => filter === 'All actions' || event.action === filter).sort((a, b) => b.at.localeCompare(a.at));
  return <section className="history-panel">
    <div className="history-toolbar"><h2>Case History</h2><label>Action filter<select value={filter} onChange={event => onFilter(event.target.value)}><option>All actions</option>{actions.map(action => <option key={action}>{action}</option>)}</select></label></div>
    {visible.length ? <ol className="history-list">{visible.map(event => <li key={event.id}><i/><div><strong>{event.action}</strong><p>{event.detail}</p>{event.from && <small>{event.from} → {event.to}{event.reason ? ` · ${event.reason}` : ''}</small>}<span>{event.actorName} · {event.actorRole}</span></div><time>{new Date(event.at).toLocaleString()}</time></li>)}</ol> : <div className="tab-empty"><h2>No history events</h2><p>No events match this action filter.</p></div>}
  </section>;
}

const prototypeTeams: Record<string, string[]> = {
  'FOIA Operations – Environmental': ['A. Carter', 'L. Brooks'],
  'FOIA Operations – General': ['A. Carter', 'L. Brooks', 'M. Rivera', 'S. Patel'],
};

type AssignmentPayload = { team: string; processor: string; secondary: string; track: string; notes: string; moveTaskIds: string[] };

function Assignment({ caseRecord, mode, onCancel, onConfirm }: { caseRecord: CaseRecord; mode: 'assign' | 'reassign'; onCancel: () => void; onConfirm: (payload: AssignmentPayload) => void }) {
  const { state } = useStore();
  const reassigning = mode === 'reassign';
  const [team, setTeam] = useState(reassigning ? caseRecord.team : '');
  const [processor, setProcessor] = useState(reassigning ? caseRecord.processor : '');
  const [secondary, setSecondary] = useState('');
  const [track, setTrack] = useState<string>(caseRecord.track === PROCESSING_TRACK.STANDARD || caseRecord.track === PROCESSING_TRACK.COMPLEX ? caseRecord.track : PROCESSING_TRACK.STANDARD);
  const [notes, setNotes] = useState('');
  const movableTasks = state.tasks.filter(task => task.caseId === caseRecord.id && task.ownerName === caseRecord.processor && openTask(task));
  const [moveTaskIds, setMoveTaskIds] = useState<string[]>(movableTasks.map(task => task.id));
  const [errors, setErrors] = useState<FormErrors>({});
  const teamNames = [...new Set([...Object.keys(prototypeTeams), ...state.cases.map(record => record.team).filter(value => value !== 'Unassigned')])];
  const processorsByTeam = teamNames.reduce<Record<string, string[]>>((result, name) => {
    result[name] = [...new Set([...(prototypeTeams[name] || []), ...state.cases.filter(record => record.team === name && record.processor !== 'Unassigned').map(record => record.processor)])];
    return result;
  }, {});
  const processors = team ? processorsByTeam[team] || [] : [];
  const applyRecommendation = () => { setTeam('FOIA Operations – Environmental'); setProcessor('A. Carter'); setErrors({}); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: FormErrors = {};
    if (!team) next.team = 'Select an assigned team.';
    if (!processor) next.processor = 'Select a primary processor.';
    if (reassigning && !notes.trim()) next.notes = 'Enter a reason for reassignment.';
    setErrors(next);
    if (!Object.keys(next).length) onConfirm({ team, processor, secondary, track, notes, moveTaskIds });
  };
  const received = new Date(`${caseRecord.received}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return <>
    <div className="intake-heading"><div className="breadcrumb"><button onClick={onCancel}>Cases</button><span>›</span><button onClick={onCancel}>{caseRecord.id}</button><span>›</span><strong>{reassigning ? 'Reassign Case' : 'Assign Case'}</strong></div><h1>{reassigning ? 'Reassign Case' : 'Assign Case'}</h1><p>{reassigning ? `Change ownership from ${caseRecord.processor} and decide which open tasks move.` : 'Assign a team and processor to initiate records search and processing.'}</p></div>
    <section className="assignment-summary"><h2>Case Summary</h2><dl>
      <div><dt>Case ID</dt><dd>{caseRecord.id}</dd></div><div><dt>Request Title</dt><dd>{caseRecord.title}</dd></div><div><dt>Requester</dt><dd>{caseRecord.requester} ({caseRecord.requesterType || 'Individual'})</dd></div><div><dt>Received</dt><dd>{received}</dd></div><div><dt>Source</dt><dd>{caseRecord.source || 'Email'}</dd></div><div><dt>Current Status</dt><dd><span className="badge status-records-search">{caseRecord.status}</span></dd></div>
    </dl></section>
    <div className="assignment-layout">
      <form className="assignment-form" onSubmit={submit} noValidate>
        <div className="assignment-form-heading"><h2>Assignment Details</h2><p>Fields marked with an asterisk are required.</p></div>
        <div className="assignment-fields">
          <label>Assigned Team <Required/><select value={team} onChange={e => { setTeam(e.target.value); setProcessor(''); }} className={errors.team ? 'invalid' : ''}><option value="">Select a team</option>{teamNames.map(t => <option key={t}>{t}</option>)}</select><FieldError error={errors.team}/></label>
          <label>Primary Processor <Required/><select value={processor} onChange={e => setProcessor(e.target.value)} disabled={!team} className={errors.processor ? 'invalid' : ''}><option value="">Select a processor</option>{processors.map(p => <option key={p}>{p}</option>)}</select><FieldError error={errors.processor}/></label>
          <label>Secondary Processor <small>(optional)</small><select value={secondary} onChange={e => setSecondary(e.target.value)} disabled={!team}><option value="">No secondary processor</option>{processors.filter(p => p !== processor).map(p => <option key={p}>{p}</option>)}</select></label>
          <label>Processing Track <Required/><select value={track} onChange={event => setTrack(event.target.value)}><option>{PROCESSING_TRACK.STANDARD}</option><option>{PROCESSING_TRACK.COMPLEX}</option></select></label>
          <label className="span-two">{reassigning ? <>Reassignment Reason <Required/></> : <>Assignment Notes <small>(optional, internal)</small></>}<textarea value={notes} onChange={e => setNotes(e.target.value)} className={errors.notes ? 'invalid' : ''} placeholder={reassigning ? 'Explain why ownership is changing' : 'Add internal assignment context'}/><FieldError error={errors.notes}/></label>
          {reassigning && <fieldset className="span-two task-transfer"><legend>Open tasks owned by {caseRecord.processor}</legend>{movableTasks.length ? movableTasks.map(task => <label key={task.id}><input type="checkbox" checked={moveTaskIds.includes(task.id)} onChange={() => setMoveTaskIds(ids => ids.includes(task.id) ? ids.filter(id => id !== task.id) : [...ids, task.id])}/>{task.title}</label>) : <p>No open tasks are owned by the previous owner.</p>}</fieldset>}
        </div>
        <div className="assignment-actions"><button type="button" className="button button--secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button button--primary">{reassigning ? 'Confirm Reassignment' : 'Confirm Assignment'}</button></div>
      </form>
      <aside className="ai-recommendation"><div className="assistant-heading"><h2><Icon name="review" size={22}/>AI Assignment Recommendation</h2><span>Advisory</span></div><p className="sample-label">AI-assisted - requires human review before applying</p>
        <dl><div><dt>Suggested Team</dt><dd>FOIA Operations – Environmental</dd></div><div><dt>Suggested Processor</dt><dd>A. Carter</dd></div><div><dt>Reasoning</dt><dd>The request concerns environmental compliance records related to the Riverside Hospital project, making the Environmental team a potentially appropriate assignment.</dd></div></dl>
        <button className="button button--secondary" onClick={applyRecommendation}>Apply Recommendation</button>
      </aside>
    </div>
  </>;
}

function Notifications({ onCase }: { onCase: (id: string) => void }) {
  const { state, markNotificationsRead } = useStore();
  const role = state.ui.roleView;
  const user = DEMO_USERS[role];
  const notifications = state.notifications.filter(item => role === 'Administrator' || item.forRole === role || item.forName === user).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <>
    <PageHeader title="Notifications" subtitle="Case and task notifications for the active role view."/>
    <section className="panel notification-page">
      <div className="panel-title"><h2>{role === 'Administrator' ? 'All notifications' : `Notifications for ${user}`}</h2><button onClick={markNotificationsRead} disabled={!notifications.some(item => !item.read)}>Mark all read</button></div>
      {notifications.length ? <ul className="notification-list">{notifications.map(item => <li key={item.id} className={item.read ? '' : 'unread'}><i/><div><strong>{item.text}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div>{item.caseId && <button className="link" onClick={() => onCase(item.caseId!)}>Open {item.caseId}</button>}</li>)}</ul> : <div className="table-empty"><Icon name="bell" size={32}/><strong>No notifications</strong><span>There are no notifications for this role view.</span></div>}
    </section>
  </>;
}

const settingRows = [
  ['coordinationInScope', 'Coordination', 'Conditional feature'],
  ['feesInScope', 'Fees', 'Conditional feature'],
  ['appealsInScope', 'Appeals', 'Conditional feature'],
  ['portalInScope', 'Public Portal', 'Conditional feature'],
  ['readingRoomInScope', 'Reading Room', 'Conditional feature'],
  ['outboundApprovalRequired', 'Outbound approval required', 'policy pending'],
  ['qcForNoRecords', 'QC for no-records', 'policy pending'],
  ['showAiAssistant', 'Show AI Case Assistant', 'AI-assisted - requires human review'],
] as const;

function Administration() {
  const { state, updateSettings, resetData } = useStore();
  const editable = can(state.ui.roleView, 'editSettings');
  const permissionTitle = editable ? undefined : `Allowed roles: ${allowedRoles('editSettings')}`;
  return <>
    <PageHeader title="Administration" subtitle="Manage system settings and conditional feature visibility."/>
    <div className="workspace-tabs"><button className="active">System Settings</button></div>
    <section className="settings-panel">
      <div className="settings-heading"><div><h2>System Settings</h2><p>Configure the reporting date and feature visibility.</p></div></div>
      <label className="settings-date">Reporting date<input type="date" value={state.settings.asOfDate} disabled={!editable} title={permissionTitle} onChange={event => {
        if (!event.target.value || Number.isNaN(new Date(`${event.target.value}T12:00:00`).getTime())) return;
        updateSettings({ asOfDate: event.target.value });
      }}/><small>Used for counts, overdue checks and aging.</small></label>
      <div className="settings-list">{settingRows.map(([key, label, reference]) => <label key={key} title={permissionTitle}>
        <span><strong>{label}</strong><small>{reference}</small></span>
        {key !== 'showAiAssistant' && <em className="badge badge--conditional">Conditional - pending client decision</em>}
        <input type="checkbox" checked={state.settings[key]} disabled={!editable} onChange={event => updateSettings({ [key]: event.target.checked })}/>
      </label>)}</div>
      <div className="settings-footer"><button className="button button--secondary" disabled={!editable} title={permissionTitle} onClick={resetData}>Reset case data</button><p>There are no delete or purge actions. Retention rules are pending.</p></div>
    </section>
  </>;
}

function NotFound({ onCases }: { onCases: () => void }) {
  return <><PageHeader title="Not found"/><div className="placeholder"><span><Icon name="search" size={28}/></span><h2>Page or case not found</h2><p>The requested route or case ID does not exist.</p><button className="button button--primary" onClick={onCases}>Go to Cases</button></div></>;
}

function getRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, query = ''] = hash.split('?');
  return { page: path, params: new URLSearchParams(query) };
}

export default function App() {
  const { state, createCase, assignCase, reassignCase, clearMessage, setRoleView } = useStore();
  const [route, setRoute] = useState(getRoute);
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState('');
  const [aiRequest, setAiRequest] = useState<AiOpenRequest | null>(null);
  const [portalGuard, setPortalGuard] = useState(false);
  const switchingToStaff = useRef(false);
  useEffect(() => {
    if (switchingToStaff.current) return;
    const sync = () => setRoute(getRoute());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    const message = toast || state.message;
    if (!message) return;
    const timer = window.setTimeout(() => { setToast(''); clearMessage(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [toast, state.message, clearMessage]);
  const navigate = (id: string) => {
    const nextHash = `#/${id}`;
    if (window.location.hash === nextHash) {
      const [page, query = ''] = id.split('?');
      setRoute({ page, params: new URLSearchParams(query) });
    } else {
      window.location.hash = nextHash;
    }
    document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => {
    const portalRoute = route.page === 'portal' || route.page.startsWith('portal/');
    if (portalRoute && state.ui.roleView !== 'Requester (Portal)') setRoleView('Requester (Portal)');
    if (state.ui.roleView === 'Requester (Portal)' && !portalRoute) {
      setPortalGuard(true);
      window.location.hash = '#/portal?guard=1';
      setRoute({ page: 'portal', params: new URLSearchParams('guard=1') });
    }
  }, [route.page, state.ui.roleView, setRoleView]);
  const openCase: DashboardCaseOpen = (id, tab, context) => {
    const params = new URLSearchParams({ id });
    if (tab) params.set('tab', tab);
    if (context) params.set('context', context);
    const existingReturn = route.params.get('return');
    if (existingReturn) params.set('return', existingReturn);
    else if (route.page === 'cases') params.set('return', `cases${route.params.toString() ? `?${route.params.toString()}` : ''}`);
    else if (route.page === 'dashboard') params.set('return', 'dashboard');
    navigate(`case-detail?${params.toString()}`);
  };
  const activeCase = state.cases.find(item => item.id === route.params.get('id'));
  const currentAiContext: AiContext = activeCase && ['case-detail', 'case-assignment'].includes(route.page)
    ? { kind: 'case', label: `Case ${activeCase.id}`, caseId: activeCase.id }
    : route.page === 'dashboard'
      ? { kind: 'dashboard', label: 'All accessible cases' }
      : { kind: 'module', label: modules.find(item => item.id === route.page)?.label || route.page.replaceAll('-', ' '), moduleId: route.page };
  const openAi = (question = '', context = currentAiContext) => setAiRequest({ token: Date.now(), question, context });
  const confirmAssignment = ({ team, processor, secondary, track, notes, moveTaskIds }: AssignmentPayload) => {
    if (!activeCase) return;
    const reassigning = route.params.get('mode') === 'reassign';
    const changed = reassigning
      ? reassignCase(activeCase.id, team, processor, secondary, track, notes, moveTaskIds)
      : assignCase(activeCase.id, team, processor, secondary, track, notes);
    if (!changed) return;
    setToast(`${reassigning ? 'Reassignment' : 'Assignment'} confirmed for ${activeCase.id}. Assignment history recorded.`);
    openCase(activeCase.id);
  };
  let content: React.ReactNode;
  const needsCase = ['case-confirmation', 'case-detail', 'case-assignment'].includes(route.page);
  if (needsCase && !activeCase) content = <NotFound onCases={() => navigate('cases')}/>;
  else if (route.page === 'dashboard') content = <Dashboard onNavigate={navigate} onCase={openCase} onIntake={() => navigate('intake')} onOpenAi={question => openAi(question, { kind: 'dashboard', label: 'All accessible cases' })}/>;
  else if (route.page === 'cases') content = <Cases params={route.params} onIntake={() => navigate('intake')} onCase={openCase} onNavigate={navigate}/>;
  else if (route.page === 'intake') content = <Intake onCancel={() => navigate('cases')} onCreate={data => createCase(data, { navigate: true })}/>;
  else if (route.page === 'case-confirmation' && activeCase) content = <CaseConfirmation caseRecord={activeCase} onView={() => openCase(activeCase.id)} onCases={() => navigate('cases')} onAssign={() => navigate(`case-assignment?id=${encodeURIComponent(activeCase.id)}`)} onClarify={() => navigate(`case-detail?id=${encodeURIComponent(activeCase.id)}&tab=processing&focus=clarification`)}/>;
  else if (route.page === 'case-detail' && activeCase) content = <CaseWorkspace caseRecord={activeCase} initialTab={route.params.get('tab') || undefined} contextLabel={route.params.get('context') || undefined} onBack={() => navigate(route.params.get('return') || 'cases')} onAssign={() => navigate(`case-assignment?id=${encodeURIComponent(activeCase.id)}`)} onReassign={() => navigate(`case-assignment?id=${encodeURIComponent(activeCase.id)}&mode=reassign`)} onCase={openCase} onOpenAi={() => openAi('', { kind: 'case', label: `Case ${activeCase.id}`, caseId: activeCase.id })}/>;
  else if (route.page === 'case-assignment' && activeCase) content = <Assignment caseRecord={activeCase} mode={route.params.get('mode') === 'reassign' ? 'reassign' : 'assign'} onCancel={() => openCase(activeCase.id)} onConfirm={confirmAssignment}/>;
  else if (route.page === 'processing') content = <ProcessingWorklist initialSegment={route.params.get('segment') || undefined} onOpen={(id, tab) => navigate(`case-detail?id=${encodeURIComponent(id)}&tab=${tab}&return=${encodeURIComponent(`processing${route.params.toString() ? `?${route.params.toString()}` : ''}`)}`)}/>;
  else if (route.page === 'records') content = <RecordsWorklist onOpen={(id, tab) => navigate(`case-detail?id=${encodeURIComponent(id)}&tab=${tab}`)}/>;
  else if (route.page === 'review') content = <ReviewWorklist onOpen={(id, tab) => navigate(`case-detail?id=${encodeURIComponent(id)}&tab=${tab}`)}/>;
  else if (route.page === 'coordination') content = <CoordinationWorklist onOpen={id => navigate(`case-detail?id=${encodeURIComponent(id)}&tab=coordination-fees`)}/>;
  else if (route.page === 'fees') content = <FeesWorklist onOpen={id => navigate(`case-detail?id=${encodeURIComponent(id)}&tab=coordination-fees`)}/>;
  else if (route.page === 'appeals') content = <AppealsPage onCase={openCase}/>;
  else if (route.page === 'reports') content = <ReportsAnalytics navigate={navigate}/>;
  else if (route.page === 'notifications') content = <Notifications onCase={openCase}/>;
  else if (route.page === 'administration') content = <AdministrationPage navigate={navigate}/>;
  else {
    const item = modules.find(m => m.id === route.page);
    content = item && moduleDescriptions[route.page] ? <Placeholder title={item.label} description={moduleDescriptions[route.page]}/> : <NotFound onCases={() => navigate('cases')}/>;
  }
  const message = toast || state.message;
  if (state.ui.roleView === 'Requester (Portal)' || route.page === 'portal' || route.page.startsWith('portal/')) {
    return <PortalApp page={route.page} params={route.params} navigate={navigate} guard={portalGuard || route.params.get('guard') === '1'} onStaff={() => {
      switchingToStaff.current = true;
      setPortalGuard(false);
      setRoleView('Administrator');
      window.location.hash = '#/dashboard';
      setRoute({ page: 'dashboard', params: new URLSearchParams() });
      window.setTimeout(() => { switchingToStaff.current = false; }, 0);
    }}/>;
  }
  return <div className="app-shell">
    <Sidebar page={route.page} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} onNavigate={navigate} onToast={setToast}/>
    <main className="main" id="main-content">{content}</main>
    {route.page !== 'dashboard' && <button className="global-ai-launcher" onClick={() => openAi()}><Icon name="sparkles" size={18}/>AI Assistant</button>}
    <SharedAiSidebar request={aiRequest} onClose={() => setAiRequest(null)}/>
    {message && <div className="toast" role="status"><span>✓</span>{message}<button onClick={() => { setToast(''); clearMessage(); }} aria-label="Dismiss confirmation"><Icon name="close" size={18}/></button></div>}
  </div>;
}
