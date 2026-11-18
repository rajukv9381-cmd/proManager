import TaskCard from './TaskCard.jsx';

export default function TaskColumn({ column, tasks, onEdit, searching }) {
  return <section className="board-column">
    <div className="column-heading"><span><i className={`dot ${column.key}`} />{column.label}</span><span className="count">{tasks.length}</span></div>
    {tasks.map(task => <TaskCard key={task.id} task={task} onEdit={onEdit} />)}
    {!tasks.length && <div className="column-empty">{searching ? 'No matching tasks' : 'No tasks yet'}</div>}
  </section>;
}
