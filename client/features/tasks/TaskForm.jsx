import { useState } from 'react';
import { taskStatuses } from './taskStatuses.js';

const initialTask = { title: '', description: '', status: 'todo', priority: 'medium', assignee_id: '', due_date: '' };

export default function TaskForm({ task, members, onSave, onCancel }) {
  const [form, setForm] = useState(task ? { ...task, assignee_id: task.assignee_id || '', due_date: task.due_date ? task.due_date.slice(0, 10) : '' } : initialTask);
  return <form className="task-form stack" onSubmit={e => { e.preventDefault(); onSave(form); }}>
    <div className="form-heading"><strong>{task ? 'Edit task' : 'New task'}</strong><button type="button" className="icon-button" onClick={onCancel} aria-label="Close">×</button></div>
    <label>Task title<input required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" /></label>
    <label>Description<textarea maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Add a little more detail" /></label>
    <div className="form-grid">
      <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{taskStatuses.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
      <label>Priority<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label>Assignee<select value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value })}><option value="">Unassigned</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label>Due date<input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></label>
    </div>
    <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary">Save task</button></div>
  </form>;
}
