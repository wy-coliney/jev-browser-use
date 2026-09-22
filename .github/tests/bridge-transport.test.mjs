import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { run } from '../../skills/jev-browser-use/bridge.mjs';

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
