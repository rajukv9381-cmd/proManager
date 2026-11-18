import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Navigate, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api } from './api.js';
import FeatureErrorBoundary from './components/FeatureErrorBoundary.jsx';
import { selectProject } from './features/projects/projectSlice.js';
import { projectsKey, projectsQueryOptions } from './features/projects/projectsQuery.js';
import { store } from './store.js';
import { initials } from './utils/initials.js';
import './styles.css';

const ProjectOverview = lazy(() => import('./features/projects/ProjectOverview.jsx'));
const TaskBoard = lazy(() => import('./features/tasks/TaskBoard.jsx'));
const TeamChat = lazy(() => import('./features/chat/TeamChat.jsx'));
const Documents = lazy(() => import('./features/documents/Documents.jsx'));

const queryClient = new QueryClient();

function Auth({ onLogin }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      onLogin(await api(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: form }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="auth-page">
    <div className="auth-intro">
      <div className="brand light"><span className="brand-icon">P</span> ProManage</div>
      <div><span className="eyebrow">YOUR WORK, IN SYNC</span><h1>Make great work happen, together.</h1><p>Bring your projects, conversations, and team together in one clear workspace.</p></div>
      <p className="auth-foot">A little more focus. A lot more progress.</p>
    </div>
    <div className="auth-side"><div className="auth-card">
      <span className="eyebrow purple">WELCOME TO PROMANAGE</span>
      <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
      <p className="muted">{register ? 'Start bringing your team together.' : 'Sign in to pick up where you left off.'}</p>
      {error && <div className="alert" role="alert">{error}</div>}
      <form onSubmit={submit} className="stack">
        {register && <label>Full name<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>}
        <label>Email address<input required type="email" maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" /></label>
        <label>Password<input required type="password" minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></label>
        <button disabled={busy} className="primary">{busy ? 'Please wait...' : register ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">{register ? 'Already have an account?' : 'New to ProManage?'} <button className="link" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</button></p>
    </div></div>
  </div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const signingOut = useRef(false);
  const routeMatch = matchPath('/projects/:projectId', location.pathname);
  const routeId = routeMatch && /^[1-9]\d*$/.test(routeMatch.params.projectId) && Number(routeMatch.params.projectId) <= 2147483647
    ? Number(routeMatch.params.projectId) : null;
  const isProjectRoute = location.pathname === '/projects' || Boolean(routeId);
  const projectId = useSelector(state => state.project.selectedId);
  const [project, setProject] = useState(null);
  const [projectError, setProjectError] = useState('');
  const [view, setView] = useState('overview');
  const [error, setError] = useState('');
  const [newProject, setNewProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [editing, setEditing] = useState(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api('/api/auth/me').then(setUser).catch(err => { if (err.status !== 401) setError(err.message); }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const handleExpired = () => {
      if (!user || signingOut.current) return;
      queryClient.clear();
      dispatch(selectProject(null));
      setProject(null);
      setUser(null);
      setError('Your session expired. Please sign in again.');
      navigate('/login', { replace: true });
    };
    window.addEventListener('session:expired', handleExpired);
    return () => window.removeEventListener('session:expired', handleExpired);
  }, [user, queryClient, dispatch, navigate]);
  useEffect(() => {
    if (user && isProjectRoute && projectId !== routeId) {
      dispatch(selectProject(routeId));
      setView('overview');
      setEditing(null);
    }
  }, [user, isProjectRoute, projectId, routeId, dispatch]);
  const projectsQuery = useQuery(projectsQueryOptions(user?.id));
  const projects = projectsQuery.data || [];
  const loadProjects = useCallback(() => queryClient.invalidateQueries(
    { queryKey: projectsKey(user?.id) },
    { throwOnError: true }
  ), [queryClient, user?.id]);
  const loadProject = useCallback(async selectedId => {
    const result = await api(`/api/projects/${selectedId}`);
    setProject(current => Number(selectedId) === Number(current?.id) ? result : current);
  }, []);
  useEffect(() => {
    if (user && location.pathname === '/projects' && projectId === null && projects.length) {
      navigate(`/projects/${projects[0].id}`, { replace: true });
    }
  }, [user, location.pathname, projectId, projects, navigate]);
  useEffect(() => {
    if (!user || !projectId || projectId !== routeId || !isProjectRoute) return;
    let active = true;
    setProject(null);
    setProjectError('');
    const refresh = async () => {
      try {
        const [detail] = await Promise.all([api(`/api/projects/${projectId}`), loadProjects()]);
        if (active) setProject(detail);
      } catch (err) {
        if (active) {
          if (err.status === 404) setProjectError('Project not found or you do not have access.');
          else setError(err.message);
        }
      }
    };
    const socket = io();
    socket.on('connect', () => socket.emit('project:join', projectId, result => {
      if (!active) return;
      if (result?.error) setError(result.error);
      else refresh();
    }));
    socket.on('project:updated', refresh);
    const reconnectSession = async () => {
      try {
        await api('/api/auth/me');
        if (active && !signingOut.current) socket.connect();
      } catch (err) {
        if (active && !signingOut.current && err.status !== 401) setError(err.message);
      }
    };
    socket.on('disconnect', reason => {
      if (active && !signingOut.current && reason === 'io server disconnect') reconnectSession();
    });
    socket.on('connect_error', err => {
      if (!active || signingOut.current) return;
      if (err.message === 'Please sign in.') reconnectSession();
      else setError('Live updates are disconnected. Reconnecting...');
    });
    refresh();
    return () => { active = false; socket.disconnect(); };
  }, [user, projectId, routeId, isProjectRoute, loadProjects]);

  const run = async action => {
    setError('');
    try { await action(); } catch (err) { setError(err.message); }
  };
  const createProject = e => {
    e.preventDefault();
    run(async () => {
      const created = await api('/api/projects', { method: 'POST', body: projectForm });
      navigate(`/projects/${created.id}`);
      setProjectForm({ name: '', description: '' });
      setNewProject(false);
      setView('overview');
      await loadProjects();
    });
  };
  const saveTask = form => run(async () => {
    const endpoint = `/api/projects/${projectId}/tasks${editing?.id ? `/${editing.id}` : ''}`;
    await api(endpoint, { method: editing?.id ? 'PUT' : 'POST', body: form });
    setEditing(null);
    await loadProject(projectId);
    await loadProjects();
  });
  const addMember = e => {
    e.preventDefault();
    run(async () => {
      await api(`/api/projects/${projectId}/members`, { method: 'POST', body: { email: memberEmail } });
      setMemberEmail('');
      await loadProject(projectId);
    });
  };
  const sendMessage = e => {
    e.preventDefault();
    run(async () => {
      await api(`/api/projects/${projectId}/messages`, { method: 'POST', body: { body: message } });
      setMessage('');
      await loadProject(projectId);
    });
  };
  const uploadFile = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    run(async () => {
      const body = new FormData();
      body.append('file', file);
      await api(`/api/projects/${projectId}/documents`, { method: 'POST', body });
      await loadProject(projectId);
    });
  };
  const downloadFile = doc => run(async () => {
    const blob = await api(`/api/projects/${projectId}/documents/${doc.id}`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.original_name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const logout = () => run(async () => {
    signingOut.current = true;
    try {
      await api('/api/auth/logout', { method: 'POST' });
      await queryClient.cancelQueries();
      queryClient.clear();
      setUser(null); dispatch(selectProject(null)); setProject(null);
      navigate('/login', { replace: true });
    } finally {
      signingOut.current = false;
    }
  });
  if (loading) return <div className="loading">Loading your workspace...</div>;
  if (!user && location.pathname !== '/login') return <Navigate to="/login" replace state={{ from: isProjectRoute ? location.pathname : '/projects' }} />;
  if (!user) return <>{error && <div className="top-error" role="alert">{error}</div>}<Auth onLogin={loggedInUser => {
    setUser(loggedInUser);
    setError('');
    const from = location.state?.from;
    const safeFrom = typeof from === 'string' && (from === '/projects' || /^\/projects\/[1-9]\d*$/.test(from)) ? from : '/projects';
    navigate(safeFrom, { replace: true });
  }} /></>;
  if (location.pathname === '/login' || location.pathname === '/') return <Navigate to="/projects" replace />;
  if (!isProjectRoute) return <div className="loading"><h2>Page not found</h2><button className="link" onClick={() => navigate('/projects')}>Go to projects</button></div>;

  const tasks = project?.tasks || [];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">P</span> ProManage</div>
      <div className="sidebar-label">WORKSPACE</div>
      <div className="workspace-label"><span className="workspace-icon">W</span><span>My workspace<small>Team projects</small></span></div>
      <div className="sidebar-row"><span className="sidebar-label">PROJECTS</span><button className="icon-button" onClick={() => setNewProject(true)} aria-label="Create project">+</button></div>
      <nav className="project-list">{projects.map(item => <button key={item.id} className={`project-link ${projectId === item.id ? 'selected' : ''}`} onClick={() => navigate(`/projects/${item.id}`)}><span className="project-dot" />{item.name}</button>)}</nav>
      <button className="sidebar-create" onClick={() => setNewProject(true)}>+ Create project</button>
      <div className="sidebar-user"><span className="avatar">{initials(user.name)}</span><span className="user-info"><strong>{user.name}</strong><small>{user.email}</small></span><button className="link signout" onClick={logout}>Sign out</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><span>Workspace <span className="breadcrumb">/</span> <strong>{project?.name || 'Projects'}</strong></span><span className="top-user"><span className="avatar small">{initials(user.name)}</span> {user.name}</span></header>
      <div className="content">
        {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        {projectsQuery.isError && <div className="alert" role="alert">Could not load projects: {projectsQuery.error.message}<button className="link" onClick={() => projectsQuery.refetch()}>Retry</button></div>}
        {newProject && <form className="panel project-form stack" onSubmit={createProject}><div className="form-heading"><h3>Create a project</h3><button type="button" className="icon-button" onClick={() => setNewProject(false)} aria-label="Close">×</button></div><label>Project name<input required maxLength={120} value={projectForm.name} onChange={e => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="e.g. Website redesign" /></label><label>Description<textarea maxLength={2000} value={projectForm.description} onChange={e => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="What is this project about?" /></label><div className="form-actions"><button type="button" className="secondary" onClick={() => setNewProject(false)}>Cancel</button><button className="primary">Create project</button></div></form>}
        {projectId !== routeId ? <div className="loading">Loading project...</div> : !projectId && projectsQuery.isPending ? <div className="loading">Loading projects...</div> : !projectId && projectsQuery.isError && !projectsQuery.data ? null : !projectId ? <div className="empty-workspace"><div className="empty-icon">✦</div><h1>Good work starts here.</h1><p>Create your first project to organize tasks, bring your team together, and track progress.</p><button className="primary" onClick={() => setNewProject(true)}>+ Create your first project</button></div> : projectError ? <div className="alert" role="alert">{projectError}</div> : !project || project.id !== projectId ? <div className="loading">Loading project...</div> : <>
          <div className="page-heading"><div><div className="eyebrow purple">PROJECT WORKSPACE</div><h1>{project.name}</h1><p>{project.description || 'A place for your team to do their best work.'}</p></div><button className="primary" onClick={() => { setView('board'); setEditing({}); }}>+ New task</button></div>
          <div className="tabs">{[['overview', 'Overview'], ['board', 'Task board'], ['chat', 'Team chat'], ['files', 'Documents']].map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => { setView(key); setEditing(null); }}>{label}</button>)}</div>
          <FeatureErrorBoundary key={view}>
            <Suspense fallback={<div className="loading" role="status">Loading view...</div>}>
              {view === 'overview' && <ProjectOverview project={project} user={user} memberEmail={memberEmail} onMemberEmailChange={setMemberEmail} onAddMember={addMember} />}
              {view === 'board' && <TaskBoard key={projectId} tasks={tasks} members={project.members} editing={editing} onEdit={setEditing} onSave={saveTask} onCancel={() => setEditing(null)} />}
              {view === 'chat' && <TeamChat messages={project.messages} message={message} onMessageChange={setMessage} onSend={sendMessage} />}
              {view === 'files' && <Documents documents={project.documents} projectId={projectId} onUpload={uploadFile} onDownload={downloadFile} />}
            </Suspense>
          </FeatureErrorBoundary>
        </>}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(
  <Provider store={store}><QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></Provider>
);
