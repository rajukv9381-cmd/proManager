import { formatDate } from '../../utils/formatDate.js';

export default function Documents({ documents, projectId, onUpload, onDownload }) {
  return <>
    <div className="section-title"><div><h2>Documents</h2><p>Keep important files in one place.</p></div><label className="primary upload-button">+ Upload file<input type="file" onChange={onUpload} /></label></div>
    <section className="panel">{documents.length ? <div className="documents">{documents.map(doc => <div className="document" key={doc.id}><span className="file-icon">▤</span><span className="document-info"><strong>{doc.original_name}</strong><small>Added by {doc.author_name} · {formatDate(doc.created_at)} · {(doc.size / 1024).toFixed(1)} KB</small></span><a className="secondary download" href={`/api/projects/${projectId}/documents/${doc.id}`} onClick={e => { e.preventDefault(); onDownload(doc); }}>Download</a></div>)}</div> : <div className="empty-state">No documents yet. Upload a file to share it with your team.<br /><small>Maximum file size: 10 MB</small></div>}</section>
  </>;
}
