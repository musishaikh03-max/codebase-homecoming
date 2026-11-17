import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { FilterPopover, matches, type FilterSelections } from '../components/FilterPopover';
import { ACCESS_CLASS, DOC_CLASSIFICATION } from '../types';

export default function RecordsWorklist({ onOpen }: { onOpen: (caseId: string, tab: string) => void }) {
  const { state } = useStore();
  const [caseId, setCaseId] = useState('');
  const [requester, setRequester] = useState('');
  const [f, setF] = useState<FilterSelections>({});
  const rows = useMemo(() => state.documents.filter(document => {
    const record = state.cases.find(item => item.id === document.caseId);
    return (!caseId || document.caseId.toLowerCase().includes(caseId.toLowerCase())) &&
      (!requester || record?.requester.toLowerCase().includes(requester.toLowerCase())) &&
      matches(f, 'classification', document.classification) && matches(f, 'source', document.source) && matches(f, 'access', document.accessClass);
  }), [state.documents, state.cases, caseId, requester, f]);
  return <>
    <header className="page-header"><div><h1>Records & Documents</h1><p>Cross-case document metadata and case-linked records.</p></div></header>
    <section className="document-filters worklist-filters">
      <label>Case ID<input value={caseId} onChange={event => setCaseId(event.target.value)} placeholder="Filter case ID"/></label>
      <label>Requester<input value={requester} onChange={event => setRequester(event.target.value)} placeholder="Filter requester"/></label>
      <FilterPopover applied={f} onApply={setF} categories={[
        { id: 'classification', label: 'Classification', options: Object.values(DOC_CLASSIFICATION).map(value => ({ value })) },
        { id: 'source', label: 'Source', options: [...new Set(state.documents.map(item => item.source))].map(value => ({ value })) },
        { id: 'access', label: 'Access class', options: Object.values(ACCESS_CLASS).map(value => ({ value })) },
      ]}/>
    </section>
    <section className="case-table-panel"><div className="table-scroll"><table className="management-table"><thead><tr><th>Document</th><th>Case ID</th><th>Requester</th><th>Classification</th><th>Source</th><th>Office</th><th>Version</th><th>Access</th></tr></thead><tbody>{rows.map(document => { const record = state.cases.find(item => item.id === document.caseId); return <tr key={document.id}><td>{document.name}</td><td><button className="link" onClick={() => onOpen(document.caseId, 'records-documents')}>{document.caseId}</button></td><td>{record?.requester || 'Case not found'}</td><td>{document.classification}</td><td>{document.source}</td><td>{document.office || 'Not specified'}</td><td>v{document.version}</td><td>{document.accessClass}</td></tr>; })}</tbody></table></div>{!rows.length && <div className="table-empty"><strong>No documents</strong><span>No document metadata matches these filters.</span></div>}</section>
  </>;
}
