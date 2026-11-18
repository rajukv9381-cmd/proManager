import { useEffect, useMemo, useState } from 'react';
import TaskColumn from './TaskColumn.jsx';
import TaskForm from './TaskForm.jsx';
import { createSearchScheduler } from './searchScheduler.js';
import { taskStatuses } from './taskStatuses.js';

export default function TaskBoard({ tasks, members, editing, onEdit, onSave, onCancel }) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const scheduler = useMemo(() => createSearchScheduler(setAppliedSearch, 300), []);
  useEffect(() => () => scheduler.cancel(), [scheduler]);
  const query = appliedSearch.trim().toLowerCase();
  const filteredTasks = tasks.filter(task =>
    [task.title, task.description, task.assignee_name].some(value => value?.toLowerCase().includes(query))
  );

  return <>
    <div className="section-title task-board-heading"><div><h2>Task board</h2><p>Keep work moving from start to finish.</p></div>
      <label className="task-search">Search tasks<input type="search" value={search} onChange={e => { setSearch(e.target.value); scheduler.schedule(e.target.value); }} placeholder="Title, description or assignee" /></label>
    </div>
    {editing && <TaskForm key={editing.id || 'new'} task={editing.id ? editing : null} members={members} onSave={onSave} onCancel={onCancel} />}
    <div className="board">
      {taskStatuses.map(column => <TaskColumn key={column.key} column={column} tasks={filteredTasks.filter(task => task.status === column.key)} onEdit={onEdit} searching={Boolean(query)} />)}
    </div>
  </>;
}
