import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { projectsKey, projectsQueryOptions } from '../client/features/projects/projectsQuery.js';

test('project query refetches invalidated data and isolates user caches', async () => {
  const originalFetch = globalThis.fetch;
  const client = new QueryClient();
  let projects = [{ id: 1, name: 'First project' }];
  globalThis.fetch = async () => new Response(JSON.stringify(projects), { headers: { 'Content-Type': 'application/json' } });
  const observer = new QueryObserver(client, projectsQueryOptions(1));
  const unsubscribe = observer.subscribe(() => {});
  try {
    const first = await observer.refetch();
    assert.equal(first.data[0].name, 'First project');
    projects = [{ id: 2, name: 'New project' }];
    await client.invalidateQueries({ queryKey: projectsKey(1) }, { throwOnError: true });
    assert.equal(client.getQueryData(projectsKey(1))[0].name, 'New project');
    assert.equal(client.getQueryData(projectsKey(2)), undefined);
    observer.setOptions(projectsQueryOptions(2));
    const second = await observer.refetch();
    assert.equal(second.data[0].name, 'New project');
    client.clear();
    assert.equal(client.getQueryData(projectsKey(1)), undefined);
    assert.equal(client.getQueryData(projectsKey(2)), undefined);
  } finally {
    unsubscribe();
    client.clear();
    globalThis.fetch = originalFetch;
  }
});

test('project query exposes API failures instead of an empty project list', async () => {
  const originalFetch = globalThis.fetch;
  const client = new QueryClient();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Database unavailable' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
  try {
    await assert.rejects(client.fetchQuery(projectsQueryOptions(1)), /Database unavailable/);
    assert.equal(client.getQueryData(projectsKey(1)), undefined);
  } finally {
    client.clear();
    globalThis.fetch = originalFetch;
  }
});
