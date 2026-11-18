import { createContext, ReactNode, useContext, useEffect, useMemo, useReducer, type Context } from 'react';
import {
  ACCESS_CLASS,
  AdminUser,
  ALLOWED_TRANSITIONS,
  Appeal,
  APPEAL_DECISION,
  APPEAL_STATUS,
  AuditEvent,
  CASE_STATUS,
  CaseRecord,
  ClockEvent,
  CLOCK_EVENT_KIND,
  ClosureRequest,
  CLOSURE_KIND,
  CLOSURE_STATUS,
  Correspondence,
  CorrespondenceTemplate,
  CorrespondenceType,
  CoordinationItem,
  COORDINATION_KIND,
  COORDINATION_STATUS,
  CORRESPONDENCE_STATUS,
  CORRESPONDENCE_TYPE,
  DEMO_USERS,
  DOC_CLASSIFICATION,
  DELIVERY_OUTCOME,
  Determination,
  DETERMINATION_STATUS,
  DISPOSITION,
  Document,
  FeeRecord,
  NewCaseData,
  Notification,
  Office,
  OWNERSHIP_AFTER,
  PROCESSING_TRACK,
  PUBLICATION_CHOICE,
  QC_DECISION,
  QC_ITEM_RESULT,
  QC_KIND,
  QCReview,
  RFD,
  RFD_STATUS,
  requesterKey,
  REQUEST_TYPE,
  ROLE_VIEWS,
  RoleView,
  Settings,
  ReferenceData,
  StoreState,
  TASK_STATUS,
  Task,
  UPLOAD_STATUS,
  Redaction,
  ReleaseRecord,
  RELEASE_KIND,
  RESPONSIVENESS,
  REVIEW_OUTCOME,
  REVIEW_STATUS,
  ReviewDecision,
  ReadingRoomItem,
  REQUESTER_AGREEMENT,
  Segregability,
  WithholdingRecord,
  calendarDays,
  ASSESSMENT_DECISION,
  AssessmentDecision,
  CLARIFICATION_ENTRY,
  CLARIFICATION_REVIEW,
  CLARIFICATION_STATUS,
  ClarificationDetails,
  ClarificationReviewOutcome,
  ClarificationRound,
  DELIVERY_STATUS,
  DeliveryStatus,
  DispatchRecord,
  HOLD_TYPE,
  NO_RESPONSE_OUTCOME,
  NoResponseOutcome,
  ScopeUpdate,
} from './types';
import { draftLetter, isLegacyPlaceholder, MERGE_FIELDS, TEMPLATE_WORDING } from './templates';
import { activeRound, clarificationGate, clarificationHoldActive, composeNotice, emptyDetails, lateResponse } from './clarification';
import { can } from './permissions';
import {
  DEFAULT_SETTINGS,
  ORIGINAL_CASE_IDS,
  RESERVED_CASE_IDS,
  seedAudit,
  seedCases,
  seedClarificationRounds,
  seedClockEvents,
  seedCorrespondence,
  seedCoordinationItems,
  seedCorrespondenceTemplates,
  seedDocuments,
  seedDeterminations,
  seedExemptionCodes,
  seedAppeals,
  seedFeeRecords,
  seedNotifications,
  seedOffices,
  seedQcReviews,
  seedReleaseRecords,
  seedReviewDecisions,
  seedRfds,
  seedTasks,
  seedAdminUsers,
  seedReferenceData,
} from './seed';

const STORAGE_KEY = 'foia-prototype-v2';
const OLD_KEY = 'foia-prototype-cases';
const BACKUP_KEY = 'foia-prototype-cases-backup';
const SCHEMA_VERSION = 7;

const dueFromOld = (value?: string) => {
  if (!value || value === 'Pending configuration') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const defaultsForCase = (record: Partial<CaseRecord> & Pick<CaseRecord, 'id' | 'title' | 'requester' | 'received'>): CaseRecord => ({
  status: CASE_STATUS.PENDING_ASSIGNMENT,
  team: 'Unassigned',
  processor: 'Unassigned',
  track: 'Not set',
  risk: 'Not assessed',
  requestType: 'FOIA',
  needsClarification: false,
  expeditedRequested: false,
  willingToPayFees: false,
  requesterKey: requesterKey(record.requester),
  relatedCaseIds: [],
  dueDate: null,
  dueDateBasis: 'Not established',
  controllingDate: null,
  clock: { state: 'Not established' },
  ...record,
});

/** Subject and body from the stored template or built-in wording; empty merge fields are removed. */
function letterText(templates: CorrespondenceTemplate[], type: CorrespondenceType, caseRecord: CaseRecord | undefined, extra: Record<string, string> = {}) {
  if (!caseRecord) return { subject: TEMPLATE_WORDING[type]?.name || type, body: '' };
  const { subject, body } = draftLetter(templates, type, caseRecord, extra);
  return { subject, body };
}

/** Replaces placeholder text left by older builds with the current wording for that letter type. */
function upgradeLegacyLetters(items: Correspondence[], cases: CaseRecord[], rounds: ClarificationRound[], templates: CorrespondenceTemplate[]) {
  return items.map(item => {
    if (!isLegacyPlaceholder(item.body)) return item;
    const caseRecord = cases.find(record => record.id === item.caseId);
    if (!caseRecord) return item;
    const round = rounds.find(entry => entry.noticeId === item.id || entry.id === item.clarificationRoundId);
    const text = item.type === CORRESPONDENCE_TYPE.CLARIFICATION && round ? composeNotice(undefined, caseRecord, round.details, templates) : letterText(templates, item.type, caseRecord);
    return { ...item, ...text };
  });
}

function mergeById<T extends { id: string }>(current: T[], seeds: T[]) {
  return [...current, ...seeds.filter(seed => !current.some(item => item.id === seed.id))];
}

export function ensureDefaults(input?: Partial<StoreState>): StoreState {
  const cases = (input?.cases || []).map(record => defaultsForCase(record));
  return {
    cases: mergeById(cases, seedCases),
    tasks: mergeById(input?.tasks || [], seedTasks),
    documents: mergeById(input?.documents || [], seedDocuments),
    rfds: mergeById(input?.rfds || [], seedRfds),
    // 'Marked as sent' was renamed to 'Recorded as sent' (schema 7); dispatch is always completed outside the system.
    correspondence: upgradeLegacyLetters(mergeById((input?.correspondence || []).map(item => (item.status as string) === 'Marked as sent' ? { ...item, status: CORRESPONDENCE_STATUS.SENT } : item), seedCorrespondence), mergeById(cases, seedCases), mergeById(input?.clarificationRounds || [], seedClarificationRounds), seedCorrespondenceTemplates),
    clarificationRounds: mergeById(input?.clarificationRounds || [], seedClarificationRounds),
    correspondenceTemplates: mergeById((input?.correspondenceTemplates || []).map(item => isLegacyPlaceholder(item.body) ? { ...item, subject: TEMPLATE_WORDING[item.type]?.subject || item.subject, body: TEMPLATE_WORDING[item.type]?.body || item.body, mergeFields: MERGE_FIELDS } : { ...item, version: item.version || 1, mergeFields: item.mergeFields || ['caseId', 'requesterName'] }), seedCorrespondenceTemplates),
    clockEvents: mergeById(input?.clockEvents || [], seedClockEvents),
    offices: mergeById((input?.offices || []).map(item => ({ ...item, assignmentTeams: item.assignmentTeams || [] })), seedOffices),
    closureRequests: input?.closureRequests || [],
    reviewDecisions: mergeById((input?.reviewDecisions || []).map(item => ({ ...item, id: item.docId })), seedReviewDecisions.map(item => ({ ...item, id: item.docId }))).map(({ id: _id, ...item }) => item),
    redactions: input?.redactions || [],
    withholdingRecords: input?.withholdingRecords || [],
    segregability: input?.segregability || [],
    qcReviews: mergeById(input?.qcReviews || [], seedQcReviews),
    determinations: mergeById((input?.determinations || []).map(item => ({ ...item, id: item.caseId })), seedDeterminations.map(item => ({ ...item, id: item.caseId }))).map(({ id: _id, ...item }) => item),
    releaseRecords: mergeById(input?.releaseRecords || [], seedReleaseRecords),
    exemptionCodes: input?.exemptionCodes?.length ? input.exemptionCodes : seedExemptionCodes,
    coordinationItems: mergeById(input?.coordinationItems || [], seedCoordinationItems),
    feeRecords: mergeById((input?.feeRecords || []).map(item => ({ ...item, id: item.caseId })), seedFeeRecords.map(item => ({ ...item, id: item.caseId }))).map(({ id: _id, ...item }) => item),
    appeals: mergeById(input?.appeals || [], seedAppeals),
    readingRoomItems: input?.readingRoomItems || [],
    adminUsers: input?.adminUsers?.length ? input.adminUsers : seedAdminUsers,
    referenceData: input?.referenceData || seedReferenceData,
    portalInstructionText: input?.portalInstructionText || 'Use this portal to submit and track FOIA requests.',
    audit: mergeById(input?.audit || [], seedAudit),
    notifications: mergeById(input?.notifications || [], seedNotifications),
    settings: { ...DEFAULT_SETTINGS, ...(input?.settings || {}) },
    ui: { roleView: input?.ui?.roleView || 'Administrator', portalRequesterKey: input?.ui?.portalRequesterKey },
    schemaVersion: SCHEMA_VERSION,
    message: input?.message,
  };
}

function migrateOldCases(oldCases: Array<Record<string, unknown>>) {
  const imported = oldCases.map(item => {
    const dueDate = dueFromOld(String(item.due || ''));
    return defaultsForCase({
      ...(item as unknown as CaseRecord),
      dueDate,
      dueDateBasis: dueDate ? 'Entered by user' : 'Not established',
    });
  });
  const collisions = RESERVED_CASE_IDS.filter(id => imported.some(item => item.id === id));
  let next = Math.max(0, ...[...imported, ...seedCases].map(item => Number(item.id.split('-').pop()) || 0)) + 1;
  const adjustedSeeds = seedCases.map(seed => {
    if (!collisions.includes(seed.id)) return seed;
    while (imported.some(item => item.id === `FOIA-2025-${String(next).padStart(4, '0')}`)) next += 1;
    return { ...seed, id: `FOIA-2025-${String(next++).padStart(4, '0')}` };
  });
  return { imported, adjustedSeeds };
}

function loadState(): StoreState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return ensureDefaults(JSON.parse(saved) as Partial<StoreState>);
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const parsed = JSON.parse(old) as Array<Record<string, unknown>>;
      const { imported, adjustedSeeds } = migrateOldCases(parsed);
      const migrated = ensureDefaults({ cases: mergeById(imported, adjustedSeeds) });
      try {
        localStorage.setItem(BACKUP_KEY, old);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        localStorage.removeItem(OLD_KEY);
      } catch {
        return { ...migrated, message: 'Local storage is unavailable. Changes will remain in memory for this session.' };
      }
      return migrated;
    }
    return ensureDefaults();
  } catch {
    return { ...ensureDefaults(), message: 'Saved case data could not be read. Starting data was loaded and the app is continuing in memory.' };
  }
}

type Action =
  | { type: 'replace'; state: StoreState }
  | { type: 'message'; message?: string };

const openTaskStatus = (status: Task['status']) => status !== TASK_STATUS.DONE && status !== TASK_STATUS.CANCELLED;
const item0 = (round: ClarificationRound) => round.details.ambiguity || 'Not stated';

function reducer(state: StoreState, action: Action): StoreState {
  if (action.type === 'replace') return action.state;
  return { ...state, message: action.message };
}

interface StoreApi {
  state: StoreState;
  createCase(data: NewCaseData, options?: { navigate: boolean }): CaseRecord;
  updateCase(id: string, changes: Partial<CaseRecord>, reason?: string): void;
  transitionCase(caseId: string, to: CaseRecord['status'], reason: string, changes?: Partial<CaseRecord>): boolean;
  assignCase(caseId: string, team: string, processor: string, secondary: string, track: string, notes: string): boolean;
  bulkAssignCases(assignments: Array<{ caseId: string; processor: string }>): number;
  reassignCase(caseId: string, team: string, processor: string, secondary: string, track: string, reason: string, moveTaskIds: string[]): boolean;
  linkRelatedCases(caseId: string, relatedId: string): boolean;
  recordClockEvent(event: Omit<ClockEvent, 'id' | 'authorisedBy' | 'authorisedRole' | 'ruleStatus'>, caseChanges?: Partial<CaseRecord>, options?: { draftExtension?: boolean; awaitRequesterTask?: boolean }): void;
  createRfd(rfd: Omit<RFD, 'id' | 'status' | 'returnedDocIds' | 'evidence'>, trackingTask?: Omit<Task, 'id' | 'createdAt' | 'caseId' | 'linkedRef'>): RFD;
  updateRfd(id: string, changes: Partial<RFD>, action: string, reason?: string): boolean;
  returnRfd(id: string, noRecords: boolean, evidence: RFD['evidence'], files: Array<{ name: string; sizeKb: number; mime: string }>, statement?: string): boolean;
  completeSearch(caseId: string): boolean;
  addDocument(document: Omit<Document, 'id' | 'createdAt' | 'createdBy'> & Partial<Pick<Document, 'id' | 'createdAt' | 'createdBy'>>): Document;
  createCorrespondence(message: Omit<Correspondence, 'id' | 'createdBy'> & Partial<Pick<Correspondence, 'id' | 'createdBy'>>): Correspondence;
  recordRequesterReply(caseId: string, text: string, receivedDate: string, files: Array<{ name: string; sizeKb: number; mime: string }>): void;
  updateCorrespondence(id: string, changes: Partial<Correspondence>, action: string): boolean;
  updateTask(id: string, changes: Partial<Task>, reason: string): void;
  requestClosure(caseId: string, kind: ClosureRequest['kind'], reason: string): void;
  decideClosure(id: string, approved: boolean, reason: string): boolean;
  startReview(docId: string): Document | null;
  saveReviewDecision(decision: ReviewDecision, segregability?: Segregability, withholding?: WithholdingRecord): boolean;
  addRedaction(redaction: Omit<Redaction, 'id' | 'createdBy' | 'createdAt'>): void;
  createCandidate(docId: string, checklist: boolean[], failureReason: string): boolean;
  submitQc(caseId: string, docIds: string[], kind?: QCReview['kind']): boolean;
  decideQc(id: string, approved: boolean, checklist: QCReview['checklist'], findings: QCReview['findings']): boolean;
  prepareNoRecords(caseId: string): boolean;
  saveDetermination(determination: Determination): void;
  approveDetermination(caseId: string): boolean;
  dispatchRelease(release: Omit<ReleaseRecord, 'id' | 'sentAt' | 'sentBy' | 'deliveryOutcome'>, fail: boolean): boolean;
  retryRelease(id: string): boolean;
  returnToReview(caseId: string, reason: string): boolean;
  createCoordination(item: Omit<CoordinationItem, 'id' | 'status' | 'createdBy' | 'createdAt'>): CoordinationItem;
  updateCoordination(id: string, status: CoordinationItem['status'], responseText?: string, outcome?: ReviewDecision['outcome']): boolean;
  confirmTransfer(id: string, taskDecisions: Record<string, 'Transferred' | 'Retained' | 'Stopped'>, reason: string): boolean;
  saveFee(record: FeeRecord): void;
  draftFeeNotice(caseId: string): void;
  registerAppeal(appeal: Omit<Appeal, 'id' | 'status' | 'eligibilityNote'>): Appeal;
  updateAppeal(id: string, changes: Partial<Appeal>, note: string): boolean;
  remandAppeal(id: string, reason: string): boolean;
  reopenLateRecords(caseId: string, reason: string): boolean;
  portalRequesterReply(caseId: string, text: string, files: Array<{ name: string; sizeKb: number; mime: string }>): boolean;
  portalFeeResponse(caseId: string, response: 'Agree' | 'Decline' | 'Waiver or narrower scope', text: string): boolean;
  createReadingRoomItem(item: Omit<ReadingRoomItem, 'id' | 'status' | 'publishedAt' | 'preparedBy' | 'publicationBasis'>): ReadingRoomItem | null;
  approveReadingRoomItem(id: string): boolean;
  unpublishReadingRoomItem(id: string, reason: string): boolean;
  addTask(task: Omit<Task, 'id' | 'createdAt'> & Partial<Pick<Task, 'id' | 'createdAt'>>): void;
  addAudit(event: Omit<AuditEvent, 'id' | 'at' | 'actorName' | 'actorRole' | 'visibility'> & Partial<Pick<AuditEvent, 'id' | 'at'>>): void;
  addNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'> & Partial<Pick<Notification, 'id' | 'createdAt' | 'read'>>): void;
  setRoleView(roleView: RoleView): void;
  setPortalRequester(requesterKey: string): void;
  updateSettings(changes: Partial<Settings>): void;
  markNotificationsRead(): void;
  resetData(): void;
  addAdminUser(user: Omit<AdminUser, 'id' | 'status'>): void;
  toggleAdminUser(id: string): void;
  updateOffice(id: string, changes: Partial<Office>): void;
  updateReferenceValue(section: keyof Omit<ReferenceData, 'feeRates' | 'publicStatusMapping'>, oldValue: string, newValue: string, effectiveDate: string): void;
  updateTemplate(id: string, changes: Partial<CorrespondenceTemplate>): void;
  updatePortalInstructions(text: string): void;
  simulateFoiaGovImport(): string[];
  // WF-02 clarification and clock hold
  startClarification(caseId: string): ClarificationRound | null;
  recordAssessment(roundId: string, details: ClarificationDetails, decision: AssessmentDecision, rationale: string): boolean;
  draftClarificationNotice(roundId: string): Correspondence | null;
  saveCorrespondenceDraft(id: string, subject: string, body: string): boolean;
  submitCorrespondence(id: string): boolean;
  decideCorrespondenceApproval(id: string, approved: boolean, reason: string): boolean;
  recordDispatch(id: string, input: Pick<DispatchRecord, 'dispatchedAt' | 'channel' | 'recipient' | 'reference' | 'outcome' | 'failureDetail'>): boolean;
  updateDeliveryOutcome(id: string, dispatchId: string, outcome: DeliveryStatus, detail: string): boolean;
  escalateDeliveryFailure(id: string, note: string): boolean;
  decideClarificationHold(roundId: string, input: { applies: boolean; reason: string; effectiveDate?: string; reference?: string; authorisation?: string }): boolean;
  setClarificationResponseDue(roundId: string, date: string, basis: string): boolean;
  recordClarificationReminder(roundId: string, input: { date: string; method: string; note: string }): boolean;
  recordClarificationResponse(roundId: string, input: { receivedDate: string; correspondenceId?: string; summary: string; reference: string; files: Array<{ name: string; sizeKb: number; mime: string }> }): boolean;
  reviewClarificationResponse(roundId: string, input: { outcome: ClarificationReviewOutcome; resolvedItems: string; remainingItems: string; rationale: string; scope?: Pick<ScopeUpdate, 'scope' | 'changeSummary'>; lateClock?: { decision: string; effectiveDate?: string; rationale: string } }): boolean;
  recordNoResponseDecision(roundId: string, input: { outcome: NoResponseOutcome; rationale: string; scope?: string; remainingAmbiguity?: string }): boolean;
  resumeClock(caseId: string, input: { effectiveDate: string; reason: string; reference?: string }): boolean;
  completeClarification(roundId: string, nextAction: string): boolean;
  clearMessage(): void;
}

// Keep one context object across hot reloads of this module; otherwise a reloaded
// useStore() reads a new context while the mounted StoreProvider still supplies the old one.
const contextHolder = globalThis as typeof globalThis & { __foiaStoreContext?: Context<StoreApi | null> };
const StoreContext = contextHolder.__foiaStoreContext ?? (contextHolder.__foiaStoreContext = createContext<StoreApi | null>(null));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  useEffect(() => {
    try {
      const persistable = { ...state, message: undefined };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
    } catch {
      if (!state.message) dispatch({ type: 'message', message: 'Local storage is unavailable. Changes will remain in memory for this session.' });
    }
  }, [state]);

  const actor = () => ({ actorName: DEMO_USERS[state.ui.roleView], actorRole: state.ui.roleView });
  const audit = (event: Omit<AuditEvent, 'id' | 'at' | 'actorName' | 'actorRole' | 'visibility'> & Partial<Pick<AuditEvent, 'id' | 'at'>>): AuditEvent => ({
    id: event.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: event.at || new Date().toISOString(),
    actorName: actor().actorName,
    actorRole: actor().actorRole,
    visibility: 'Internal',
    ...event,
  });
  const replace = (next: StoreState) => dispatch({ type: 'replace', state: next });

  const api: StoreApi = useMemo<StoreApi>(() => ({
    state,
    createCase(data, options = { navigate: true }) {
      let number = Math.max(0, ...state.cases.map(record => Number(record.id.split('-').pop()) || 0)) + 1;
      let id = `FOIA-2025-${String(number).padStart(4, '0')}`;
      while (state.cases.some(record => record.id === id)) id = `FOIA-2025-${String(++number).padStart(4, '0')}`;
      const { attachments = [], ...fields } = data;
      const record = defaultsForCase({ id, ...fields, requesterKey: requesterKey(data.requester) });
      const documents: Document[] = attachments.map((file, index) => ({
        id: `document-${Date.now()}-${index}`,
        caseId: id,
        name: file.name,
        sizeKb: file.sizeKb,
        mime: file.mime,
        source: 'Requester-supplied',
        classification: DOC_CLASSIFICATION.SOURCE,
        version: 1,
        accessClass: ACCESS_CLASS.INTERNAL,
        uploadStatus: UPLOAD_STATUS.UPLOADED,
        pageCount: 0,
        createdAt: new Date().toISOString(),
        createdBy: state.ui.roleView === 'Administrator' ? 'Muskaan Shaikh' : state.ui.roleView,
      }));
      const now = new Date().toISOString();
      const actorName = DEMO_USERS[state.ui.roleView];
      // WF-01: complete requests get an acknowledgement draft + routing task; incomplete ones hand off to WF-02.
      const clarificationTask: Task[] = record.needsClarification ? [{
        id: `task-${Date.now()}-clarification`,
        caseId: id,
        type: 'Clarification',
        title: 'Assess clarification need',
        ownerName: DEMO_USERS['Intake Staff'],
        ownerRole: 'Intake Staff',
        status: TASK_STATUS.OPEN,
        dueDate: null,
        createdAt: now,
        linkedRef: `correspondence-${id}-clarification`,
      }] : [{
        id: `task-${Date.now()}-routing`,
        caseId: id,
        type: 'Assignment',
        title: 'Route case to responsible team and processor',
        ownerName: DEMO_USERS['Supervisor / QC'],
        ownerRole: 'Supervisor / QC',
        status: TASK_STATUS.OPEN,
        dueDate: null,
        createdAt: now,
      }];
      const intakeLetter: Correspondence = record.needsClarification ? {
        id: `correspondence-${id}-clarification`, caseId: id, type: CORRESPONDENCE_TYPE.CLARIFICATION, templateId: 'template-2',
        ...letterText(state.correspondenceTemplates, CORRESPONDENCE_TYPE.CLARIFICATION, record as CaseRecord, { clarificationDetails: record.clarificationReason ? `What we need clarified: ${record.clarificationReason}` : '' }),
        direction: 'Outbound', status: CORRESPONDENCE_STATUS.DRAFT, requesterVisible: false, createdBy: actorName, createdAt: now,
      } : {
        id: `correspondence-${id}-acknowledgement`, caseId: id, type: CORRESPONDENCE_TYPE.ACKNOWLEDGEMENT, templateId: 'template-1',
        ...letterText(state.correspondenceTemplates, CORRESPONDENCE_TYPE.ACKNOWLEDGEMENT, record as CaseRecord),
        direction: 'Outbound', status: CORRESPONDENCE_STATUS.DRAFT, requesterVisible: false, createdBy: actorName, createdAt: now,
      };
      // WF-02 entry point 1: the intake reason and draft letter carry into clarification round 1.
      const intakeRound: ClarificationRound[] = record.needsClarification ? [{
        id: `clarification-${id}-1`, caseId: id, round: 1, entryPoint: CLARIFICATION_ENTRY.INTAKE,
        status: CLARIFICATION_STATUS.ASSESSMENT, startedAt: now, startedBy: actorName,
        details: emptyDetails(record.clarificationReason || ''), assessments: [], noticeId: intakeLetter.id,
        reminders: [], noResponseDecisions: [], taskId: clarificationTask[0]?.id,
      }] : [];
      if (record.needsClarification) intakeLetter.clarificationRoundId = `clarification-${id}-1`;
      const relatedIds = record.relatedCaseIds.filter(relatedId => state.cases.some(item => item.id === relatedId));
      const casesWithLinks = state.cases.map(item => relatedIds.includes(item.id) ? { ...item, relatedCaseIds: [...new Set([...item.relatedCaseIds, id])] } : item);
      const portalNotification: Notification[] = record.source === 'Portal' ? [{
        id: `notification-${Date.now()}-portal`, forRole: 'Intake Staff', forName: DEMO_USERS['Intake Staff'],
        caseId: id, text: `New portal request ${id} requires intake review.`, createdAt: new Date().toISOString(), read: false,
      }] : [];
      replace({
        ...state,
        cases: [{ ...record, relatedCaseIds: relatedIds }, ...casesWithLinks],
        tasks: [...clarificationTask, ...state.tasks],
        notifications: [...portalNotification, ...state.notifications],
        documents: [...documents, ...state.documents],
        correspondence: [intakeLetter, ...state.correspondence],
        clarificationRounds: [...intakeRound, ...state.clarificationRounds],
        audit: [
          ...(record.needsClarification ? [audit({ caseId: id, action: 'Clarification initiated', detail: `Round 1 started from the intake handoff. Reason carried forward: ${record.clarificationReason || 'Not provided'}.` })] : []),
          audit({ caseId: id, action: record.needsClarification ? 'Clarification request drafted' : 'Acknowledgement drafted', detail: `${intakeLetter.type} draft created from template. Draft — Not Sent.` }),
          audit({ caseId: id, action: 'Case created', detail: `${id} was registered through Intake.${record.needsClarification ? ` Flagged for clarification (WF-02): ${record.clarificationReason || 'reason not provided'}.` : ''}${relatedIds.length ? ` Related cases linked: ${relatedIds.join(', ')}.` : ''}${record.possibleDuplicateOfIds?.length ? ` Possible duplicate of: ${record.possibleDuplicateOfIds.join(', ')} (not merged).` : ''}${record.intakeRoutingFlags?.length ? ` Routing considerations: ${record.intakeRoutingFlags.join('; ')}.` : ''}` }),
          ...state.audit,
        ],
      });
      if (options.navigate) window.location.hash = `#/case-confirmation?id=${encodeURIComponent(id)}`;
      return record;
    },
    updateCase(id, changes, reason = 'Case information updated') {
      const current = state.cases.find(record => record.id === id);
      if (!current) return;
      let nextChanges = changes;
      if ('dueDate' in changes && changes.dueDate !== current.dueDate) {
        const days = changes.dueDate ? calendarDays(state.settings.asOfDate, changes.dueDate) : null;
        nextChanges = { ...changes, dueDateBasis: changes.dueDate ? 'Entered by user' : 'Not established', risk: days === null ? 'Not assessed' : days <= 3 ? 'High' : days <= 7 ? 'Medium' : 'Low' };
      }
      replace({
        ...state,
        cases: state.cases.map(record => record.id === id ? { ...record, ...nextChanges } : record),
        audit: [audit({
          caseId: id,
          action: 'Case updated',
          detail: `${reason} Before: ${JSON.stringify(Object.fromEntries(Object.keys(nextChanges).map(key => [key, current[key as keyof CaseRecord] ?? 'Not provided'])))}. After: ${JSON.stringify(nextChanges)}.`,
        }), ...state.audit],
      });
    },
    transitionCase(caseId, to, reason, changes = {}) {
      const current = state.cases.find(record => record.id === caseId);
      if (!current || !ALLOWED_TRANSITIONS[current.status]?.includes(to)) {
        dispatch({ type: 'message', message: 'That case status transition is not allowed.' });
        return false;
      }
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, ...changes, status: to } : record),
        audit: [audit({ caseId, action: changes.processor ? 'Assignment history recorded' : 'Case status changed', detail: `${current.status} changed to ${to}. ${reason}`, from: changes.processor ? current.processor : current.status, to: changes.processor ? String(changes.processor) : to, reason }), ...state.audit],
      });
      return true;
    },
    assignCase(caseId, team, processor, secondary, track, notes) {
      const current = state.cases.find(record => record.id === caseId);
      if (!current || !ALLOWED_TRANSITIONS[current.status]?.includes(CASE_STATUS.IN_PROGRESS)) {
        dispatch({ type: 'message', message: 'That case cannot be assigned from its current status.' });
        return false;
      }
      const createdAt = new Date().toISOString();
      const tasks: Task[] = [
        { id: `task-${Date.now()}-scope`, caseId, type: 'Intake review', title: 'Review request and confirm scope', ownerName: processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt },
        { id: `task-${Date.now()}-search`, caseId, type: 'Records search planning', title: 'Plan records search', ownerName: processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt },
      ];
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, team, processor, secondaryProcessor: secondary, assignmentNotes: notes, track, status: CASE_STATUS.IN_PROGRESS } : record),
        tasks: [...tasks, ...state.tasks.map(task => task.caseId === caseId && task.type === 'Assignment' && task.status !== TASK_STATUS.DONE && task.status !== TASK_STATUS.CANCELLED ? { ...task, status: TASK_STATUS.DONE, completedAt: createdAt } : task)],
        notifications: [{
          id: `notification-${Date.now()}-assigned`,
          forRole: 'Processor',
          forName: processor,
          caseId,
          text: `${caseId} was assigned to you.`,
          createdAt,
          read: false,
        }, ...state.notifications],
        audit: [audit({ caseId, action: 'Assignment history recorded', detail: `${caseId} assigned to ${processor} on ${team}; track ${track}. Two initial tasks created.`, from: current.processor, to: processor, reason: notes || 'Initial assignment' }), ...state.audit],
      });
      return true;
    },
    bulkAssignCases(assignments) {
      const selected = assignments.filter(item => item.processor.trim());
      const assignable = selected.filter(item => {
        const record = state.cases.find(candidate => candidate.id === item.caseId);
        return record?.status === CASE_STATUS.PENDING_ASSIGNMENT && ALLOWED_TRANSITIONS[record.status]?.includes(CASE_STATUS.IN_PROGRESS);
      });
      if (!assignable.length) {
        dispatch({ type: 'message', message: 'Select a processor for at least one assignable case.' });
        return 0;
      }
      const createdAt = new Date().toISOString();
      const processors = new Map(assignable.map(item => [item.caseId, item.processor]));
      const tasks: Task[] = assignable.flatMap((item, index) => [
        { id: `task-${Date.now()}-${index}-scope`, caseId: item.caseId, type: 'Intake review', title: 'Review request and confirm scope', ownerName: item.processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt },
        { id: `task-${Date.now()}-${index}-search`, caseId: item.caseId, type: 'Records search planning', title: 'Plan records search', ownerName: item.processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt },
      ]);
      const notifications: Notification[] = assignable.map((item, index) => ({
        id: `notification-${Date.now()}-${index}-assigned`,
        forRole: 'Processor',
        forName: item.processor,
        caseId: item.caseId,
        text: `${item.caseId} was assigned to you.`,
        createdAt,
        read: false,
      }));
      replace({
        ...state,
        cases: state.cases.map(record => processors.has(record.id) ? {
          ...record,
          team: 'FOIA Operations – General',
          processor: processors.get(record.id)!,
          track: PROCESSING_TRACK.STANDARD,
          assignmentNotes: 'Assigned from dashboard queue.',
          status: CASE_STATUS.IN_PROGRESS,
        } : record),
        tasks: [...tasks, ...state.tasks],
        notifications: [...notifications, ...state.notifications],
        audit: [
          ...assignable.map(item => audit({
            caseId: item.caseId,
            action: 'Assignment history recorded',
            detail: `${item.caseId} assigned to ${item.processor} on FOIA Operations – General; track ${PROCESSING_TRACK.STANDARD}. Two initial tasks created.`,
            from: 'Unassigned',
            to: item.processor,
            reason: 'Dashboard assignment',
          })),
          ...state.audit,
        ],
        message: `${assignable.length} case${assignable.length === 1 ? '' : 's'} assigned successfully.`,
      });
      return assignable.length;
    },
    reassignCase(caseId, team, processor, secondary, track, reason, moveTaskIds) {
      const current = state.cases.find(record => record.id === caseId);
      if (!current || !reason.trim()) return false;
      const previousOwner = current.processor;
      const createdAt = new Date().toISOString();
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, team, processor, secondaryProcessor: secondary, track, assignmentNotes: reason } : record),
        tasks: state.tasks.map(task => moveTaskIds.includes(task.id) && task.caseId === caseId && task.ownerName === previousOwner ? { ...task, ownerName: processor, ownerRole: 'Processor' } : task),
        notifications: [
          { id: `notification-${Date.now()}-old`, forName: previousOwner, caseId, text: `${caseId} was reassigned from you to ${processor}.`, createdAt, read: false },
          { id: `notification-${Date.now()}-new`, forName: processor, forRole: 'Processor', caseId, text: `${caseId} was reassigned to you.`, createdAt, read: false },
          ...state.notifications,
        ],
        audit: [audit({ caseId, action: 'Case reassigned', detail: `${caseId} reassigned from ${previousOwner} to ${processor}; ${moveTaskIds.length} open task(s) moved.`, from: previousOwner, to: processor, reason }), ...state.audit],
      });
      return true;
    },
    linkRelatedCases(caseId, relatedId) {
      if (caseId === relatedId || !state.cases.some(record => record.id === caseId) || !state.cases.some(record => record.id === relatedId)) return false;
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, relatedCaseIds: [...new Set([...record.relatedCaseIds, relatedId])] } : record.id === relatedId ? { ...record, relatedCaseIds: [...new Set([...record.relatedCaseIds, caseId])] } : record),
        audit: [audit({ caseId, action: 'Related case linked', detail: `${relatedId} was linked as a related case.`, to: relatedId }), ...state.audit],
        message: `Related case ${relatedId} linked.`,
      });
      return true;
    },
    startReview(docId) {
      const source = state.documents.find(document => document.id === docId);
      if (!source || source.classification !== DOC_CLASSIFICATION.SOURCE || source.releasedInRecordId) return null;
      const existing = state.documents.find(document => document.parentDocId === docId && document.classification === DOC_CLASSIFICATION.REVIEW);
      if (existing) return existing;
      const now = new Date().toISOString();
      const review: Document = {
        ...source, id: `document-${Date.now()}-review`, name: source.name.replace(/(\.[^.]+)?$/, '-review$1'),
        source: 'Created in processing', classification: DOC_CLASSIFICATION.REVIEW, parentDocId: source.id,
        version: source.version + 1, accessClass: ACCESS_CLASS.INTERNAL, createdAt: now,
        createdBy: DEMO_USERS[state.ui.roleView], releasedInRecordId: null,
      };
      const decision: ReviewDecision = {
        docId, responsiveness: RESPONSIVENESS.NOT_REVIEWED, outcome: REVIEW_OUTCOME.NOT_APPLICABLE,
        reviewStatus: REVIEW_STATUS.IN_REVIEW, reviewer: DEMO_USERS[state.ui.roleView], at: now,
      };
      replace({
        ...state, documents: [review, ...state.documents],
        reviewDecisions: [decision, ...state.reviewDecisions.filter(item => item.docId !== docId)],
        audit: [audit({ caseId: source.caseId, action: 'Document review started', detail: `${source.name} review copy created.` }), ...state.audit],
      });
      return review;
    },
    saveReviewDecision(decision, segregability, withholding) {
      const source = state.documents.find(document => document.id === decision.docId);
      if (!source || source.releasedInRecordId || source.lockedByQcId) return false;
      if (decision.outcome === REVIEW_OUTCOME.WITHHOLD_FULL && (!withholding?.exemptionCodes.length || !withholding.rationale.trim())) return false;
      replace({
        ...state,
        reviewDecisions: [decision, ...state.reviewDecisions.filter(item => item.docId !== decision.docId)],
        segregability: segregability ? [segregability, ...state.segregability.filter(item => item.docId !== decision.docId)] : state.segregability,
        withholdingRecords: withholding ? [withholding, ...state.withholdingRecords.filter(item => item.docId !== decision.docId)] : state.withholdingRecords,
        audit: [audit({ caseId: source.caseId, action: 'Review decision recorded', detail: `${source.name}: ${decision.responsiveness}; ${decision.outcome}; ${decision.reviewStatus}.` }), ...state.audit],
      });
      return true;
    },
    addRedaction(input) {
      const source = state.documents.find(document => document.id === input.docId);
      if (!source || source.releasedInRecordId || source.lockedByQcId || !input.exemptionCode) return;
      const next: Redaction = { ...input, id: `redaction-${Date.now()}`, createdBy: DEMO_USERS[state.ui.roleView], createdAt: new Date().toISOString() };
      replace({ ...state, redactions: [next, ...state.redactions], audit: [audit({ caseId: source.caseId, action: 'Redaction markup recorded', detail: `${source.name}, page ${input.page}, lines ${input.lines.join(', ')}, ${input.exemptionCode}. Visual markup only.` }), ...state.audit] });
    },
    createCandidate(docId, checklist, failureReason) {
      const source = state.documents.find(document => document.id === docId);
      const decision = state.reviewDecisions.find(item => item.docId === docId);
      const review = state.documents.find(document => document.parentDocId === docId && document.classification === DOC_CLASSIFICATION.REVIEW);
      if (!source || !decision || !review || source.releasedInRecordId || ![REVIEW_OUTCOME.RELEASE_FULL, REVIEW_OUTCOME.RELEASE_PART].includes(decision.outcome as typeof REVIEW_OUTCOME.RELEASE_FULL | typeof REVIEW_OUTCOME.RELEASE_PART)) return false;
      if (decision.outcome === REVIEW_OUTCOME.RELEASE_PART && !state.redactions.some(item => item.docId === docId)) {
        dispatch({ type: 'message', message: 'Release in part requires at least one coded visual redaction.' });
        return false;
      }
      const passed = checklist.length === 4 && checklist.every(Boolean);
      if (!passed) {
        replace({
          ...state,
          reviewDecisions: state.reviewDecisions.map(item => item.docId === docId ? { ...item, reviewStatus: REVIEW_STATUS.REWORK, candidateValidated: false, candidateFailureReason: failureReason || 'Manual validation failed.' } : item),
          audit: [audit({ caseId: source.caseId, action: 'Candidate release rejected', detail: `${source.name}: ${failureReason || 'Manual validation failed.'}` }), ...state.audit],
        });
        return false;
      }
      const existing = decision.candidateDocId && state.documents.find(document => document.id === decision.candidateDocId);
      const candidate: Document = existing || {
        ...review, id: `document-${Date.now()}-candidate`, name: source.name.replace(/(\.[^.]+)?$/, '-candidate$1'),
        classification: DOC_CLASSIFICATION.CANDIDATE, parentDocId: review.id, version: review.version + 1,
        createdAt: new Date().toISOString(), createdBy: DEMO_USERS[state.ui.roleView],
      };
      replace({
        ...state,
        documents: existing ? state.documents : [candidate, ...state.documents],
        reviewDecisions: state.reviewDecisions.map(item => item.docId === docId ? { ...item, candidateDocId: candidate.id, candidateValidated: true, candidateFailureReason: undefined, reviewStatus: REVIEW_STATUS.COMPLETE, at: new Date().toISOString() } : item),
        audit: [audit({ caseId: source.caseId, action: 'Candidate release created', detail: `${candidate.name} passed manual validation.` }), ...state.audit],
      });
      return true;
    },
    submitQc(caseId, docIds, kind = QC_KIND.RELEASE) {
      const caseRecord = state.cases.find(record => record.id === caseId);
      if (!caseRecord || !docIds.length) return false;
      const eligible = kind === QC_KIND.NO_RECORDS || docIds.every(docId => {
        const decision = state.reviewDecisions.find(item => item.docId === docId);
        const coordinationBlocked = state.coordinationItems.some(item => item.docIds.includes(docId) && [COORDINATION_STATUS.SENT, COORDINATION_STATUS.ACKNOWLEDGED, COORDINATION_STATUS.RESPONSE].includes(item.status as typeof COORDINATION_STATUS.SENT | typeof COORDINATION_STATUS.ACKNOWLEDGED | typeof COORDINATION_STATUS.RESPONSE));
        if (coordinationBlocked) return false;
        return decision?.reviewStatus === REVIEW_STATUS.COMPLETE && (
          ([REVIEW_OUTCOME.RELEASE_FULL, REVIEW_OUTCOME.RELEASE_PART] as string[]).includes(decision.outcome) ? Boolean(decision.candidateDocId && decision.candidateValidated) :
          decision.outcome === REVIEW_OUTCOME.WITHHOLD_FULL ? state.withholdingRecords.some(item => item.docId === docId) : false
        );
      });
      if (!eligible || !ALLOWED_TRANSITIONS[caseRecord.status]?.includes(CASE_STATUS.QC_REVIEW)) return false;
      const id = `qc-${Date.now()}`;
      const round = Math.max(0, ...state.qcReviews.filter(item => item.caseId === caseId).map(item => item.round)) + 1;
      const checklist = kind === QC_KIND.NO_RECORDS ? [QC_ITEM_RESULT.PASS, QC_ITEM_RESULT.NOT_APPLICABLE, QC_ITEM_RESULT.NOT_APPLICABLE, QC_ITEM_RESULT.NOT_APPLICABLE, QC_ITEM_RESULT.PASS] : Array(5).fill(QC_ITEM_RESULT.PASS);
      const next: QCReview = { id, caseId, round, kind, docIds, submittedBy: DEMO_USERS[state.ui.roleView], submittedAt: new Date().toISOString(), checklist, findings: [], decision: QC_DECISION.PENDING };
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, status: CASE_STATUS.QC_REVIEW } : record),
        documents: state.documents.map(document => docIds.includes(document.id) || state.reviewDecisions.filter(item => docIds.includes(item.docId)).some(item => item.candidateDocId === document.id) ? { ...document, lockedByQcId: id } : document),
        qcReviews: [next, ...state.qcReviews],
        tasks: [{ id: `task-${Date.now()}-qc`, caseId, type: 'QC review', title: `Complete QC round ${round}`, ownerName: DEMO_USERS['Supervisor / QC'], ownerRole: 'Supervisor / QC', status: TASK_STATUS.OPEN, dueDate: null, createdAt: new Date().toISOString(), linkedRef: id }, ...state.tasks],
        notifications: [{ id: `notification-${Date.now()}-qc`, forRole: 'Supervisor / QC', forName: DEMO_USERS['Supervisor / QC'], caseId, text: `QC round ${round} is ready for review.`, createdAt: new Date().toISOString(), read: false }, ...state.notifications],
        audit: [audit({ caseId, action: 'Submitted for QC', detail: `${kind}, round ${round}, ${docIds.length} document(s).`, from: caseRecord.status, to: CASE_STATUS.QC_REVIEW }), ...state.audit],
      });
      return true;
    },
    decideQc(id, approved, checklist, findings) {
      const review = state.qcReviews.find(item => item.id === id);
      if (!review || review.decision !== QC_DECISION.PENDING || review.submittedBy === DEMO_USERS[state.ui.roleView] || state.ui.roleView !== 'Supervisor / QC') {
        dispatch({ type: 'message', message: review?.submittedBy === DEMO_USERS[state.ui.roleView] ? 'The QC submitter cannot decide the same batch.' : 'Only Supervisor / QC may decide this batch.' });
        return false;
      }
      const caseRecord = state.cases.find(record => record.id === review.caseId);
      if (!caseRecord) return false;
      const decision = approved ? QC_DECISION.APPROVED : QC_DECISION.RETURNED;
      const sourceDecisions = state.reviewDecisions.filter(item => review.docIds.includes(item.docId));
      const responsive = state.reviewDecisions.filter(item => state.documents.some(document => document.id === item.docId && document.caseId === review.caseId) && item.responsiveness === RESPONSIVENESS.RESPONSIVE);
      const allAccounted = review.kind === QC_KIND.NO_RECORDS || responsive.every(item => item.reviewStatus === REVIEW_STATUS.COMPLETE && item.outcome !== REVIEW_OUTCOME.NOT_APPLICABLE);
      const otherPending = state.qcReviews.some(item => item.caseId === review.caseId && item.id !== id && item.decision === QC_DECISION.PENDING);
      const allRequiredQcApproved = review.kind === QC_KIND.NO_RECORDS || responsive.every(item => review.docIds.includes(item.docId) || item.qcApproved);
      const outstandingRework = state.tasks.some(task => task.caseId === review.caseId && task.type === 'Review correction' && task.status !== TASK_STATUS.DONE && task.status !== TASK_STATUS.CANCELLED);
      const ready = approved && allAccounted && allRequiredQcApproved && !otherPending && !outstandingRework;
      const nextStatus = approved ? (ready ? CASE_STATUS.DETERMINATION : CASE_STATUS.REVIEW) : CASE_STATUS.REVIEW;
      replace({
        ...state,
        cases: state.cases.map(record => record.id === review.caseId ? { ...record, status: nextStatus } : record),
        qcReviews: state.qcReviews.map(item => item.id === id ? { ...item, checklist, findings, decision, decidedBy: DEMO_USERS[state.ui.roleView], decidedAt: new Date().toISOString() } : item),
        reviewDecisions: state.reviewDecisions.map(item => review.docIds.includes(item.docId) ? { ...item, qcApproved: approved, reviewStatus: approved ? item.reviewStatus : REVIEW_STATUS.REWORK } : item),
        documents: state.documents.map(document => {
          const sourceDecision = sourceDecisions.find(item => item.candidateDocId === document.id);
          if (sourceDecision && approved) return { ...document, classification: DOC_CLASSIFICATION.APPROVED, lockedByQcId: undefined };
          if (review.docIds.includes(document.id) || sourceDecision) return { ...document, lockedByQcId: undefined };
          return document;
        }),
        tasks: [
          ...(!approved ? findings.map((finding, index) => ({ id: `task-${Date.now()}-correction-${index}`, caseId: review.caseId, type: 'Review correction', title: finding.text, ownerName: caseRecord.processor, ownerRole: 'Processor' as const, status: TASK_STATUS.OPEN, dueDate: null, createdAt: new Date().toISOString(), linkedRef: id })) : []),
          ...state.tasks.map(task => task.linkedRef === id && task.status !== TASK_STATUS.DONE ? { ...task, status: TASK_STATUS.DONE, completedAt: new Date().toISOString() } : task),
        ],
        audit: [audit({ caseId: review.caseId, action: approved ? 'QC approved' : 'QC returned', detail: `Round ${review.round}: ${findings.map(item => item.text).join('; ') || 'No findings'}. Workflow approval - not proof of redaction integrity or release safety.`, from: CASE_STATUS.QC_REVIEW, to: nextStatus }), ...state.audit],
        message: ready ? 'QC approved. Case moved to Determination.' : approved ? 'QC approved, but remaining review work returned the case to Review.' : 'QC returned for rework.',
      });
      return true;
    },
    prepareNoRecords(caseId) {
      const caseRecord = state.cases.find(record => record.id === caseId);
      const noRecordsAudit = state.audit.some(event => event.caseId === caseId && event.action === 'Search complete - no responsive records');
      if (!caseRecord || !noRecordsAudit || caseRecord.status !== CASE_STATUS.RECORDS_SEARCH) return false;
      if (state.settings.qcForNoRecords) return api.submitQc(caseId, [caseId], QC_KIND.NO_RECORDS);
      if (state.ui.roleView !== 'Supervisor / QC' || !ALLOWED_TRANSITIONS[caseRecord.status]?.includes(CASE_STATUS.DETERMINATION)) return false;
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, status: CASE_STATUS.DETERMINATION } : record),
        audit: [audit({ caseId, action: 'No-records determination confirmed', detail: 'Supervisor / QC confirmed the policy-pending no-records exception; QC was skipped by system setting.', from: CASE_STATUS.RECORDS_SEARCH, to: CASE_STATUS.DETERMINATION }), ...state.audit],
      });
      return true;
    },
    saveDetermination(determination) {
      const current = state.determinations.find(item => item.caseId === determination.caseId);
      replace({
        ...state,
        determinations: [determination, ...state.determinations.filter(item => item.caseId !== determination.caseId)],
        audit: [audit({ caseId: determination.caseId, action: 'Determination saved', detail: `${determination.disposition}; status ${determination.status}. Correction reason: ${determination.correctionReason || 'No derived-value correction'}. Before: ${JSON.stringify(current || {})}.` }), ...state.audit],
      });
    },
    approveDetermination(caseId) {
      const determination = state.determinations.find(item => item.caseId === caseId);
      const caseRecord = state.cases.find(record => record.id === caseId);
      const actorName = DEMO_USERS[state.ui.roleView];
      const finalLetter = state.correspondence.find(item => item.caseId === caseId && item.type === CORRESPONDENCE_TYPE.FINAL_RESPONSE && item.status === CORRESPONDENCE_STATUS.APPROVED);
      const responsive = state.reviewDecisions.filter(item => state.documents.some(document => document.id === item.docId && document.caseId === caseId) && item.responsiveness === RESPONSIVENESS.RESPONSIVE);
      const outstandingRework = state.tasks.some(task => task.caseId === caseId && task.type === 'Review correction' && task.status !== TASK_STATUS.DONE && task.status !== TASK_STATUS.CANCELLED);
      const unresolvedCoordination = state.coordinationItems.some(item => item.caseId === caseId && ![COORDINATION_STATUS.APPLIED, COORDINATION_STATUS.CLOSED].includes(item.status as typeof COORDINATION_STATUS.APPLIED | typeof COORDINATION_STATUS.CLOSED));
      const blockers = !determination || determination.preparedBy === actorName || state.ui.roleView !== 'Supervisor / QC' || !finalLetter || outstandingRework || unresolvedCoordination || responsive.some(item => item.outcome === REVIEW_OUTCOME.NOT_APPLICABLE || !item.qcApproved);
      if (!caseRecord || blockers || !ALLOWED_TRANSITIONS[caseRecord.status]?.includes(CASE_STATUS.PENDING_RESPONSE)) {
        dispatch({ type: 'message', message: determination?.preparedBy === actorName ? 'The determination preparer cannot approve it.' : 'Final response blockers remain.' });
        return false;
      }
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, status: CASE_STATUS.PENDING_RESPONSE } : record),
        determinations: state.determinations.map(item => item.caseId === caseId ? { ...item, status: DETERMINATION_STATUS.APPROVED, approvedBy: actorName } : item),
        audit: [audit({ caseId, action: 'Final response approved', detail: 'Determination and approved response letter passed blocker checks.', from: caseRecord.status, to: CASE_STATUS.PENDING_RESPONSE }), ...state.audit],
      });
      return true;
    },
    dispatchRelease(input, fail) {
      const caseRecord = state.cases.find(record => record.id === input.caseId);
      const correspondence = state.correspondence.find(item => item.id === input.correspondenceId);
      const determination = state.determinations.find(item => item.caseId === input.caseId);
      const documents = input.docIds.map(id => state.documents.find(document => document.id === id)).filter(Boolean) as Document[];
      const validDocs = documents.length === input.docIds.length && documents.every(document => {
        const sourceDecision = state.reviewDecisions.find(item => item.candidateDocId === document.id);
        return document.classification === DOC_CLASSIFICATION.APPROVED && !document.releasedInRecordId && sourceDecision?.outcome !== REVIEW_OUTCOME.REFERRED;
      });
      const noRecordsFinal = input.kind === RELEASE_KIND.FINAL && determination?.disposition === DISPOSITION.NO_RECORDS && input.docIds.length === 0;
      const expectedType = input.kind === RELEASE_KIND.FINAL ? CORRESPONDENCE_TYPE.FINAL_RESPONSE : CORRESPONDENCE_TYPE.INTERIM_RELEASE;
      const responsive = state.reviewDecisions.filter(item => state.documents.some(document => document.id === item.docId && document.caseId === input.caseId) && item.responsiveness === RESPONSIVENESS.RESPONSIVE);
      const reviewBlocker = responsive.some(item => item.outcome === REVIEW_OUTCOME.NOT_APPLICABLE || !item.qcApproved);
      const coordinationBlocker = state.coordinationItems.some(item => item.caseId === input.caseId && item.docIds.some(id => input.docIds.includes(id)) && ![COORDINATION_STATUS.APPLIED, COORDINATION_STATUS.CLOSED].includes(item.status as typeof COORDINATION_STATUS.APPLIED | typeof COORDINATION_STATUS.CLOSED));
      if (!caseRecord || (!validDocs && !noRecordsFinal) || reviewBlocker || coordinationBlocker || !correspondence || correspondence.type !== expectedType || correspondence.status !== CORRESPONDENCE_STATUS.APPROVED) return false;
      if (input.kind === RELEASE_KIND.FINAL && caseRecord.status !== CASE_STATUS.PENDING_RESPONSE) return false;
      if (input.kind === RELEASE_KIND.INTERIM && caseRecord.status !== CASE_STATUS.DETERMINATION) return false;
      const id = `release-${Date.now()}`;
      const outcome = fail ? DELIVERY_OUTCOME.FAILED : DELIVERY_OUTCOME.DELIVERED;
      const next: ReleaseRecord = { ...input, id, sentAt: new Date().toISOString(), sentBy: DEMO_USERS[state.ui.roleView], deliveryOutcome: outcome };
      replace({
        ...state,
        releaseRecords: [next, ...state.releaseRecords],
        documents: fail ? state.documents : state.documents.map(document => input.docIds.includes(document.id) ? { ...document, accessClass: ACCESS_CLASS.REQUESTER, releasedInRecordId: id } : document),
        correspondence: state.correspondence.map(item => item.id === input.correspondenceId ? { ...item, status: fail ? CORRESPONDENCE_STATUS.DELIVERY_FAILED : CORRESPONDENCE_STATUS.SENT, sentAt: new Date().toISOString() } : item),
        audit: [audit({ caseId: input.caseId, action: `${input.kind} release dispatched`, detail: `${outcome}; ${input.docIds.length} document(s); ${input.channel}. Recorded in the case; nothing is transmitted externally.` }), ...state.audit],
      });
      return true;
    },
    retryRelease(id) {
      const release = state.releaseRecords.find(item => item.id === id);
      if (!release || release.deliveryOutcome !== DELIVERY_OUTCOME.FAILED) return false;
      replace({
        ...state,
        releaseRecords: state.releaseRecords.map(item => item.id === id ? { ...item, deliveryOutcome: DELIVERY_OUTCOME.DELIVERED, sentAt: new Date().toISOString() } : item),
        documents: state.documents.map(document => release.docIds.includes(document.id) ? { ...document, accessClass: ACCESS_CLASS.REQUESTER, releasedInRecordId: id } : document),
        correspondence: state.correspondence.map(item => item.id === release.correspondenceId ? { ...item, status: CORRESPONDENCE_STATUS.SENT, sentAt: new Date().toISOString() } : item),
        audit: [audit({ caseId: release.caseId, action: 'Release delivery retried', detail: 'Delivery recorded as Delivered.' }), ...state.audit],
      });
      return true;
    },
    returnToReview(caseId, reason) {
      const current = state.cases.find(record => record.id === caseId);
      if (!current || !reason.trim() || !ALLOWED_TRANSITIONS[current.status]?.includes(CASE_STATUS.REVIEW)) return false;
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, status: CASE_STATUS.REVIEW } : record),
        audit: [audit({ caseId, action: 'Returned to Review for remaining records', detail: reason, from: current.status, to: CASE_STATUS.REVIEW, reason }), ...state.audit],
      });
      return true;
    },
    createCoordination(input) {
      if (![ROLE_VIEWS[0], ROLE_VIEWS[2], ROLE_VIEWS[3], ROLE_VIEWS[4]].includes(state.ui.roleView as typeof ROLE_VIEWS[0] | typeof ROLE_VIEWS[2] | typeof ROLE_VIEWS[3] | typeof ROLE_VIEWS[4])) throw new Error('This role cannot manage coordination.');
      const id = `coordination-${Date.now()}`;
      const noticeId = input.kind === COORDINATION_KIND.CONSULTATION ? undefined : `correspondence-${Date.now()}-coordination`;
      const next: CoordinationItem = { ...input, id, status: COORDINATION_STATUS.IDENTIFIED, noticeCorrespondenceId: noticeId, createdBy: DEMO_USERS[state.ui.roleView], createdAt: new Date().toISOString() };
      const affectedOutcome = input.kind === COORDINATION_KIND.REFERRAL ? REVIEW_OUTCOME.REFERRED : input.kind === COORDINATION_KIND.CONSULTATION ? REVIEW_OUTCOME.CONSULTATION : null;
      const notice: Correspondence[] = noticeId ? [{ id: noticeId, caseId: input.caseId, type: CORRESPONDENCE_TYPE.COORDINATION_NOTICE, templateId: '', ...letterText(state.correspondenceTemplates, CORRESPONDENCE_TYPE.COORDINATION_NOTICE, state.cases.find(record => record.id === input.caseId)), direction: 'Outbound', status: CORRESPONDENCE_STATUS.DRAFT, requesterVisible: true, createdBy: DEMO_USERS[state.ui.roleView] }] : [];
      replace({
        ...state,
        coordinationItems: [next, ...state.coordinationItems],
        reviewDecisions: affectedOutcome ? state.reviewDecisions.map(item => input.docIds.includes(item.docId) ? { ...item, outcome: affectedOutcome } : item) : state.reviewDecisions,
        correspondence: [...notice, ...state.correspondence],
        audit: [audit({ caseId: input.caseId, action: 'Coordination identified', detail: `${input.kind} to ${input.destination}; documents: ${input.docIds.join(', ') || 'whole request'}. ${input.basis}` }), ...state.audit],
      });
      return next;
    },
    updateCoordination(id, status, responseText = '', outcome) {
      const current = state.coordinationItems.find(item => item.id === id);
      if (!current || ![ROLE_VIEWS[0], ROLE_VIEWS[2], ROLE_VIEWS[3], ROLE_VIEWS[4]].includes(state.ui.roleView as typeof ROLE_VIEWS[0] | typeof ROLE_VIEWS[2] | typeof ROLE_VIEWS[3] | typeof ROLE_VIEWS[4])) return false;
      if (status === COORDINATION_STATUS.APPROVED && state.settings.outboundApprovalRequired && state.ui.roleView !== 'Supervisor / QC') return false;
      const now = new Date().toISOString();
      const sends = status === COORDINATION_STATUS.SENT;
      const receives = status === COORDINATION_STATUS.RESPONSE && current.kind === COORDINATION_KIND.CONSULTATION;
      const applies = status === COORDINATION_STATUS.APPLIED;
      const noticeId = current.noticeCorrespondenceId || (sends ? `correspondence-${Date.now()}-coordination` : undefined);
      const notice: Correspondence[] = sends && !current.noticeCorrespondenceId ? [{
        id: noticeId!, caseId: current.caseId, type: CORRESPONDENCE_TYPE.COORDINATION_NOTICE,
        templateId: '', ...letterText(state.correspondenceTemplates, CORRESPONDENCE_TYPE.COORDINATION_NOTICE, state.cases.find(record => record.id === current.caseId)),
        direction: 'Outbound', status: CORRESPONDENCE_STATUS.SENT, requesterVisible: true,
        createdBy: DEMO_USERS[state.ui.roleView], approvedBy: state.ui.roleView === 'Supervisor / QC' ? DEMO_USERS[state.ui.roleView] : undefined, sentAt: now,
      }] : [];
      replace({
        ...state,
        coordinationItems: state.coordinationItems.map(item => item.id === id ? { ...item, status, responseText: responseText || item.responseText, noticeCorrespondenceId: noticeId } : item),
        correspondence: [...notice, ...state.correspondence.map(item => sends && current.noticeCorrespondenceId === item.id ? { ...item, status: CORRESPONDENCE_STATUS.SENT, sentAt: now } : item)],
        tasks: receives ? [{ id: `task-${Date.now()}-consultation`, caseId: current.caseId, type: 'Consultation', title: 'Apply consultation recommendation', ownerName: state.cases.find(item => item.id === current.caseId)?.processor || DEMO_USERS['Processor'], ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt: now, linkedRef: id }, ...state.tasks] : state.tasks,
        reviewDecisions: applies && outcome ? state.reviewDecisions.map(item => current.docIds.includes(item.docId) ? { ...item, outcome } : item) : state.reviewDecisions,
        audit: [audit({ caseId: current.caseId, action: `Coordination ${status}`, detail: `${current.kind} with ${current.destination}. ${responseText}`.trim(), from: current.status, to: status }), ...state.audit],
      });
      return true;
    },
    confirmTransfer(id, taskDecisions, reason) {
      const item = state.coordinationItems.find(coordination => coordination.id === id);
      const caseRecord = item && state.cases.find(record => record.id === item.caseId);
      if (!item || !caseRecord || ![ROLE_VIEWS[0], ROLE_VIEWS[4]].includes(state.ui.roleView as typeof ROLE_VIEWS[0] | typeof ROLE_VIEWS[4]) || item.kind !== COORDINATION_KIND.TRANSFER || !reason.trim() || !ALLOWED_TRANSITIONS[caseRecord.status]?.includes(CASE_STATUS.TRANSFERRED)) return false;
      replace({
        ...state,
        cases: state.cases.map(record => record.id === item.caseId ? { ...record, status: CASE_STATUS.TRANSFERRED } : record),
        coordinationItems: state.coordinationItems.map(coordination => coordination.id === id ? { ...coordination, status: COORDINATION_STATUS.CLOSED, responseText: reason } : coordination),
        tasks: state.tasks.map(task => {
          const choice = taskDecisions[task.id];
          if (choice === 'Transferred') return { ...task, ownerName: item.destination };
          if (choice === 'Stopped') return { ...task, status: TASK_STATUS.CANCELLED, completedAt: new Date().toISOString() };
          return task;
        }),
        audit: [audit({ caseId: item.caseId, action: 'Transfer confirmed', detail: `${item.destination}. Task decisions: ${JSON.stringify(taskDecisions)}. Transfer ownership and reporting effects pending SME/counsel.`, from: caseRecord.status, to: CASE_STATUS.TRANSFERRED, reason }), ...state.audit],
      });
      return true;
    },
    saveFee(record) {
      if (![ROLE_VIEWS[0], ROLE_VIEWS[4], ROLE_VIEWS[7]].includes(state.ui.roleView as typeof ROLE_VIEWS[0] | typeof ROLE_VIEWS[4] | typeof ROLE_VIEWS[7])) return;
      const current = state.feeRecords.find(item => item.caseId === record.caseId);
      replace({ ...state, feeRecords: [record, ...state.feeRecords.filter(item => item.caseId !== record.caseId)], audit: [audit({ caseId: record.caseId, action: 'Fee record updated', detail: `Estimate ${record.estimateTotal}; agreement ${record.requesterAgreement}; payment ${record.payment.status}. Before: ${JSON.stringify(current || {})}. No payment is processed.` }), ...state.audit] });
    },
    draftFeeNotice(caseId) {
      const caseRecord = state.cases.find(record => record.id === caseId);
      if (!caseRecord) return;
      const next: Correspondence = { id: `correspondence-${Date.now()}-fee`, caseId, type: CORRESPONDENCE_TYPE.FEE_ESTIMATE, templateId: 'template-3', ...letterText(state.correspondenceTemplates, CORRESPONDENCE_TYPE.FEE_ESTIMATE, caseRecord), direction: 'Outbound', status: CORRESPONDENCE_STATUS.DRAFT, requesterVisible: true, createdBy: DEMO_USERS[state.ui.roleView] };
      replace({ ...state, correspondence: [next, ...state.correspondence], audit: [audit({ caseId, action: 'Fee estimate notice drafted', detail: 'Draft only; no hold was started.' }), ...state.audit] });
    },
    registerAppeal(input) {
      const portalAppeal = state.ui.roleView === ROLE_VIEWS[10] && input.channel === 'Portal';
      if (!portalAppeal && ![ROLE_VIEWS[0], ROLE_VIEWS[6], ROLE_VIEWS[8]].includes(state.ui.roleView as typeof ROLE_VIEWS[0] | typeof ROLE_VIEWS[6] | typeof ROLE_VIEWS[8])) throw new Error('This role cannot register appeals.');
      const challenged = input.challengedReleaseId ? state.releaseRecords.find(item => item.id === input.challengedReleaseId) : undefined;
      const caseRecord = state.cases.find(record => record.id === input.caseId);
      const determination = state.determinations.find(item => item.caseId === input.caseId && item.status === DETERMINATION_STATUS.APPROVED);
      const ordinaryPath = challenged?.kind === RELEASE_KIND.FINAL || Boolean(determination);
      if (!caseRecord || (!ordinaryPath && !input.staffReviewRoute) || (challenged?.kind === RELEASE_KIND.INTERIM && !input.staffReviewRoute)) throw new Error('Staff-review route is required for this appeal.');
      let seq = Math.max(0, ...state.appeals.map(item => Number(item.id.split('-').pop()) || 0)) + 1;
      let id = `APL-${String(seq).padStart(4, '0')}`;
      while (state.appeals.some(item => item.id === id)) id = `APL-${String(++seq).padStart(4, '0')}`;
      const next: Appeal = { ...input, id, status: APPEAL_STATUS.RECEIVED, eligibilityNote: 'Eligibility and timing pending counsel (OQ-12)' };
      replace({ ...state, appeals: [next, ...state.appeals], audit: [audit({ caseId: input.caseId, action: 'Appeal registered', detail: `${id}; staff-review route: ${input.staffReviewRoute ? 'Yes' : 'No'}. No timeliness calculation performed.` }), ...state.audit] });
      return next;
    },
    updateAppeal(id, changes, note) {
      const appeal = state.appeals.find(item => item.id === id);
      const caseRecord = appeal && state.cases.find(record => record.id === appeal.caseId);
      const reviewChange = Boolean(changes.decision || changes.status === APPEAL_STATUS.IN_REVIEW || changes.status === APPEAL_STATUS.DECIDED || changes.status === APPEAL_STATUS.REMANDED);
      const assignmentRoleAllowed = !changes.assignedTo || [ROLE_VIEWS[0], ROLE_VIEWS[6], ROLE_VIEWS[8]].includes(state.ui.roleView as typeof ROLE_VIEWS[0] | typeof ROLE_VIEWS[6] | typeof ROLE_VIEWS[8]);
      if (!appeal || !caseRecord || !assignmentRoleAllowed || (changes.assignedTo && changes.assignedTo === caseRecord.processor) || (reviewChange && state.ui.roleView !== ROLE_VIEWS[6])) return false;
      const decisionNotice: Correspondence[] = changes.decision ? [{ id: `correspondence-${Date.now()}-appeal`, caseId: appeal.caseId, type: CORRESPONDENCE_TYPE.OTHER, templateId: '', subject: `Appeal decision for your FOIA request ${appeal.caseId}`, body: letterText(state.correspondenceTemplates, CORRESPONDENCE_TYPE.OTHER, caseRecord).body, direction: 'Outbound', status: CORRESPONDENCE_STATUS.DRAFT, requesterVisible: true, createdBy: DEMO_USERS[state.ui.roleView] }] : [];
      replace({ ...state, appeals: state.appeals.map(item => item.id === id ? { ...item, ...changes } : item), correspondence: [...decisionNotice, ...state.correspondence], audit: [audit({ caseId: appeal.caseId, action: 'Appeal updated', detail: `${id}: ${note}. Before status ${appeal.status}; after ${changes.status || appeal.status}.` }), ...state.audit] });
      return true;
    },
    remandAppeal(id, reason) {
      const appeal = state.appeals.find(item => item.id === id);
      const caseRecord = appeal && state.cases.find(record => record.id === appeal.caseId);
      if (!appeal || !caseRecord || state.ui.roleView !== ROLE_VIEWS[6] || !reason.trim()) return false;
      const reopen = caseRecord.status === CASE_STATUS.CLOSED;
      replace({
        ...state,
        cases: reopen ? state.cases.map(record => record.id === appeal.caseId ? { ...record, status: CASE_STATUS.REOPENED } : record) : state.cases,
        appeals: state.appeals.map(item => item.id === id ? { ...item, status: APPEAL_STATUS.REMANDED, decision: APPEAL_DECISION.REMANDED, rationale: reason } : item),
        tasks: [{ id: `task-${Date.now()}-remand`, caseId: appeal.caseId, type: 'Appeal remand', title: `Process remand for ${id}`, ownerName: caseRecord.processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt: new Date().toISOString(), linkedRef: id }, ...state.tasks],
        audit: [audit({ caseId: appeal.caseId, action: 'Appeal remand recorded', detail: `${id}: ${reason}.`, from: caseRecord.status, to: reopen ? CASE_STATUS.REOPENED : caseRecord.status, reason }), ...state.audit],
      });
      return true;
    },
    reopenLateRecords(caseId, reason) {
      const current = state.cases.find(record => record.id === caseId);
      if (!current || current.status !== CASE_STATUS.CLOSED || !['Supervisor / QC', 'Administrator'].includes(state.ui.roleView) || !reason.trim()) return false;
      replace({ ...state, cases: state.cases.map(record => record.id === caseId ? { ...record, status: CASE_STATUS.REOPENED } : record), tasks: [{ id: `task-${Date.now()}-late`, caseId, type: 'Late-found records', title: 'Review late-found records', ownerName: current.processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt: new Date().toISOString() }, ...state.tasks], audit: [audit({ caseId, action: 'Reopened - late-found records', detail: reason, from: CASE_STATUS.CLOSED, to: CASE_STATUS.REOPENED, reason }), ...state.audit] });
      return true;
    },
    portalRequesterReply(caseId, text, files) {
      const caseRecord = state.cases.find(record => record.id === caseId);
      if (!caseRecord || state.ui.roleView !== 'Requester (Portal)' || caseRecord.requesterKey !== state.ui.portalRequesterKey) return false;
      const now = new Date().toISOString();
      const documents: Document[] = files.map((file, index) => ({
        id: `document-${Date.now()}-portal-${index}`, caseId, name: file.name, sizeKb: file.sizeKb, mime: file.mime,
        source: 'Requester-supplied', classification: DOC_CLASSIFICATION.SOURCE, version: 1,
        accessClass: ACCESS_CLASS.INTERNAL, uploadStatus: UPLOAD_STATUS.UPLOADED, pageCount: 0,
        createdAt: now, createdBy: caseRecord.requester,
      }));
      const reply: Correspondence = {
        id: `correspondence-${Date.now()}-portal-reply`, caseId, type: CORRESPONDENCE_TYPE.REQUESTER_REPLY,
        templateId: '', subject: `Requester reply - ${caseId}`, body: text, direction: 'Inbound',
        status: CORRESPONDENCE_STATUS.SENT, requesterVisible: true, createdBy: caseRecord.requester, createdAt: now, sentAt: now,
      };
      replace({
        ...state,
        correspondence: [reply, ...state.correspondence],
        documents: [...documents, ...state.documents],
        tasks: [{ id: `task-${Date.now()}-portal-reply`, caseId, type: 'Requester response', title: 'Review requester response', ownerName: caseRecord.processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt: now }, ...state.tasks],
        notifications: [{ id: `notification-${Date.now()}-portal-reply`, forName: caseRecord.processor, forRole: 'Processor', caseId, text: `Requester response received for ${caseId}.`, createdAt: now, read: false }, ...state.notifications],
        audit: [audit({ caseId, action: 'Requester response received through portal', detail: `${documents.length} attachment(s). No hold or case status was changed.` }), ...state.audit],
      });
      return true;
    },
    portalFeeResponse(caseId, response, text) {
      const caseRecord = state.cases.find(record => record.id === caseId);
      const fee = state.feeRecords.find(item => item.caseId === caseId);
      if (!caseRecord || !fee || state.ui.roleView !== 'Requester (Portal)' || caseRecord.requesterKey !== state.ui.portalRequesterKey) return false;
      const agreement = response === 'Agree' ? REQUESTER_AGREEMENT.AGREED : response === 'Decline' ? REQUESTER_AGREEMENT.DECLINED : REQUESTER_AGREEMENT.PENDING;
      replace({
        ...state,
        feeRecords: state.feeRecords.map(item => item.caseId === caseId ? { ...item, requesterAgreement: agreement, waiver: response === 'Waiver or narrower scope' ? { ...item.waiver, requested: true, rationale: text } : item.waiver } : item),
        notifications: [{ id: `notification-${Date.now()}-fee-response`, forName: caseRecord.processor, forRole: 'Processor', caseId, text: `Requester fee response recorded: ${response}.`, createdAt: new Date().toISOString(), read: false }, ...state.notifications],
        audit: [audit({ caseId, action: 'Requester fee response received', detail: `${response}: ${text}. No payment is processed.` }), ...state.audit],
      });
      return true;
    },
    createReadingRoomItem(input) {
      const caseRecord = state.cases.find(record => record.id === input.caseId);
      const release = state.releaseRecords.find(item => item.caseId === input.caseId && item.kind === RELEASE_KIND.FINAL && item.publishToReadingRoom === PUBLICATION_CHOICE.YES && item.deliveryOutcome === DELIVERY_OUTCOME.DELIVERED);
      const eligible = input.docIds.length > 0 && input.docIds.every(id => state.documents.some(document => document.id === id && document.classification === DOC_CLASSIFICATION.APPROVED && document.releasedInRecordId));
      if (!caseRecord || caseRecord.requestType === REQUEST_TYPE.PRIVACY_ACT || !release || !eligible) {
        dispatch({ type: 'message', message: caseRecord?.requestType === REQUEST_TYPE.PRIVACY_ACT ? 'Blocked pending counsel review' : 'Reading Room eligibility checks failed.' });
        return null;
      }
      const next: ReadingRoomItem = { ...input, id: `reading-room-${Date.now()}`, status: 'Pending approval', publishedAt: '', preparedBy: DEMO_USERS[state.ui.roleView], publicationBasis: 'Policy pending' };
      replace({ ...state, readingRoomItems: [next, ...state.readingRoomItems], audit: [audit({ caseId: input.caseId, action: 'Reading Room publication prepared', detail: `${input.title}; ${input.docIds.length} released document(s). Policy pending.` }), ...state.audit] });
      return next;
    },
    approveReadingRoomItem(id) {
      const item = state.readingRoomItems.find(record => record.id === id);
      const actorName = DEMO_USERS[state.ui.roleView];
      if (!item || state.ui.roleView !== 'Supervisor / QC' || item.preparedBy === actorName) {
        dispatch({ type: 'message', message: 'A second person in Supervisor / QC must approve publication.' });
        return false;
      }
      const now = new Date().toISOString();
      replace({
        ...state,
        readingRoomItems: state.readingRoomItems.map(record => record.id === id ? { ...record, status: 'Published', publishedAt: now, approvedBy: actorName } : record),
        documents: state.documents.map(document => item.docIds.includes(document.id) ? { ...document, accessClass: ACCESS_CLASS.PUBLIC } : document),
        audit: [audit({ caseId: item.caseId, action: 'Reading Room item published', detail: `${item.title}; approved by ${actorName}. Publication basis: Policy pending.` }), ...state.audit],
      });
      return true;
    },
    unpublishReadingRoomItem(id, reason) {
      const item = state.readingRoomItems.find(record => record.id === id);
      if (!item || !reason.trim()) return false;
      replace({
        ...state,
        readingRoomItems: state.readingRoomItems.map(record => record.id === id ? { ...record, status: 'Unpublished', unpublishReason: reason } : record),
        documents: state.documents.map(document => item.docIds.includes(document.id) ? { ...document, accessClass: ACCESS_CLASS.REQUESTER } : document),
        audit: [audit({ caseId: item.caseId, action: 'Reading Room item unpublished', detail: reason, reason }), ...state.audit],
      });
      return true;
    },
    recordClockEvent(event, caseChanges = {}, options = {}) {
      const next: ClockEvent = {
        ...event,
        id: `clock-${Date.now()}`,
        authorisedBy: DEMO_USERS[state.ui.roleView],
        authorisedRole: state.ui.roleView,
        ruleStatus: 'Rule pending counsel/SME approval',
        recordedAt: new Date().toISOString(),
      };
      const current = state.cases.find(record => record.id === event.caseId);
      next.previousState = current?.clock.state;
      next.resultingState = caseChanges.clock?.state ?? current?.clock.state;
      const targetDays = caseChanges.dueDate ? calendarDays(state.settings.asOfDate, caseChanges.dueDate) : null;
      const adjustedChanges = 'dueDate' in caseChanges ? { ...caseChanges, risk: targetDays === null ? 'Not assessed' : targetDays <= 3 ? 'High' : targetDays <= 7 ? 'Medium' : 'Low' } : caseChanges;
      const createdAt = new Date().toISOString();
      const extension: Correspondence[] = options.draftExtension ? [{
        id: `correspondence-${Date.now()}-extension`, caseId: event.caseId, type: CORRESPONDENCE_TYPE.EXTENSION,
        templateId: 'template-4', ...letterText(state.correspondenceTemplates, CORRESPONDENCE_TYPE.EXTENSION, current),
        direction: 'Outbound', status: CORRESPONDENCE_STATUS.DRAFT, requesterVisible: true,
        createdBy: DEMO_USERS[state.ui.roleView],
      }] : [];
      const awaitTask: Task[] = options.awaitRequesterTask ? [{
        id: `task-${Date.now()}-await`, caseId: event.caseId, type: 'Clarification', title: 'Await requester response',
        ownerName: current?.processor || DEMO_USERS['Processor'], ownerRole: 'Processor', status: TASK_STATUS.OPEN,
        dueDate: null, createdAt,
      }] : [];
      replace({
        ...state,
        cases: state.cases.map(record => record.id === event.caseId ? { ...record, ...adjustedChanges } : record),
        clockEvents: [next, ...state.clockEvents],
        correspondence: [...extension, ...state.correspondence],
        tasks: [...awaitTask, ...state.tasks],
        audit: [audit({ caseId: event.caseId, action: event.kind, detail: `${event.reason} Effective date: ${event.effectiveDate}. Before: ${JSON.stringify(current?.clock)}. After: ${JSON.stringify(adjustedChanges)}.`, reason: event.reason }), ...state.audit],
      });
    },
    createRfd(input, trackingTask) {
      const next: RFD = {
        ...input,
        id: `rfd-${Date.now()}`,
        status: RFD_STATUS.DRAFT,
        returnedDocIds: [],
        evidence: { locationsSearched: '', systems: '', timeSpentHours: 0, searchedBy: '', notes: '' },
      };
      const task: Task[] = trackingTask ? [{ ...trackingTask, id: `task-${Date.now()}-rfd`, caseId: input.caseId, createdAt: new Date().toISOString(), linkedRef: next.id }] : [];
      replace({ ...state, rfds: [next, ...state.rfds], tasks: [...task, ...state.tasks], audit: [audit({ caseId: input.caseId, action: 'RFD created', detail: `Draft RFD created for ${input.office}.${task.length ? ' Tracking task added.' : ''}` }), ...state.audit] });
      return next;
    },
    updateRfd(id, changes, action, reason = '') {
      const current = state.rfds.find(item => item.id === id);
      if (!current) return false;
      const sent = changes.status === RFD_STATUS.SENT && current.status !== RFD_STATUS.SENT;
      const caseRecord = state.cases.find(record => record.id === current.caseId);
      const movesToSearch = sent && caseRecord?.status === CASE_STATUS.IN_PROGRESS;
      const createdAt = new Date().toISOString();
      replace({
        ...state,
        rfds: state.rfds.map(item => item.id === id ? { ...item, ...changes, sentAt: sent ? createdAt : changes.sentAt ?? item.sentAt } : item),
        cases: movesToSearch ? state.cases.map(record => record.id === current.caseId ? { ...record, status: CASE_STATUS.RECORDS_SEARCH } : record) : state.cases,
        tasks: sent ? [{
          id: `task-${Date.now()}-rfd`, caseId: current.caseId, type: 'RFD', title: `Respond to RFD for ${current.office}`,
          ownerName: current.custodianName, ownerRole: 'Custodian / Action Office', status: TASK_STATUS.OPEN,
          dueDate: current.dueDate || null, createdAt,
        }, ...state.tasks] : state.tasks,
        notifications: sent ? [{
          id: `notification-${Date.now()}-rfd`, forRole: 'Custodian / Action Office', forName: current.custodianName,
          caseId: current.caseId, text: `RFD sent for ${current.office}.`, createdAt, read: false,
        }, ...state.notifications] : state.notifications,
        audit: [
          audit({ caseId: current.caseId, action, detail: `${action} for ${current.office}. ${reason}`.trim(), from: current.status, to: changes.status, reason }),
          ...(movesToSearch ? [audit({ caseId: current.caseId, action: 'Case status changed', detail: 'First RFD sent; case moved to Records Search.', from: caseRecord!.status, to: CASE_STATUS.RECORDS_SEARCH, reason: 'First RFD marked as sent' })] : []),
          ...state.audit,
        ],
      });
      return true;
    },
    returnRfd(id, noRecords, evidence, files, statement = '') {
      const current = state.rfds.find(item => item.id === id);
      if (!current) return false;
      const createdAt = new Date().toISOString();
      const documents: Document[] = files.map((file, index) => ({
        id: `document-${Date.now()}-${index}`, caseId: current.caseId, rfdId: id, office: current.office,
        name: file.name, sizeKb: file.sizeKb, mime: file.mime, source: 'Custodian return',
        classification: DOC_CLASSIFICATION.SOURCE, version: 1, accessClass: ACCESS_CLASS.INTERNAL,
        uploadStatus: UPLOAD_STATUS.UPLOADED, pageCount: 0, createdAt, createdBy: DEMO_USERS[state.ui.roleView],
      }));
      const status = noRecords ? RFD_STATUS.RETURNED_NO_RECORDS : RFD_STATUS.RETURNED_RECORDS;
      replace({
        ...state,
        documents: [...documents, ...state.documents],
        rfds: state.rfds.map(item => item.id === id ? {
          ...item, status, evidence, returnedDocIds: documents.map(document => document.id),
          noRecordsStatement: noRecords ? { text: statement, by: DEMO_USERS[state.ui.roleView], at: createdAt } : undefined,
        } : item),
        audit: [audit({ caseId: current.caseId, action: 'RFD return recorded', detail: `${current.office} returned ${noRecords ? 'no responsive records' : `${documents.length} document(s)`}.` }), ...state.audit],
      });
      return true;
    },
    completeSearch(caseId) {
      const rfds = state.rfds.filter(item => item.caseId === caseId);
      if (!rfds.length || !rfds.every(item => item.status === RFD_STATUS.ACCEPTED || item.status === RFD_STATUS.CANCELLED)) return false;
      const accepted = rfds.filter(item => item.status === RFD_STATUS.ACCEPTED);
      const hasDocuments = accepted.some(item => item.returnedDocIds.some(id => state.documents.some(document => document.id === id && document.source === 'Custodian return')));
      const allNoRecords = accepted.length > 0 && accepted.every(item => item.noRecordsStatement);
      if (!hasDocuments && !allNoRecords) return false;
      const current = state.cases.find(record => record.id === caseId);
      replace({
        ...state,
        cases: hasDocuments && current?.status === CASE_STATUS.RECORDS_SEARCH ? state.cases.map(record => record.id === caseId ? { ...record, status: CASE_STATUS.REVIEW } : record) : state.cases,
        audit: [audit({ caseId, action: hasDocuments ? 'Search complete' : 'Search complete - no responsive records', detail: hasDocuments ? 'All RFDs reconciled; accepted custodian records are available for review.' : 'All accepted RFDs reported no responsive records. Case remains in Records Search.', from: current?.status, to: hasDocuments ? CASE_STATUS.REVIEW : current?.status, reason: 'RFD reconciliation completed' }), ...state.audit],
        message: hasDocuments ? 'Search marked complete. Case moved to Review.' : 'Search complete - no responsive records.',
      });
      return true;
    },
    addDocument(input) {
      const next: Document = { ...input, id: input.id || `document-${Date.now()}`, createdAt: input.createdAt || new Date().toISOString(), createdBy: input.createdBy || DEMO_USERS[state.ui.roleView] };
      replace({ ...state, documents: [next, ...state.documents], audit: [audit({ caseId: input.caseId, action: 'Document metadata added', detail: `${input.name} added as ${input.classification}; upload status ${input.uploadStatus}.` }), ...state.audit] });
      return next;
    },
    createCorrespondence(input) {
      const next: Correspondence = { ...input, id: input.id || `correspondence-${Date.now()}`, createdBy: input.createdBy || DEMO_USERS[state.ui.roleView] };
      replace({ ...state, correspondence: [next, ...state.correspondence], audit: [audit({ caseId: input.caseId, action: 'Correspondence created', detail: `${input.type} created as ${input.status}.` }), ...state.audit] });
      return next;
    },
    recordRequesterReply(caseId, text, receivedDate, files) {
      const createdAt = new Date().toISOString();
      const documents: Document[] = files.map((file, index) => ({
        id: `document-${Date.now()}-reply-${index}`, caseId, name: file.name, sizeKb: file.sizeKb,
        mime: file.mime, source: 'Requester-supplied', classification: DOC_CLASSIFICATION.SOURCE,
        version: 1, accessClass: ACCESS_CLASS.INTERNAL, uploadStatus: UPLOAD_STATUS.UPLOADED,
        pageCount: 0, createdAt, createdBy: DEMO_USERS[state.ui.roleView],
      }));
      const message: Correspondence = {
        id: `correspondence-${Date.now()}-reply`, caseId, type: CORRESPONDENCE_TYPE.REQUESTER_REPLY,
        templateId: '', subject: `Requester reply - ${caseId}`, body: text, direction: 'Inbound',
        status: CORRESPONDENCE_STATUS.SENT, requesterVisible: true, createdBy: DEMO_USERS[state.ui.roleView], sentAt: `${receivedDate}T12:00:00.000Z`,
      };
      replace({
        ...state,
        correspondence: [message, ...state.correspondence],
        documents: [...documents, ...state.documents],
        audit: [audit({ caseId, action: 'Requester response recorded', detail: `Requester reply recorded for ${receivedDate} with ${documents.length} attachment(s).` }), ...state.audit],
      });
    },
    updateCorrespondence(id, changes, action) {
      const current = state.correspondence.find(item => item.id === id);
      if (!current) return false;
      const actorName = DEMO_USERS[state.ui.roleView];
      if (changes.status === CORRESPONDENCE_STATUS.APPROVED && current.createdBy === actorName) {
        dispatch({ type: 'message', message: 'The preparer cannot approve their own message.' });
        return false;
      }
      replace({
        ...state,
        correspondence: state.correspondence.map(item => item.id === id ? { ...item, ...changes, approvedBy: changes.status === CORRESPONDENCE_STATUS.APPROVED ? actorName : changes.approvedBy ?? item.approvedBy, sentAt: changes.status === CORRESPONDENCE_STATUS.SENT ? new Date().toISOString() : changes.sentAt ?? item.sentAt } : item),
        audit: [audit({ caseId: current.caseId, action, detail: `${current.type}: ${current.status} to ${changes.status || current.status}. Recorded in the case; nothing is transmitted externally.` }), ...state.audit],
      });
      return true;
    },
    updateTask(id, changes, reason) {
      const current = state.tasks.find(task => task.id === id);
      if (!current) return;
      replace({
        ...state,
        tasks: state.tasks.map(task => task.id === id ? { ...task, ...changes, completedAt: changes.status === TASK_STATUS.DONE ? new Date().toISOString() : changes.completedAt ?? task.completedAt } : task),
        audit: [audit({ caseId: current.caseId, action: 'Task updated', detail: `${current.title}: ${current.status} to ${changes.status || current.status}. ${reason}`, from: current.status, to: changes.status, reason }), ...state.audit],
      });
    },
    requestClosure(caseId, kind, reason) {
      const target = state.cases.find(record => record.id === caseId);
      const gate = target && clarificationGate(state.clarificationRounds, state.correspondence, target);
      if (gate) {
        dispatch({ type: 'message', message: `Closure is unavailable while clarification is unresolved. Outstanding: ${gate.label}.` });
        return;
      }
      if (kind === CLOSURE_KIND.FINAL_RESPONSE) {
        const caseRecord = state.cases.find(record => record.id === caseId);
        const openTasks = state.tasks.some(task => task.caseId === caseId && task.status !== TASK_STATUS.DONE && task.status !== TASK_STATUS.CANCELLED);
        const unresolvedRfds = state.rfds.some(item => item.caseId === caseId && item.status !== RFD_STATUS.ACCEPTED && item.status !== RFD_STATUS.CANCELLED);
        const unresolvedResponsive = state.reviewDecisions.some(item => state.documents.some(document => document.id === item.docId && document.caseId === caseId) && item.responsiveness === RESPONSIVENESS.RESPONSIVE && item.outcome === REVIEW_OUTCOME.NOT_APPLICABLE);
        const missingQc = state.reviewDecisions.some(item => state.documents.some(document => document.id === item.docId && document.caseId === caseId) && item.responsiveness === RESPONSIVENESS.RESPONSIVE && !item.qcApproved);
        const unresolvedCoordination = state.coordinationItems.some(item => item.caseId === caseId && ![COORDINATION_STATUS.APPLIED, COORDINATION_STATUS.CLOSED].includes(item.status as typeof COORDINATION_STATUS.APPLIED | typeof COORDINATION_STATUS.CLOSED));
        const deliveredFinal = state.releaseRecords.some(item => item.caseId === caseId && item.kind === RELEASE_KIND.FINAL && item.deliveryOutcome === DELIVERY_OUTCOME.DELIVERED);
        if (caseRecord?.status !== CASE_STATUS.PENDING_RESPONSE || openTasks || unresolvedRfds || unresolvedResponsive || missingQc || unresolvedCoordination || !deliveredFinal) {
          dispatch({ type: 'message', message: 'Final closure is blocked by open work, unresolved search/review/QC, or a missing Delivered final release.' });
          return;
        }
      }
      const next: ClosureRequest = { id: `closure-${Date.now()}`, caseId, kind, reason, requestedBy: DEMO_USERS[state.ui.roleView], status: CLOSURE_STATUS.PENDING };
      replace({ ...state, closureRequests: [next, ...state.closureRequests], audit: [audit({ caseId, action: 'Closure requested', detail: `${kind}: ${reason}`, reason }), ...state.audit] });
    },
    decideClosure(id, approved, reason) {
      const request = state.closureRequests.find(item => item.id === id);
      const current = request && state.cases.find(record => record.id === request.caseId);
      if (!request || !current || (approved && !ALLOWED_TRANSITIONS[current.status]?.includes(CASE_STATUS.CLOSED))) return false;
      const nextStatus = approved ? CLOSURE_STATUS.APPROVED : CLOSURE_STATUS.REJECTED;
      const holdEnded: ClockEvent[] = approved && current.clock.state === 'Hold recorded' ? [{
        id: `clock-${Date.now()}-closure`, caseId: request.caseId, kind: CLOCK_EVENT_KIND.HOLD_ENDED,
        holdType: current.clock.holdType as ClockEvent['holdType'], reason: `Case closure approved: ${request.reason}`,
        effectiveDate: state.settings.asOfDate, authorisedBy: DEMO_USERS[state.ui.roleView],
        authorisedRole: state.ui.roleView, ruleStatus: 'Rule pending counsel/SME approval',
        recordedAt: new Date().toISOString(), previousState: 'Hold recorded', resultingState: 'Ended',
      }] : [];
      replace({
        ...state,
        closureRequests: state.closureRequests.map(item => item.id === id ? { ...item, status: nextStatus, approvedBy: approved ? DEMO_USERS[state.ui.roleView] : undefined } : item),
        cases: approved ? state.cases.map(record => record.id === request.caseId ? { ...record, status: CASE_STATUS.CLOSED, closureReason: `${request.kind}: ${request.reason}`, clock: record.clock.state === 'Hold recorded' ? { ...record.clock, state: 'Ended' } : record.clock } : record) : state.cases,
        tasks: approved ? state.tasks.map(task => task.caseId === request.caseId && task.status !== TASK_STATUS.DONE && task.status !== TASK_STATUS.CANCELLED ? { ...task, status: TASK_STATUS.CANCELLED, completedAt: new Date().toISOString() } : task) : state.tasks,
        clockEvents: [...holdEnded, ...state.clockEvents],
        clarificationRounds: approved ? state.clarificationRounds.map(round => round.caseId === request.caseId && ![CLARIFICATION_STATUS.COMPLETED, CLARIFICATION_STATUS.NOT_REQUIRED, CLARIFICATION_STATUS.FURTHER].includes(round.status as typeof CLARIFICATION_STATUS.COMPLETED) ? { ...round, status: CLARIFICATION_STATUS.CLOSED_WITH_CASE } : round) : state.clarificationRounds,
        audit: [audit({ caseId: request.caseId, action: approved ? 'Closure approved' : 'Closure rejected', detail: approved ? `${request.kind} approved. All open tasks cancelled with reason: ${request.reason}. ${reason}` : `${request.kind} rejected. ${reason}`, from: current.status, to: approved ? CASE_STATUS.CLOSED : current.status, reason: request.reason }), ...state.audit],
      });
      return true;
    },
    addTask(task) {
      const next: Task = { id: task.id || `task-${Date.now()}`, createdAt: task.createdAt || new Date().toISOString(), ...task };
      replace({ ...state, tasks: [next, ...state.tasks], audit: [audit({ caseId: task.caseId, action: 'Task added', detail: task.title }), ...state.audit] });
    },
    addAudit(event) {
      replace({ ...state, audit: [audit(event), ...state.audit] });
    },
    addNotification(notification) {
      const next: Notification = { id: notification.id || `notification-${Date.now()}`, createdAt: notification.createdAt || new Date().toISOString(), read: notification.read || false, ...notification };
      replace({ ...state, notifications: [next, ...state.notifications] });
    },
    setRoleView(roleView) {
      replace({ ...state, ui: { ...state.ui, roleView } });
    },
    setPortalRequester(portalRequesterKey) {
      replace({ ...state, ui: { ...state.ui, portalRequesterKey } });
    },
    updateSettings(changes) {
      replace({
        ...state,
        settings: { ...state.settings, ...changes },
        audit: [audit({ action: 'System settings updated', detail: `Settings changed: ${Object.keys(changes).join(', ')}.` }), ...state.audit],
        message: 'System settings saved.',
      });
    },
    markNotificationsRead() {
      const name = state.ui.roleView === 'Administrator' ? null : state.ui.roleView;
      replace({ ...state, notifications: state.notifications.map(item => !name || item.forRole === name || item.forName === name ? { ...item, read: true } : item) });
    },
    resetData() {
      try { localStorage.removeItem(OLD_KEY); } catch { /* Reset still replaces in-memory state. */ }
      replace({ ...ensureDefaults(), message: 'Case data reset to starting data.' });
    },
    addAdminUser(user) {
      const next: AdminUser = { ...user, id: `admin-user-${Date.now()}`, status: 'Active' };
      replace({ ...state, adminUsers: [...state.adminUsers, next], audit: [audit({ action: 'Demonstration user added', detail: `${next.name}; ${next.roleView}; ${next.office}. Demonstration role view, not access control.` }), ...state.audit] });
    },
    toggleAdminUser(id) {
      const current = state.adminUsers.find(item => item.id === id);
      if (!current) return;
      const status = current.status === 'Active' ? 'Disabled' : 'Active';
      replace({ ...state, adminUsers: state.adminUsers.map(item => item.id === id ? { ...item, status } : item), audit: [audit({ action: 'Demonstration user status changed', detail: `${current.name}: ${current.status} to ${status}.` }), ...state.audit] });
    },
    updateOffice(id, changes) {
      const current = state.offices.find(item => item.id === id);
      if (!current) return;
      replace({ ...state, offices: state.offices.map(item => item.id === id ? { ...item, ...changes } : item), audit: [audit({ action: 'Office reference updated', detail: `${current.name}. Before: ${JSON.stringify(current)}. After: ${JSON.stringify({ ...current, ...changes })}.` }), ...state.audit] });
    },
    updateReferenceValue(section, oldValue, newValue, effectiveDate) {
      if (!newValue.trim() || !effectiveDate) return;
      const values = state.referenceData[section].map(value => value === oldValue ? newValue.trim() : value);
      replace({
        ...state,
        referenceData: { ...state.referenceData, [section]: values },
        exemptionCodes: section === 'exemptionCodes' ? values : state.exemptionCodes,
        audit: [audit({ action: 'Reference value changed', detail: `${section}: "${oldValue}" changed to "${newValue.trim()}". Effective date: ${effectiveDate}. Pending agency approval.`, from: oldValue, to: newValue.trim() }), ...state.audit],
      });
    },
    updateTemplate(id, changes) {
      const current = state.correspondenceTemplates.find(item => item.id === id);
      if (!current) return;
      const next = { ...current, ...changes, version: current.version + 1 };
      replace({ ...state, correspondenceTemplates: state.correspondenceTemplates.map(item => item.id === id ? next : item), audit: [audit({ action: 'Correspondence template version created', detail: `${current.name}: version ${current.version} to ${next.version}. Merge fields: ${next.mergeFields.join(', ')}.` }), ...state.audit] });
    },
    updatePortalInstructions(portalInstructionText) {
      replace({ ...state, portalInstructionText, audit: [audit({ action: 'Portal instructions updated', detail: 'Public portal instruction text was updated.' }), ...state.audit] });
    },
    simulateFoiaGovImport() {
      let number = Math.max(0, ...state.cases.map(record => Number(record.id.split('-').pop()) || 0)) + 1;
      const records = ['FOIA.gov request A (manual entry)', 'FOIA.gov request B (manual entry)'].map((title, index) => {
        const id = `FOIA-2025-${String(number++).padStart(4, '0')}`;
        return defaultsForCase({ id, title, requester: 'Not provided', received: state.settings.asOfDate, source: 'FOIA.gov (manual entry)', email: 'Not provided', phone: 'Not provided', address: 'Not provided', description: 'FOIA.gov is not connected; enter request details manually.', requesterKey: `foia-gov-simulated-${Date.now()}-${index}` });
      });
      replace({ ...state, cases: [...records, ...state.cases], audit: [...records.map(record => audit({ caseId: record.id, action: 'FOIA.gov request added', detail: 'FOIA.gov is not connected. Contact information not provided.' })), ...state.audit], message: 'Two FOIA.gov requests added for manual entry.' });
      return records.map(record => record.id);
    },
    // ---------------- WF-02 clarification and clock hold ----------------
    startClarification(caseId) {
      const caseRecord = state.cases.find(record => record.id === caseId);
      if (!caseRecord || !can(state.ui.roleView, 'manageClarification')) return null;
      if (activeRound(state.clarificationRounds, caseId)) {
        dispatch({ type: 'message', message: 'A clarification round is already open for this case.' });
        return null;
      }
      const previous = state.clarificationRounds.filter(round => round.caseId === caseId);
      const fromIntake = !previous.length && caseRecord.needsClarification;
      const now = new Date().toISOString();
      const id = `clarification-${caseId}-${previous.length + 1}-${Date.now()}`;
      const task: Task = { id: `task-${Date.now()}-clarification`, caseId, type: 'Clarification', title: 'Assess whether clarification is needed', ownerName: DEMO_USERS[state.ui.roleView], ownerRole: state.ui.roleView, status: TASK_STATUS.OPEN, dueDate: null, createdAt: now };
      const round: ClarificationRound = {
        id, caseId, round: previous.length + 1, entryPoint: fromIntake ? CLARIFICATION_ENTRY.INTAKE : CLARIFICATION_ENTRY.PROCESSING,
        status: CLARIFICATION_STATUS.ASSESSMENT, startedAt: now, startedBy: DEMO_USERS[state.ui.roleView],
        details: emptyDetails(fromIntake ? caseRecord.clarificationReason || '' : ''), assessments: [], reminders: [], noResponseDecisions: [], taskId: task.id,
      };
      replace({
        ...state,
        clarificationRounds: [round, ...state.clarificationRounds],
        tasks: [task, ...state.tasks],
        cases: state.cases.map(record => record.id === caseId ? { ...record, needsClarification: true } : record),
        audit: [audit({ caseId, action: 'Clarification initiated', detail: `Round ${round.round} started (${round.entryPoint}). Case status unchanged: ${caseRecord.status}.` }), ...state.audit],
      });
      return round;
    },
    recordAssessment(roundId, details, decision, rationale) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      const caseRecord = round && state.cases.find(record => record.id === round.caseId);
      if (!round || !caseRecord || !can(state.ui.roleView, 'manageClarification') || !rationale.trim()) return false;
      const now = new Date().toISOString();
      const by = DEMO_USERS[state.ui.roleView];
      const cleanDetails = { ...details, questions: details.questions.map(item => item.trim()).filter(Boolean) };
      const status = decision === ASSESSMENT_DECISION.CLARIFY ? CLARIFICATION_STATUS.PREPARING_NOTICE : decision === ASSESSMENT_DECISION.PROCEED ? CLARIFICATION_STATUS.NOT_REQUIRED : CLARIFICATION_STATUS.INTERNAL_REVIEW;
      const proceeding = decision === ASSESSMENT_DECISION.PROCEED;
      const scopeUpdate: ScopeUpdate | undefined = proceeding ? { scope: cleanDetails.processableScope, changeSummary: 'No change – original request scope retained.', remainingAmbiguity: cleanDetails.ambiguity, reason: rationale, sourceRef: 'Clarification need assessment', by, role: state.ui.roleView, at: now } : undefined;
      const escalationTask: Task[] = decision === ASSESSMENT_DECISION.ESCALATE && round.status !== CLARIFICATION_STATUS.INTERNAL_REVIEW ? [{ id: `task-${Date.now()}-clarification-review`, caseId: round.caseId, type: 'Clarification', title: 'Internal review of clarification need', ownerName: DEMO_USERS['Supervisor / QC'], ownerRole: 'Supervisor / QC', status: TASK_STATUS.OPEN, dueDate: null, createdAt: now }] : [];
      const closingEscalation = decision !== ASSESSMENT_DECISION.ESCALATE;
      replace({
        ...state,
        clarificationRounds: state.clarificationRounds.map(item => item.id === roundId ? {
          ...item, details: cleanDetails, status,
          assessments: [...item.assessments, { decision, rationale, by, role: state.ui.roleView, at: now }],
          scopeUpdate: scopeUpdate ?? item.scopeUpdate,
          completion: proceeding ? { nextAction: 'Continue processing with the existing request scope', by, role: state.ui.roleView, at: now } : item.completion,
        } : item),
        cases: proceeding ? state.cases.map(record => record.id === round.caseId ? { ...record, needsClarification: false } : record) : state.cases,
        tasks: [...escalationTask, ...state.tasks.map(task => task.caseId === round.caseId && task.type === 'Clarification' && openTaskStatus(task.status) && ((proceeding && (task.id === round.taskId || task.title === 'Internal review of clarification need')) || (closingEscalation && task.title === 'Internal review of clarification need')) ? { ...task, status: TASK_STATUS.DONE, completedAt: now } : task)],
        audit: [
          ...(proceeding ? [audit({ caseId: round.caseId, action: 'Clarification completed', detail: `Round ${round.round}: not required. Case continues with its existing scope. Case status unchanged: ${caseRecord.status}.` })] : []),
          audit({ caseId: round.caseId, action: proceeding ? 'Decision to proceed with existing scope' : decision === ASSESSMENT_DECISION.CLARIFY ? 'Decision to request clarification' : 'Clarification escalated for internal review', detail: `Round ${round.round}: ${decision}. ${rationale}`, reason: rationale }),
          audit({ caseId: round.caseId, action: 'Clarification need assessed', detail: `Reason: ${cleanDetails.reason}. Unclear or missing: ${cleanDetails.ambiguity}. Affected part: ${cleanDetails.affectedPortion || 'Not specified'}. Information needed: ${cleanDetails.informationNeeded || 'Not specified'}. Questions: ${cleanDetails.questions.length}.` }),
          ...state.audit,
        ],
      });
      return true;
    },
    draftClarificationNotice(roundId) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      const caseRecord = round && state.cases.find(record => record.id === round.caseId);
      if (!round || !caseRecord || round.status !== CLARIFICATION_STATUS.PREPARING_NOTICE || !can(state.ui.roleView, 'composeCorrespondence')) return null;
      const template = state.correspondenceTemplates.find(item => item.type === CORRESPONDENCE_TYPE.CLARIFICATION);
      const { subject, body } = composeNotice(template, caseRecord, round.details, state.correspondenceTemplates);
      const existing = round.noticeId ? state.correspondence.find(item => item.id === round.noticeId) : undefined;
      const now = new Date().toISOString();
      const reuse = existing && existing.status === CORRESPONDENCE_STATUS.DRAFT;
      const notice: Correspondence = reuse ? { ...existing, subject, body, updatedAt: now, clarificationRoundId: roundId, requesterVisible: true } : {
        id: `correspondence-${Date.now()}-clarification`, caseId: round.caseId, type: CORRESPONDENCE_TYPE.CLARIFICATION, templateId: template?.id || '',
        subject, body, direction: 'Outbound', status: CORRESPONDENCE_STATUS.DRAFT, requesterVisible: true,
        createdBy: DEMO_USERS[state.ui.roleView], createdAt: now, clarificationRoundId: roundId,
      };
      replace({
        ...state,
        correspondence: reuse ? state.correspondence.map(item => item.id === notice.id ? notice : item) : [notice, ...state.correspondence],
        clarificationRounds: state.clarificationRounds.map(item => item.id === roundId ? { ...item, noticeId: notice.id } : item),
        audit: [audit({ caseId: round.caseId, action: 'Notice drafted', detail: `Clarification notice for round ${round.round} drafted from template "${template?.name || 'none'}" v${template?.version || '-'} with ${round.details.questions.length} question(s). Draft – not sent.` }), ...state.audit],
      });
      return notice;
    },
    saveCorrespondenceDraft(id, subject, body) {
      const current = state.correspondence.find(item => item.id === id);
      if (!current || current.status !== CORRESPONDENCE_STATUS.DRAFT || !subject.trim() || !body.trim() || !can(state.ui.roleView, 'composeCorrespondence')) return false;
      replace({
        ...state,
        correspondence: state.correspondence.map(item => item.id === id ? { ...item, subject, body, updatedAt: new Date().toISOString() } : item),
        audit: [audit({ caseId: current.caseId, action: 'Notice edited', detail: `${current.type} draft edited. Subject before: "${current.subject}". Subject after: "${subject}". Draft – not sent.` }), ...state.audit],
        message: 'Draft saved.',
      });
      return true;
    },
    submitCorrespondence(id) {
      const current = state.correspondence.find(item => item.id === id);
      if (!current || current.status !== CORRESPONDENCE_STATUS.DRAFT || !can(state.ui.roleView, 'composeCorrespondence')) return false;
      const required = state.settings.outboundApprovalRequired;
      const now = new Date().toISOString();
      replace({
        ...state,
        correspondence: state.correspondence.map(item => item.id === id ? { ...item, status: required ? CORRESPONDENCE_STATUS.PENDING_APPROVAL : CORRESPONDENCE_STATUS.APPROVED, returnedReason: undefined, approvedBy: required ? undefined : 'Not required by current setting', approvedAt: required ? undefined : now } : item),
        notifications: required ? [{ id: `notification-${Date.now()}-approval`, forRole: 'Supervisor / QC', forName: DEMO_USERS['Supervisor / QC'], caseId: current.caseId, text: `${current.type} for ${current.caseId} is awaiting approval.`, createdAt: now, read: false }, ...state.notifications] : state.notifications,
        audit: [audit({ caseId: current.caseId, action: required ? 'Approval requested' : 'Notice ready for dispatch', detail: required ? `${current.type} submitted for approval (outbound approval setting is on).` : `${current.type} marked ready for dispatch. Approval not required by the current outbound approval setting.` }), ...state.audit],
      });
      return true;
    },
    decideCorrespondenceApproval(id, approved, reason) {
      const current = state.correspondence.find(item => item.id === id);
      const actorName = DEMO_USERS[state.ui.roleView];
      if (!current || current.status !== CORRESPONDENCE_STATUS.PENDING_APPROVAL || !can(state.ui.roleView, 'approveCorrespondence')) return false;
      if (current.createdBy === actorName) {
        dispatch({ type: 'message', message: 'The preparer cannot approve their own notice.' });
        return false;
      }
      if (!approved && !reason.trim()) return false;
      const now = new Date().toISOString();
      replace({
        ...state,
        correspondence: state.correspondence.map(item => item.id === id ? { ...item, status: approved ? CORRESPONDENCE_STATUS.APPROVED : CORRESPONDENCE_STATUS.DRAFT, approvedBy: approved ? actorName : undefined, approvedAt: approved ? now : undefined, returnedReason: approved ? undefined : reason } : item),
        audit: [audit({ caseId: current.caseId, action: 'Approval outcome recorded', detail: `${current.type}: ${approved ? 'approved – ready for dispatch' : 'returned for changes'}.${reason.trim() ? ` ${reason}` : ''}`, from: CORRESPONDENCE_STATUS.PENDING_APPROVAL, to: approved ? CORRESPONDENCE_STATUS.APPROVED : CORRESPONDENCE_STATUS.DRAFT, reason }), ...state.audit],
      });
      return true;
    },
    recordDispatch(id, input) {
      const current = state.correspondence.find(item => item.id === id);
      if (!current || ![CORRESPONDENCE_STATUS.APPROVED, CORRESPONDENCE_STATUS.DELIVERY_FAILED].includes(current.status as typeof CORRESPONDENCE_STATUS.APPROVED) || !can(state.ui.roleView, 'sendCorrespondence')) return false;
      if (!input.dispatchedAt || !input.channel || !input.recipient.trim()) return false;
      const failed = input.outcome === DELIVERY_STATUS.FAILED;
      if (failed && !input.failureDetail?.trim()) return false;
      const now = new Date().toISOString();
      const attempt = (current.dispatches?.length || 0) + 1;
      const record: DispatchRecord = { ...input, id: `dispatch-${Date.now()}`, attempt, recordedBy: DEMO_USERS[state.ui.roleView], recordedRole: state.ui.roleView, recordedAt: now };
      const round = current.clarificationRoundId ? state.clarificationRounds.find(item => item.id === current.clarificationRoundId) : undefined;
      replace({
        ...state,
        correspondence: state.correspondence.map(item => item.id === id ? { ...item, dispatches: [...(item.dispatches || []), record], status: failed ? CORRESPONDENCE_STATUS.DELIVERY_FAILED : CORRESPONDENCE_STATUS.SENT, sentAt: failed ? item.sentAt : new Date(input.dispatchedAt).toISOString() } : item),
        clarificationRounds: round && !failed && round.status === CLARIFICATION_STATUS.PREPARING_NOTICE ? state.clarificationRounds.map(item => item.id === round.id ? { ...item, status: CLARIFICATION_STATUS.AWAITING_RESPONSE } : item) : state.clarificationRounds,
        audit: [audit({ caseId: current.caseId, action: failed ? 'Delivery failure recorded' : 'Dispatch recorded', detail: `${current.type}, attempt ${attempt}: dispatched ${input.dispatchedAt.replace('T', ' ')} by ${input.channel} to ${input.recipient}. Reference: ${input.reference || 'none'}. ${input.outcome}.${failed ? ` ${input.failureDetail}` : ''} Completed outside this system.` }), ...state.audit],
      });
      return true;
    },
    updateDeliveryOutcome(id, dispatchId, outcome, detail) {
      const current = state.correspondence.find(item => item.id === id);
      const attempt = current?.dispatches?.find(item => item.id === dispatchId);
      if (!current || !attempt || attempt.outcome !== DELIVERY_STATUS.NOT_CONFIRMED || !can(state.ui.roleView, 'sendCorrespondence')) return false;
      const failed = outcome === DELIVERY_STATUS.FAILED;
      if (failed && !detail.trim()) return false;
      const round = current.clarificationRoundId ? state.clarificationRounds.find(item => item.id === current.clarificationRoundId) : undefined;
      replace({
        ...state,
        correspondence: state.correspondence.map(item => item.id === id ? { ...item, status: failed ? CORRESPONDENCE_STATUS.DELIVERY_FAILED : item.status, dispatches: item.dispatches?.map(entry => entry.id === dispatchId ? { ...entry, outcome, failureDetail: failed ? detail : entry.failureDetail } : entry) } : item),
        clarificationRounds: round && failed && round.status === CLARIFICATION_STATUS.AWAITING_RESPONSE && !round.response ? state.clarificationRounds.map(item => item.id === round.id ? { ...item, status: CLARIFICATION_STATUS.PREPARING_NOTICE } : item) : state.clarificationRounds,
        audit: [audit({ caseId: current.caseId, action: failed ? 'Delivery failure recorded' : 'Delivery outcome recorded', detail: `${current.type}, attempt ${attempt.attempt}: ${outcome}.${detail.trim() ? ` ${detail}` : ''}` }), ...state.audit],
      });
      return true;
    },
    escalateDeliveryFailure(id, note) {
      const current = state.correspondence.find(item => item.id === id);
      const last = current?.dispatches?.[current.dispatches.length - 1];
      if (!current || !last || last.outcome !== DELIVERY_STATUS.FAILED || !note.trim()) return false;
      const now = new Date().toISOString();
      replace({
        ...state,
        correspondence: state.correspondence.map(item => item.id === id ? { ...item, dispatches: item.dispatches?.map(entry => entry.id === last.id ? { ...entry, escalation: { note, by: DEMO_USERS[state.ui.roleView], at: now } } : entry) } : item),
        tasks: [{ id: `task-${Date.now()}-delivery`, caseId: current.caseId, type: 'Correspondence', title: `Resolve failed delivery: ${current.subject}`, ownerName: DEMO_USERS['Supervisor / QC'], ownerRole: 'Supervisor / QC', status: TASK_STATUS.OPEN, dueDate: null, createdAt: now, linkedRef: id }, ...state.tasks],
        audit: [audit({ caseId: current.caseId, action: 'Delivery failure escalated', detail: `${current.type}, attempt ${last.attempt}: ${note}`, reason: note }), ...state.audit],
      });
      return true;
    },
    decideClarificationHold(roundId, input) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      const caseRecord = round && state.cases.find(record => record.id === round.caseId);
      const notice = round?.noticeId ? state.correspondence.find(item => item.id === round.noticeId) : undefined;
      if (!round || !caseRecord || round.holdDecision || notice?.status !== CORRESPONDENCE_STATUS.SENT || !can(state.ui.roleView, 'manageClock') || !input.reason.trim()) return false;
      const now = new Date().toISOString();
      const by = DEMO_USERS[state.ui.roleView];
      const alreadyHeld = caseRecord.clock.state === 'Hold recorded';
      if (input.applies && !alreadyHeld && !input.effectiveDate) return false;
      if (!input.applies && alreadyHeld && clarificationHoldActive(caseRecord) && !input.effectiveDate) return false;
      let clockEvent: ClockEvent | undefined;
      let clock = caseRecord.clock;
      let outcome: string;
      if (input.applies && !alreadyHeld) {
        clock = { state: 'Hold recorded', holdType: HOLD_TYPE.CLARIFICATION, holdSince: input.effectiveDate, stateBeforeHold: caseRecord.clock.state, clarificationRoundId: roundId };
        clockEvent = { id: `clock-${Date.now()}-hold`, caseId: round.caseId, kind: CLOCK_EVENT_KIND.HOLD_RECORDED, holdType: HOLD_TYPE.CLARIFICATION, reason: input.reason, effectiveDate: input.effectiveDate!, authorisedBy: by, authorisedRole: state.ui.roleView, ruleStatus: 'Rule pending counsel/SME approval', recordedAt: now, previousState: caseRecord.clock.state, resultingState: 'Hold recorded', reference: [input.reference, input.authorisation && `Authorisation: ${input.authorisation}`].filter(Boolean).join(' · ') || undefined, clarificationRoundId: roundId };
        outcome = 'Hold applied';
      } else if (input.applies) {
        outcome = `Existing hold continues (recorded since ${caseRecord.clock.holdSince || 'unknown date'})`;
      } else if (alreadyHeld && clarificationHoldActive(caseRecord)) {
        const resumed = caseRecord.clock.stateBeforeHold || (caseRecord.dueDate || caseRecord.controllingDate ? 'Recorded' : 'Not established');
        clock = { state: resumed };
        clockEvent = { id: `clock-${Date.now()}-resume`, caseId: round.caseId, kind: CLOCK_EVENT_KIND.HOLD_ENDED, holdType: HOLD_TYPE.CLARIFICATION, reason: input.reason, effectiveDate: input.effectiveDate!, authorisedBy: by, authorisedRole: state.ui.roleView, ruleStatus: 'Rule pending counsel/SME approval', recordedAt: now, previousState: 'Hold recorded', resultingState: resumed, reference: input.reference || undefined, clarificationRoundId: roundId };
        outcome = 'No hold – earlier clarification hold ended';
      } else {
        outcome = 'No hold – response tracking continues without a hold';
      }
      replace({
        ...state,
        cases: clockEvent ? state.cases.map(record => record.id === round.caseId ? { ...record, clock } : record) : state.cases,
        clockEvents: clockEvent ? [clockEvent, ...state.clockEvents] : state.clockEvents,
        clarificationRounds: state.clarificationRounds.map(item => item.id === roundId ? { ...item, status: item.status === CLARIFICATION_STATUS.PREPARING_NOTICE ? CLARIFICATION_STATUS.AWAITING_RESPONSE : item.status, holdDecision: { applies: input.applies, outcome, reason: input.reason, effectiveDate: input.effectiveDate, reference: input.reference, authorisation: input.authorisation, by, role: state.ui.roleView, at: now, clockEventId: clockEvent?.id } } : item),
        audit: [
          ...(clockEvent ? [audit({ caseId: round.caseId, action: clockEvent.kind === CLOCK_EVENT_KIND.HOLD_RECORDED ? 'Clock hold applied' : 'Clock resumed', detail: `Effective ${clockEvent.effectiveDate}. ${input.reason} Clock: ${clockEvent.previousState} → ${clockEvent.resultingState}. No deadline was recalculated (rule pending agency approval).`, from: clockEvent.previousState, to: clockEvent.resultingState, reason: input.reason })] : []),
          audit({ caseId: round.caseId, action: 'Clock-hold decision', detail: `Round ${round.round}: ${input.applies ? 'Yes' : 'No'} – ${outcome}. ${input.reason}`, reason: input.reason }),
          ...state.audit,
        ],
      });
      return true;
    },
    setClarificationResponseDue(roundId, date, basis) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      if (!round || !date || !basis.trim() || !can(state.ui.roleView, 'manageClarification')) return false;
      replace({
        ...state,
        clarificationRounds: state.clarificationRounds.map(item => item.id === roundId ? { ...item, responseDue: { date, basis, by: DEMO_USERS[state.ui.roleView], at: new Date().toISOString() } } : item),
        audit: [audit({ caseId: round.caseId, action: 'Response due date recorded', detail: `Round ${round.round}: ${date}. Basis: ${basis}. Entered by user – not calculated.${round.responseDue ? ` Previous: ${round.responseDue.date}.` : ''}` }), ...state.audit],
      });
      return true;
    },
    recordClarificationReminder(roundId, input) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      if (!round || !input.date || !input.method.trim() || !can(state.ui.roleView, 'manageClarification')) return false;
      replace({
        ...state,
        clarificationRounds: state.clarificationRounds.map(item => item.id === roundId ? { ...item, reminders: [...item.reminders, { id: `reminder-${Date.now()}`, ...input, by: DEMO_USERS[state.ui.roleView], at: new Date().toISOString() }] } : item),
        audit: [audit({ caseId: round.caseId, action: 'Reminder recorded', detail: `Round ${round.round}: reminder made ${input.date} by ${input.method} outside this system. ${input.note}`.trim() }), ...state.audit],
      });
      return true;
    },
    recordClarificationResponse(roundId, input) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      if (!round || round.status !== CLARIFICATION_STATUS.AWAITING_RESPONSE || !round.holdDecision || !input.receivedDate || !can(state.ui.roleView, 'manageClarification')) return false;
      if (!input.correspondenceId && !input.summary.trim()) return false;
      const now = new Date().toISOString();
      const documents: Document[] = input.files.map((file, index) => ({
        id: `document-${Date.now()}-clarification-${index}`, caseId: round.caseId, name: file.name, sizeKb: file.sizeKb, mime: file.mime,
        source: 'Requester-supplied', classification: DOC_CLASSIFICATION.SOURCE, version: 1, accessClass: ACCESS_CLASS.INTERNAL,
        uploadStatus: UPLOAD_STATUS.UPLOADED, pageCount: 0, createdAt: now, createdBy: DEMO_USERS[state.ui.roleView],
      }));
      const inbound: Correspondence[] = input.correspondenceId ? [] : [{
        id: `correspondence-${Date.now()}-clarification-reply`, caseId: round.caseId, type: CORRESPONDENCE_TYPE.REQUESTER_REPLY, templateId: '',
        subject: `Requester clarification response - ${round.caseId} (round ${round.round})`, body: input.summary, direction: 'Inbound',
        status: CORRESPONDENCE_STATUS.SENT, requesterVisible: true, createdBy: DEMO_USERS[state.ui.roleView], createdAt: now,
        sentAt: `${input.receivedDate}T12:00:00.000Z`, clarificationRoundId: roundId,
      }];
      const holdEnd = state.clockEvents.filter(event => event.caseId === round.caseId && event.kind === CLOCK_EVENT_KIND.HOLD_ENDED && event.clarificationRoundId === roundId).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
      const late = lateResponse(round, input.receivedDate, holdEnd?.effectiveDate);
      const correspondenceId = input.correspondenceId || inbound[0].id;
      replace({
        ...state,
        correspondence: [...inbound, ...state.correspondence.map(item => item.id === input.correspondenceId ? { ...item, clarificationRoundId: roundId } : item)],
        documents: [...documents, ...state.documents],
        clarificationRounds: state.clarificationRounds.map(item => item.id === roundId ? { ...item, status: CLARIFICATION_STATUS.REVIEWING_RESPONSE, response: { receivedDate: input.receivedDate, correspondenceId, reference: input.reference, summary: input.summary, recordedBy: DEMO_USERS[state.ui.roleView], recordedAt: now, late: late.late, lateBasis: late.basis } } : item),
        audit: [audit({ caseId: round.caseId, action: 'Response received', detail: `Round ${round.round}: requester response received ${input.receivedDate}${input.reference ? ` (ref. ${input.reference})` : ''}; ${documents.length} attachment(s).${late.late ? ` Late: ${late.basis}` : ''} Clock not changed.` }), ...state.audit],
      });
      return true;
    },
    reviewClarificationResponse(roundId, input) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      const caseRecord = round && state.cases.find(record => record.id === round.caseId);
      if (!round || !caseRecord || round.status !== CLARIFICATION_STATUS.REVIEWING_RESPONSE || !round.response || !input.rationale.trim() || !can(state.ui.roleView, 'manageClarification')) return false;
      const further = input.outcome === CLARIFICATION_REVIEW.FURTHER;
      if (!further && !input.scope?.scope.trim()) return false;
      if (round.response.late && (!input.lateClock?.decision || !input.lateClock.rationale.trim())) return false;
      const now = new Date().toISOString();
      const by = DEMO_USERS[state.ui.roleView];
      const role = state.ui.roleView;
      const scopeUpdate: ScopeUpdate | undefined = further ? undefined : { scope: input.scope!.scope, changeSummary: input.scope!.changeSummary, remainingAmbiguity: input.remainingItems, reason: input.rationale, sourceRef: `Requester response received ${round.response.receivedDate}${round.response.reference ? ` (ref. ${round.response.reference})` : ''}`, by, role, at: now };
      const nextRoundId = `clarification-${round.caseId}-${round.round + 1}-${Date.now()}`;
      const followTask: Task | undefined = further ? { id: `task-${Date.now()}-clarification-next`, caseId: round.caseId, type: 'Clarification', title: `Prepare further clarification (round ${round.round + 1})`, ownerName: by, ownerRole: role, status: TASK_STATUS.OPEN, dueDate: null, createdAt: now } : undefined;
      const nextRound: ClarificationRound[] = further ? [{
        id: nextRoundId, caseId: round.caseId, round: round.round + 1, entryPoint: CLARIFICATION_ENTRY.PROCESSING, previousRoundId: round.id,
        status: CLARIFICATION_STATUS.ASSESSMENT, startedAt: now, startedBy: by,
        details: { ...emptyDetails(`Further clarification after round ${round.round}: ${input.rationale}`), ambiguity: input.remainingItems },
        assessments: [], reminders: [], noResponseDecisions: [], taskId: followTask!.id,
      }] : [];
      replace({
        ...state,
        clarificationRounds: [...nextRound, ...state.clarificationRounds.map(item => item.id === roundId ? {
          ...item, status: further ? CLARIFICATION_STATUS.FURTHER : CLARIFICATION_STATUS.OUTCOME_RECORDED,
          review: { outcome: input.outcome, resolvedItems: input.resolvedItems, remainingItems: input.remainingItems, rationale: input.rationale, by, role, at: now },
          lateClockDecision: input.lateClock ? { ...input.lateClock, by, at: now } : item.lateClockDecision,
          scopeUpdate: scopeUpdate ?? item.scopeUpdate,
        } : item)],
        tasks: [...(followTask ? [followTask] : []), ...state.tasks.map(task => further && task.id === round.taskId && openTaskStatus(task.status) ? { ...task, status: TASK_STATUS.DONE, completedAt: now } : task)],
        audit: [
          ...(further ? [audit({ caseId: round.caseId, action: 'Further clarification initiated', detail: `Round ${round.round + 1} opened. Remaining issue: ${input.remainingItems}. Round ${round.round} records are kept.${clarificationHoldActive(caseRecord) ? ' Existing clock hold continues until a decision is recorded.' : ''}` })] : []),
          ...(scopeUpdate ? [audit({ caseId: round.caseId, action: 'Request scope updated', detail: `Clarified scope recorded separately; original request text unchanged. Scope: ${scopeUpdate.scope}. Change: ${scopeUpdate.changeSummary || 'Not described'}.${scopeUpdate.remainingAmbiguity ? ` Remaining: ${scopeUpdate.remainingAmbiguity}.` : ''}` })] : []),
          ...(input.outcome === CLARIFICATION_REVIEW.PROCEED_AVAILABLE ? [audit({ caseId: round.caseId, action: 'Decision to proceed with available scope', detail: input.rationale, reason: input.rationale })] : []),
          ...(input.outcome === CLARIFICATION_REVIEW.PARTIAL ? [audit({ caseId: round.caseId, action: 'Partial-response decision', detail: `Resolved: ${input.resolvedItems || 'Not stated'}. Remaining: ${input.remainingItems || 'Not stated'}. Sufficient to proceed.` })] : []),
          ...(input.lateClock ? [audit({ caseId: round.caseId, action: 'Late-response clock decision', detail: `${input.lateClock.decision}${input.lateClock.effectiveDate ? `, effective ${input.lateClock.effectiveDate}` : ''}. ${input.lateClock.rationale} No deadline was recalculated.`, reason: input.lateClock.rationale })] : []),
          audit({ caseId: round.caseId, action: 'Response reviewed', detail: `Round ${round.round}: ${input.outcome}. ${input.rationale}`, reason: input.rationale }),
          ...state.audit,
        ],
      });
      return true;
    },
    recordNoResponseDecision(roundId, input) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      const caseRecord = round && state.cases.find(record => record.id === round.caseId);
      if (!round || !caseRecord || round.status !== CLARIFICATION_STATUS.AWAITING_RESPONSE || !input.rationale.trim() || !can(state.ui.roleView, 'manageClarification')) return false;
      const proceed = input.outcome === NO_RESPONSE_OUTCOME.PROCEED_AVAILABLE;
      if (proceed && !input.scope?.trim()) return false;
      const closure = input.outcome === NO_RESPONSE_OUTCOME.CLOSE || input.outcome === NO_RESPONSE_OUTCOME.WITHDRAWAL;
      const now = new Date().toISOString();
      const by = DEMO_USERS[state.ui.roleView];
      const closureRequest: ClosureRequest[] = closure ? [{ id: `closure-${Date.now()}`, caseId: round.caseId, kind: input.outcome === NO_RESPONSE_OUTCOME.CLOSE ? CLOSURE_KIND.NO_RESPONSE : CLOSURE_KIND.WITHDRAWN, reason: `Clarification round ${round.round}: ${input.rationale}`, requestedBy: by, status: CLOSURE_STATUS.PENDING }] : [];
      replace({
        ...state,
        closureRequests: [...closureRequest, ...state.closureRequests],
        clarificationRounds: state.clarificationRounds.map(item => item.id === roundId ? {
          ...item, status: proceed ? CLARIFICATION_STATUS.OUTCOME_RECORDED : item.status,
          noResponseDecisions: [...item.noResponseDecisions, { outcome: input.outcome, rationale: input.rationale, by, role: state.ui.roleView, at: now }],
          scopeUpdate: proceed ? { scope: input.scope!, changeSummary: 'No requester response; processing the available scope.', remainingAmbiguity: input.remainingAmbiguity || item.details.ambiguity, reason: input.rationale, sourceRef: 'No-response decision', by, role: state.ui.roleView, at: now } : item.scopeUpdate,
        } : item),
        audit: [
          ...(closure ? [audit({ caseId: round.caseId, action: 'Closure requested', detail: `${closureRequest[0].kind}: ${closureRequest[0].reason}. Requires approval; the case is not closed automatically.`, reason: input.rationale })] : []),
          ...(proceed ? [audit({ caseId: round.caseId, action: 'Decision to proceed with available scope', detail: `No response. Scope: ${input.scope}. Remaining: ${input.remainingAmbiguity || item0(round)}.`, reason: input.rationale })] : []),
          audit({ caseId: round.caseId, action: 'No-response decision', detail: `Round ${round.round}: ${input.outcome}. ${input.rationale} Clock not changed.`, reason: input.rationale }),
          ...state.audit,
        ],
      });
      return true;
    },
    resumeClock(caseId, input) {
      const caseRecord = state.cases.find(record => record.id === caseId);
      if (!caseRecord || !can(state.ui.roleView, 'manageClock') || !input.effectiveDate || !input.reason.trim()) return false;
      if (caseRecord.clock.state !== 'Hold recorded') {
        dispatch({ type: 'message', message: 'The clock is not on hold, so no resume event was recorded.' });
        return false;
      }
      if (caseRecord.clock.holdSince && input.effectiveDate < caseRecord.clock.holdSince) {
        dispatch({ type: 'message', message: `The resume date cannot be before the hold date (${caseRecord.clock.holdSince}).` });
        return false;
      }
      const now = new Date().toISOString();
      const resumed = caseRecord.clock.stateBeforeHold || (caseRecord.dueDate || caseRecord.controllingDate ? 'Recorded' : 'Not established');
      const round = activeRound(state.clarificationRounds, caseId);
      const linkRound = round && clarificationHoldActive(caseRecord) ? round : undefined;
      const event: ClockEvent = { id: `clock-${Date.now()}-resume`, caseId, kind: CLOCK_EVENT_KIND.HOLD_ENDED, holdType: caseRecord.clock.holdType as ClockEvent['holdType'], reason: input.reason, effectiveDate: input.effectiveDate, authorisedBy: DEMO_USERS[state.ui.roleView], authorisedRole: state.ui.roleView, ruleStatus: 'Rule pending counsel/SME approval', recordedAt: now, previousState: `Hold recorded (${caseRecord.clock.holdType || 'type not recorded'} since ${caseRecord.clock.holdSince || 'unknown'})`, resultingState: resumed, reference: input.reference || undefined, clarificationRoundId: linkRound?.id };
      replace({
        ...state,
        cases: state.cases.map(record => record.id === caseId ? { ...record, clock: { state: resumed } } : record),
        clockEvents: [event, ...state.clockEvents],
        clarificationRounds: linkRound ? state.clarificationRounds.map(item => item.id === linkRound.id ? { ...item, resumeEventId: event.id } : item) : state.clarificationRounds,
        audit: [audit({ caseId, action: 'Clock resumed', detail: `Hold ended effective ${input.effectiveDate}. ${input.reason} Clock: Hold recorded → ${resumed}. No deadline was recalculated (rule pending agency approval).`, from: 'Hold recorded', to: resumed, reason: input.reason }), ...state.audit],
      });
      return true;
    },
    completeClarification(roundId, next) {
      const round = state.clarificationRounds.find(item => item.id === roundId);
      const caseRecord = round && state.cases.find(record => record.id === round.caseId);
      if (!round || !caseRecord || round.status !== CLARIFICATION_STATUS.OUTCOME_RECORDED || !next.trim() || !can(state.ui.roleView, 'manageClarification')) return false;
      if (clarificationHoldActive(caseRecord)) {
        dispatch({ type: 'message', message: 'Resume the clarification hold before completing the clarification.' });
        return false;
      }
      const now = new Date().toISOString();
      const by = DEMO_USERS[state.ui.roleView];
      replace({
        ...state,
        clarificationRounds: state.clarificationRounds.map(item => item.id === roundId ? { ...item, status: CLARIFICATION_STATUS.COMPLETED, completion: { nextAction: next, by, role: state.ui.roleView, at: now } } : item),
        cases: state.cases.map(record => record.id === round.caseId ? { ...record, needsClarification: false } : record),
        tasks: [{ id: `task-${Date.now()}-after-clarification`, caseId: round.caseId, type: 'Next action', title: next, ownerName: caseRecord.processor === 'Unassigned' ? by : caseRecord.processor, ownerRole: 'Processor', status: TASK_STATUS.OPEN, dueDate: null, createdAt: now }, ...state.tasks.map(task => task.caseId === round.caseId && task.type === 'Clarification' && openTaskStatus(task.status) ? { ...task, status: TASK_STATUS.DONE, completedAt: now } : task)],
        audit: [audit({ caseId: round.caseId, action: 'Clarification completed', detail: `Round ${round.round}: ${round.review?.outcome || round.noResponseDecisions.at(-1)?.outcome || 'Outcome recorded'}. Next action: ${next}. Case status unchanged: ${caseRecord.status}.` }), ...state.audit],
      });
      return true;
    },
    clearMessage() {
      dispatch({ type: 'message', message: undefined });
    },
  }), [state]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used within StoreProvider');
  return value;
}
