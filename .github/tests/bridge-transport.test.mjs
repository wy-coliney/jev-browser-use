import assert from 'node:assert/strict';
import fs, { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { run } from '../../skills/jev-browser-use/bridge.mjs';

test('credential-file errors from another realm retain their diagnostic before any provider request', async t => {
  const error = runInNewContext('new Error("Credential file unavailable (EACCES)")');
  const readFileMock = t.mock.method(fs, 'readFile', async () => { throw error; });
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => assert.fail('Provider must not be reached'));
  syncBuiltinESMExports();
  try {
    const tab = {
      async getAXState() { return 'Browser tab: "Test". URL: "https://example.com/".\n'; }
    };
    const outcome = await run(tab, {
      goal: 'Check the page',
      controls: [{ op: 'reload' }],
      envFile: '/synthetic/provider.env',
      provider: 'openrouter',
      allowedOrigins: ['https://example.com'],
      maxSteps: 1
    });
    assert.equal(outcome.status, 'decision_error');
    assert.equal(outcome.error, error.message);
    assert.equal(outcome.history[0].executed, false);
    assert.equal(fetchMock.mock.calls.length, 0);
  } finally {
    readFileMock.mock.restore();
    syncBuiltinESMExports();
  }
});

test('browser action errors from another realm retain their diagnostic', async t => {
  const error = runInNewContext('new Error("Browser connection closed")');
  const directory = await mkdtemp(join(tmpdir(), 'jev-action-error-'));
  const envFile = join(directory, 'provider.env');
  await writeFile(envFile, 'TYPESAFE_API_KEY=test-only\n');
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    model: 'jev-latest',
    answers: { next: {
      type: 'choice', choice: 'a0', confidence: 1,
      probabilities: { a0: 1, DONE: 0, BLOCKED: 0, WAIT: 0 }
    } }
  }), { status: 200 }));
  try {
    const tab = {
      async getAXState() { return 'Browser tab: "Test". URL: "https://example.com/".\n'; },
      async reload() { throw error; }
    };
    const outcome = await run(tab, {
      goal: 'Reload the page',
      controls: [{ op: 'reload' }],
      envFile,
      allowedOrigins: ['https://example.com'],
      maxSteps: 1
    });
    assert.equal(outcome.status, 'action_error');
    assert.equal(outcome.error, error.message);
    assert.equal(outcome.history[0].executed, false);
    assert.equal(outcome.history[0].reason, 'action_error');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('DNS failure identifies the runtime and does not retry or expose credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-transport-'));
  const envFile = join(directory, 'provider.env');
  const originalFetch = globalThis.fetch;
  const secret = 'test-secret-never-print';
  let requests = 0;
  try {
    await writeFile(envFile, `TYPESAFE_API_KEY=${secret}\n`);
    globalThis.fetch = async () => {
      requests += 1;
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('lookup failed'), { code: 'ENOTFOUND' }) });
    };
    const tab = {
      async getAXState() { return 'Browser tab: "Test". URL: "https://example.com/".\n'; }
    };
    const outcome = await run(tab, {
      goal: 'Check the page',
      controls: [{ op: 'reload' }],
      envFile,
      allowedOrigins: ['https://example.com'],
      maxSteps: 1
    });
    assert.equal(outcome.status, 'decision_error');
    assert.match(outcome.error, /DNS lookup failed in this runtime \(ENOTFOUND\); provider was not reached/);
    assert.equal(requests, 1);
    assert.ok(!JSON.stringify(outcome).includes(secret));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
