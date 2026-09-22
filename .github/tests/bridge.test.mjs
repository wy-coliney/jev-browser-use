import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseState,
  checkState,
  validateControl,
  availableActions,
  discoverActions,
  createSession,
  waitForState,
  decide
} from '../../skills/jev-browser-use/bridge.mjs';

describe('parseState', () => {
  test('parses basic accessibility elements correctly', () => {
    const raw = `
Browser tab: Home URL: "https://example.com/dashboard".
1 button Description: Submit Form
2 link Description: Profile Settings
3 text field Description: Search query
4 checkbox Description: Remember me
    `.trim();

    const entries = parseState(raw);
    assert.equal(entries.length, 4);
    assert.deepEqual(entries[0], { index: 1, role: 'button', name: 'Submit Form' });
    assert.deepEqual(entries[1], { index: 2, role: 'link', name: 'Profile Settings' });
    assert.deepEqual(entries[2], { index: 3, role: 'text field', name: 'Search query' });
    assert.deepEqual(entries[3], { index: 4, role: 'checkbox', name: 'Remember me' });
  });

  test('parses toggle switches and multi-word roles', () => {
    const raw = `
10 switch Description: Dark mode
11 toggle button Description: Mute audio
12 check box Description: Accept terms
13 menu button Description: Actions menu
14 radio button Description: Option A
    `.trim();

    const entries = parseState(raw);
    assert.equal(entries.length, 5);
    assert.deepEqual(entries[0], { index: 10, role: 'switch', name: 'Dark mode' });
    assert.deepEqual(entries[1], { index: 11, role: 'toggle button', name: 'Mute audio' });
    assert.deepEqual(entries[2], { index: 12, role: 'check box', name: 'Accept terms' });
    assert.deepEqual(entries[3], { index: 13, role: 'menu button', name: 'Actions menu' });
    assert.deepEqual(entries[4], { index: 14, role: 'radio button', name: 'Option A' });
  });

  test('handles elements with values and states in name', () => {
    const raw = `
5 switch (focused) Description: Notifications, Value: enabled
6 button (disabled) Description: Save Changes
    `.trim();

    const entries = parseState(raw);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].index, 5);
    assert.equal(entries[0].role, 'switch');
    assert.equal(entries[0].name, 'Notifications, Value: enabled');
  });
});

describe('validateControl', () => {
  test('accepts valid click, scroll, press and reload controls', () => {
    assert.equal(validateControl({ op: 'click', name: 'Submit' }), true);
    assert.equal(validateControl({ op: 'scroll', direction: 'down', amount: 2 }), true);
    assert.equal(validateControl({ op: 'scroll', direction: 'up', targetName: 'Panel' }), true);
    assert.equal(validateControl({ op: 'scroll', direction: 'down', point: [100, 200] }), true);
    assert.equal(validateControl({ op: 'press', key: 'Enter' }), true);
    assert.equal(validateControl({ op: 'press', key: 'Escape' }), true);
    assert.equal(validateControl({ op: 'reload' }), true);
  });

  test('rejects invalid or unsafe controls', () => {
    assert.equal(validateControl(null), false);
    assert.equal(validateControl({ op: 'click' }), false);
    assert.equal(validateControl({ op: 'scroll', direction: 'sideways' }), false);
    assert.equal(validateControl({ op: 'scroll', direction: 'down', amount: 10 }), false);
    assert.equal(validateControl({ op: 'scroll', direction: 'down', targetName: 'Panel', point: [10, 10] }), false);
    assert.equal(validateControl({ op: 'press', key: 'F12' }), false);
    assert.equal(validateControl({ op: 'unknown_op' }), false);
  });
});

describe('availableActions & discoverActions', () => {
  const sampleState = `
Browser tab: App URL: "https://example.com/settings".
1 button Description: Save
2 switch Description: Enable 2FA
3 button Description: Delete Account
4 link Description: Help
5 button Description: Save
  `.trim();

  test('availableActions resolves named buttons and switches', () => {
    const controls = [
      { op: 'click', name: 'Enable 2FA' },
      { op: 'reload' },
      { op: 'press', key: 'Escape' }
    ];
    const actions = availableActions(sampleState, controls);
    assert.equal(actions.length, 3);
    assert.equal(actions[0].name, 'Enable 2FA');
    assert.equal(actions[0].index, 2);
    assert.equal(actions[0].description, 'Click Enable 2FA');
    assert.equal(actions[1].op, 'reload');
    assert.equal(actions[2].op, 'press');
  });

  test('availableActions skips ambiguous elements with duplicate names', () => {
    // "Save" appears twice (index 1 and index 5)
    const controls = [{ op: 'click', name: 'Save' }];
    const actions = availableActions(sampleState, controls);
    assert.equal(actions.length, 0);
  });

  test('discoverActions respects policy filters and includes switch', () => {
    const policy = {
      click: true,
      denyNames: [/delete/i],
      scrollDirections: ['down']
    };
    const actions = discoverActions(sampleState, policy);

    // "Delete Account" must be excluded by denyNames
    assert.ok(!actions.some(a => a.name === 'Delete Account'));
    // "Save" must be excluded because it's duplicated
    assert.ok(!actions.some(a => a.name === 'Save'));
    // "Enable 2FA" (switch) must be discovered!
    assert.ok(actions.some(a => a.name === 'Enable 2FA' && a.index === 2));
    // "Help" (link) must be discovered
    assert.ok(actions.some(a => a.name === 'Help' && a.index === 4));
    // Scroll down must be included
    assert.ok(actions.some(a => a.op === 'scroll' && a.direction === 'down'));
  });
});
describe('checkState (Origin and snapshot limits)', () => {
  test('passes on authorized origin', () => {
    const snapshot = 'Browser tab: Test URL: "https://ezcollegeapp.com/review".\n1 button Description: Ok';
    assert.doesNotThrow(() => checkState(snapshot, ['https://ezcollegeapp.com']));
  });

  test('throws when origin is unauthorized', () => {
    const snapshot = 'Browser tab: Phish URL: "https://malicious.com/login".\n1 button Description: Ok';
    assert.throws(
      () => checkState(snapshot, ['https://ezcollegeapp.com']),
      /Browser left authorized origins/
    );
  });

  test('throws on oversized snapshot', () => {
    const bigContent = 'x'.repeat(25000);
    const snapshot = `Browser tab: Test URL: "https://example.com".\n${bigContent}`;
    assert.throws(
      () => checkState(snapshot, ['https://example.com']),
      /Snapshot too large/
    );
  });
});

describe('createSession & session lifecycle', () => {
  test('tracks session metrics and resets properly', () => {
    const dummyTab = {
      async getAXState() {
        return 'Browser tab: Test URL: "https://example.com".\n1 button Description: OK';
      },
      async click() {}
    };

    const session = createSession(dummyTab);
    const initialMetrics = session.metrics();
    assert.equal(initialMetrics.runs, 0);
    assert.equal(initialMetrics.decisions, 0);
    assert.equal(initialMetrics.executedActions, 0);

    session.reset();
    assert.equal(session.history().length, 0);
  });
});

describe('waitForState', () => {
  test('returns matched when includes match', async () => {
    const dummyTab = {
      async getAXState() {
        return 'Browser tab: Test URL: "https://example.com".\nDashboard Ready';
      }
    };

    const res = await waitForState(dummyTab, {
      allowedOrigins: ['https://example.com'],
      includes: ['Dashboard Ready'],
      excludes: ['Loading...'],
      timeoutMs: 1000,
      pollMs: 100
    });

    assert.equal(res.status, 'matched');
  });

  test('returns timeout when condition is not met', async () => {
    const dummyTab = {
      async getAXState() {
        return 'Browser tab: Test URL: "https://example.com".\nLoading...';
      }
    };

    const res = await waitForState(dummyTab, {
      allowedOrigins: ['https://example.com'],
      includes: ['Done'],
      excludes: [],
      timeoutMs: 300,
      pollMs: 100
    });

    assert.equal(res.status, 'timeout');
  });
});

describe('decide contract and security validation', () => {
  test('rejects unsupported provider', async () => {
    await assert.rejects(
      async () => {
        await decide({
          provider: 'unknown-provider',
          goal: 'Test',
          state: '',
          actions: []
        });
      },
      /Unsupported Jev provider/
    );
  });

  test('rejects invalid Jev model format', async () => {
    await assert.rejects(
      async () => {
        await decide({
          provider: 'typesafe',
          model: 'malicious-model-format-???',
          goal: 'Test',
          state: '',
          actions: []
        });
      },
      /Invalid Jev model/
    );
  });

  test('throws when API key is missing from environment', async () => {
    await assert.rejects(
      async () => {
        await decide({
          provider: 'typesafe',
          goal: 'Test',
          state: '',
          actions: []
        });
      },
      /TYPESAFE_API_KEY is missing/
    );
  });

  test('blocks execution when API key is detected in model input payload', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'jev-test-'));
    const envFile = join(tempDir, 'test.env');
    const secretKey = 'sk-typesafe-super-secret-key-12345';
    await writeFile(envFile, `TYPESAFE_API_KEY=${secretKey}\n`);

    try {
      await assert.rejects(
        async () => {
          await decide({
            provider: 'typesafe',
            envFile,
            goal: `Accidental leak of ${secretKey}`,
            state: '1 button Description: Ok',
            actions: []
          });
        },
        /Credential detected in model input/
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
