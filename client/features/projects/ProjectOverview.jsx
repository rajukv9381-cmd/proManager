import { taskStatuses } from '../tasks/taskStatuses.js';
import { initials } from '../../utils/initials.js';

export default function ProjectOverview({ project, user, memberEmail, onMemberEmailChange, onAddMember }) {
  const tasks = project.tasks;
  const done = tasks.filter(task => task.status === 'done').length;
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  return <>
    <div className="section-title"><div><h2>Project overview</h2><p>A quick look at how things are going.</p></div></div>
    <div className="stats">
      <div className="stat"><span>Total tasks</span><strong>{tasks.length}</strong><small>Across your project</small></div>
      <div className="stat"><span>In progress</span><strong>{tasks.filter(t => t.status === 'in_progress').length}</strong><small>Currently underway</small></div>
      <div className="stat"><span>Completed</span><strong>{done}</strong><small>Tasks finished</small></div>
      <div className="stat"><span>Team members</span><strong>{project.members.length}</strong><small>People collaborating</small></div>
    </div>
    <div className="overview-grid">
      <section className="panel"><div className="panel-heading"><div><h3>Project progress</h3><p>Every task gets you closer.</p></div><span className="progress-number">{progress}%</span></div><div className="progress"><div style={{ width: `${progress}%` }} /></div><div className="progress-caption">{done} of {tasks.length} tasks completed</div><div className="legend">{taskStatuses.map(c => <span key={c.key}><i className={`dot ${c.key}`} />{c.label} <strong>{tasks.filter(t => t.status === c.key).length}</strong></span>)}</div></section>
      <section className="panel"><div className="panel-heading"><div><h3>Project team</h3><p>The people behind the work.</p></div></div><div className="members">{project.members.map(m => <div className="member" key={m.id}><span className="avatar small">{initials(m.name)}</span><span><strong>{m.name}</strong><small>{m.email}</small></span>{m.id === project.owner_id && <span className="owner-tag">Owner</span>}</div>)}</div>{project.owner_id === user.id && <form className="inline-form" onSubmit={onAddMember}><input required type="email" placeholder="Member's registered email" value={memberEmail} onChange={e => onMemberEmailChange(e.target.value)} /><button className="secondary">Add</button></form>}</section>
    </div>
  </>;
}
