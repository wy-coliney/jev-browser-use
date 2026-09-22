import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../skills/jev-browser-use/bridge.mjs';

const snapshot = 'Browser tab: 1, Title: "Test", URL: "https://example.com/".\n1 AXWebArea Test, URL: example.com/';
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'jev-browser-use-test-'));
const envFile = join(temporaryDirectory, 'test.env');
const originalFetch = globalThis.fetch;

await writeFile(envFile, 'TYPESAFE_API_KEY=test-only\n', 'utf8');

function successfulDecision() {
  return new Response(JSON.stringify({
    model: 'jev-1.13.0',
    answers: {
      next: {
        type: 'choice',
        choice: 'a0',
        confidence: 1,
        probabilities: { a0: 1, DONE: 0, BLOCKED: 0, WAIT: 0 },
      },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function exercise(control) {
  const pressKeyCalls = [];
  const tab = {
    async getAXState() { return snapshot; },
    async pressKey(...args) { pressKeyCalls.push(args); },
  };

  globalThis.fetch = async () => successfulDecision();
  const outcome = await run(tab, {
    goal: 'Perform the single permitted input once.',
    controls: [control],
    envFile,
    provider: 'typesafe',
    model: 'jev-latest',
    allowedOrigins: ['https://example.com'],
    maxSteps: 1,
    maxMs: 10_000,
    decisionTimeoutMs: 5_000,
    maxDecisionRetries: 0,
  });

  assert.equal(outcome.history[0]?.executed, true);
  return pressKeyCalls;
}

try {
  assert.deepEqual(
    await exercise({ op: 'scroll', direction: 'down', amount: 1 }),
    [[null, 'PageDown']],
  );
  assert.deepEqual(
    await exercise({ op: 'press', key: 'Escape' }),
    [[null, 'Escape']],
  );
  console.log('bridge input contract: ok');
} finally {
  globalThis.fetch = originalFetch;
  await rm(temporaryDirectory, { recursive: true, force: true });
}
