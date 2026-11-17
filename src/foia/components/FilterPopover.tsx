import { useEffect, useRef, useState } from 'react';

export type FilterCategory = { id: string; label: string; options: { value: string; label?: string }[] };
export type FilterSelections = Record<string, string[]>;

export const countSelections = (s: FilterSelections) => Object.values(s).reduce((n, v) => n + v.length, 0);
export const matches = (s: FilterSelections, id: string, value: string) => !s[id]?.length || s[id].includes(value);

/** Reusable two-panel filter: categories on the left, checkbox values on the right. Pending changes apply only on "Apply Filters". */
export function FilterPopover({ categories, applied, onApply }: { categories: FilterCategory[]; applied: FilterSelections; onApply: (next: FilterSelections) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(categories[0]?.id);
  const [pending, setPending] = useState<FilterSelections>(applied);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setPending(applied); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const count = countSelections(applied);
  const category = categories.find(c => c.id === active) || categories[0];
  const toggle = (id: string, value: string) => setPending(p => { const cur = p[id] || []; return { ...p, [id]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] }; });
  return <div className="filter-popover-wrap" ref={ref}>
    <button type="button" className={`filter-trigger ${count ? 'is-active' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z"/></svg>
      Filter{count > 0 && <span className="filter-count" aria-label={`${count} filters applied`}>{count}</span>}
    </button>
    {open && <div className="filter-popover" role="dialog" aria-label="Filters">
      <div className="filter-popover-body">
        <ul className="filter-categories" role="tablist" aria-orientation="vertical">
          {categories.map(c => { const n = pending[c.id]?.length || 0; return <li key={c.id}><button type="button" role="tab" aria-selected={c.id === category?.id} className={c.id === category?.id ? 'active' : ''} onClick={() => setActive(c.id)}><span>{c.label}</span>{n > 0 && <span className="filter-count">{n}</span>}</button></li>; })}
        </ul>
        <div className="filter-values" role="tabpanel" aria-label={category?.label}>
          {category?.options.length ? category.options.map(o => <label key={o.value} className="filter-value"><input type="checkbox" checked={pending[category.id]?.includes(o.value) || false} onChange={() => toggle(category.id, o.value)}/><span>{o.label || o.value}</span></label>) : <p className="filter-empty">No values available.</p>}
        </div>
      </div>
      <div className="filter-popover-footer">
        <button type="button" className="button button--secondary" onClick={() => { setPending({}); onApply({}); setOpen(false); }}>Clear Filters</button>
        <button type="button" className="button button--primary" onClick={() => { onApply(pending); setOpen(false); }}>Apply Filters</button>
      </div>
    </div>}
  </div>;
}

/** Contextual row menu anchored to its trigger; uses fixed positioning so table scroll containers don't clip it. */
export function RowMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void }[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    menu.current?.querySelector<HTMLElement>('button')?.focus();
    const close = (e: Event) => { if (e.type === 'mousedown' && (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return; setPos(null); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPos(null); btn.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = [...(menu.current?.querySelectorAll<HTMLElement>('button') || [])];
        const i = list.indexOf(document.activeElement as HTMLElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    document.addEventListener('mousedown', close); window.addEventListener('scroll', close, true); window.addEventListener('resize', close); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); document.removeEventListener('keydown', onKey); };
  }, [pos]);
  return <>
    <button ref={btn} type="button" className="row-action" aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(pos)} onClick={e => { e.stopPropagation(); if (pos) return setPos(null); const r = btn.current!.getBoundingClientRect(); setPos({ top: r.bottom + 4, right: window.innerWidth - r.right }); }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
    </button>
    {pos && <div ref={menu} className="row-menu" role="menu" style={{ top: pos.top, right: pos.right }}>
      {items.map(i => <button key={i.label} type="button" role="menuitem" onClick={() => { setPos(null); i.onSelect(); }}>{i.label}</button>)}
    </div>}
  </>;
}
