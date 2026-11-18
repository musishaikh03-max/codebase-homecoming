import { ReactNode, useEffect } from 'react';
import { RFD, Task, TASK_STATUS } from '../types';

/** Navigate to another case workspace tab via the existing hash routes. */
export function goToTab(caseId: string, tab: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  ['rfd', 'view', 'create', 'focus'].forEach(key => params.delete(key));
  params.set('id', caseId);
  params.set('tab', tab.toLowerCase().replaceAll(' & ', '-').replaceAll(' ', '-'));
  Object.entries(extra).forEach(([key, value]) => params.set(key, value));
  window.location.hash = `#/case-detail?${params.toString()}`;
}

export const hashParam = (key: string) => new URLSearchParams(window.location.hash.split('?')[1] || '').get(key);

/** Stable, human-readable RFD numbers per case, in creation order. */
export function rfdLabels(rfds: RFD[]) {
  const ordered = [...rfds].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return new Map(ordered.map((rfd, index) => [rfd.id, `RFD-${String(index + 1).padStart(3, '0')}`]));
}

export const isOpen = (task: Task) => task.status !== TASK_STATUS.DONE && task.status !== TASK_STATUS.CANCELLED;

export const fmt = (date?: string | null) => date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';

export const slug = (value: string) => value.toLowerCase().replace(/[^a-z]+/g, '-');

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="cw-drawer-backdrop" onClick={onClose}>
    <aside className="cw-drawer" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <header><h2>{title}</h2><button className="cw-icon-btn" aria-label="Close" onClick={onClose}>×</button></header>
      <div className="cw-drawer-body">{children}</div>
    </aside>
  </div>;
}

export interface AssistItem { text: string; action?: { label: string; onClick: () => void } }

/** Rule-based checks over the case's own recorded data. No AI service is connected. */
export function AssistPanel({ caseId, context, attention, nextSteps, onAsk }: { caseId: string; context?: string; attention: AssistItem[]; nextSteps: AssistItem[]; onAsk: () => void }) {
  return <aside className="cw-assist" aria-label={`Case Assist for ${caseId}`}>
    <div className="cw-assist-head"><h2>Case Assist</h2><span className="cw-chip">{caseId}</span></div>
    <p className="cw-muted">{context ? `${context}: ` : ''}checks based only on this case's recorded data in this browser. Not AI analysis.</p>
    <section className={`cw-assist-block ${attention.length ? 'cw-assist-block--warn' : ''}`}>
      <h3>Needs attention ({attention.length})</h3>
      {attention.length ? <ul>{attention.map(item => <li key={item.text}>{item.text}{item.action && <button className="link" onClick={item.action.onClick}>{item.action.label} →</button>}</li>)}</ul> : <p className="cw-muted">Nothing flagged in the recorded data.</p>}
    </section>
    <section className="cw-assist-block">
      <h3>Suggested next steps</h3>
      {nextSteps.length ? <ol>{nextSteps.map(item => <li key={item.text}><span>{item.text}</span>{item.action && <button className="link" onClick={item.action.onClick}>{item.action.label} →</button>}</li>)}</ol> : <p className="cw-muted">No suggested steps from the recorded data.</p>}
      <p className="cw-fine">Suggestions only. Nothing is sent, approved or recorded without your confirmation.</p>
    </section>
    <button className="cw-assist-ask" onClick={onAsk}>Ask Case Assist <span aria-hidden="true">›</span></button>
  </aside>;
}

export function Stat({ value, label }: { value: number | string; label: string }) {
  return <div className="cw-stat"><strong>{value}</strong><span>{label}</span></div>;
}
