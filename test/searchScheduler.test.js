import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createSearchScheduler } from '../client/features/tasks/searchScheduler.js';

test('throttles typing and applies the final search after typing stops', async () => {
  const updates = [];
  const scheduler = createSearchScheduler(value => updates.push(value), 120);
  try {
    scheduler.schedule('a');
    await sleep(20);
    scheduler.schedule('ab');
    await sleep(20);
    scheduler.schedule('abc');
    assert.deepEqual(updates, ['a']);
    await sleep(160);
    assert.deepEqual(updates, ['a', 'abc']);
    scheduler.schedule('abcd');
    await sleep(20);
    scheduler.schedule('abcde');
    await sleep(20);
    scheduler.schedule('abcdef');
    await sleep(160);
    assert.equal(updates.at(-1), 'abcdef');
  } finally {
    scheduler.cancel();
  }
});

test('continuous typing updates periodically and cancellation prevents pending updates', async () => {
  const updates = [];
  const scheduler = createSearchScheduler(value => updates.push(value), 100);
  try {
    scheduler.schedule('first');
    await sleep(40);
    scheduler.schedule('second');
    await sleep(40);
    scheduler.schedule('third');
    await sleep(40);
    scheduler.schedule('fourth');
    assert.deepEqual(updates, ['first', 'fourth']);
    scheduler.schedule('pending');
    scheduler.cancel();
    await sleep(140);
    assert.deepEqual(updates, ['first', 'fourth']);
  } finally {
    scheduler.cancel();
  }
});
