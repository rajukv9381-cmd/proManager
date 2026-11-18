import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../client/api.js';

test('concurrent unauthorized requests share one refresh and retry', async () => {
  const originalFetch = globalThis.fetch;
  let refreshed = false;
  let refreshes = 0;
  let requests = 0;
  globalThis.fetch = async url => {
    if (url === '/api/auth/refresh') {
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 20));
      refreshed = true;
      return new Response(null, { status: 204 });
    }
    requests++;
    return refreshed
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify({ error: 'Please sign in.' }), { status: 401 });
  };
  try {
    const results = await Promise.all([api('/api/projects'), api('/api/projects/1')]);
    assert.deepEqual(results, [{ ok: true }, { ok: true }]);
    assert.equal(refreshes, 1);
    assert.equal(requests, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('failed refresh is surfaced and is not retried indefinitely', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    return new Response(JSON.stringify({ error: 'Please sign in.' }), { status: 401 });
  };
  try {
    await assert.rejects(api('/api/projects'), error => error.status === 401);
    assert.deepEqual(calls, ['/api/projects', '/api/auth/refresh']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
