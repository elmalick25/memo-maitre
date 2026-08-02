import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PWA Update System Tests', () => {
  test('UpdatePrompt.jsx — handles skipWaiting and controllerchange reload cleanly', () => {
    const filePath = resolve('src/components/UpdatePrompt.jsx');
    const content = readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes('SKIP_WAITING') || content.includes('updateSW'),
      'UpdatePrompt must trigger SKIP_WAITING or updateSW'
    );
    assert.ok(
      content.includes('controllerchange'),
      'UpdatePrompt should listen for controllerchange to reload after SW activation'
    );
  });

  test('main.jsx — configures service worker with reloading on controllerchange', () => {
    const filePath = resolve('src/main.jsx');
    const content = readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes('controllerchange'),
      'main.jsx must listen for controllerchange'
    );
    assert.ok(
      content.includes('updateSW'),
      'main.jsx must register and expose updateSW'
    );
  });

  test('vite.config.js — configures VitePWA workbox skipWaiting and clientsClaim', () => {
    const filePath = resolve('vite.config.js');
    const content = readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes('skipWaiting') || content.includes('autoUpdate'),
      'vite.config.js must enable skipWaiting or autoUpdate in VitePWA'
    );
  });
});
