import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Real-time Multi-device Sync Audit', () => {
  test('App.jsx — handles realtime sync signal with low latency debounce', () => {
    const filePath = resolve('src/App.jsx');
    const content = readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes("reason === 'realtime'") || content.includes('isRealtime'),
      'App.jsx must give priority to realtime sync signals over default 5s throttle'
    );
  });

  test('MemoMaster.jsx — updates state via setExpressionsState on cards_synced to avoid echo loop', () => {
    const filePath = resolve('src/MemoMaster.jsx');
    const content = readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes('setExpressionsState(repaired.map(ensureMasteryStage))'),
      'MemoMaster.jsx onCardsSynced must use setExpressionsState to avoid re-mirroring synced cards'
    );
  });

  test('sync.js — dispatches cards_synced when changes are pulled', () => {
    const filePath = resolve('src/lib/db/sync.js');
    const content = readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes("window.dispatchEvent(new CustomEvent('cards_synced'))"),
      'sync.js must dispatch cards_synced event to notify UI components'
    );
  });
});
