import { formatDate } from '../../utils/formatDate.js';

export default function TaskCard({ task, onEdit }) {
  return <button className="task-card" onClick={() => onEdit(task)}>
    <div className="task-top"><span className={`priority ${task.priority}`}>{task.priority}</span><span className="task-id">#{task.id}</span></div>
    <strong>{task.title}</strong>
    {task.description && <p>{task.description}</p>}
    <div className="task-bottom"><span>{task.assignee_name || 'Unassigned'}</span><span>{task.due_date ? formatDate(task.due_date) : 'No due date'}</span></div>
  </button>;
}
