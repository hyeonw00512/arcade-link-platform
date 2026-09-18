import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStateStore } from '../server/platform/storage/file-state-store.js';

test('file state store restores saved sessions and rooms', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcade-link-state-'));
  const store = new FileStateStore(join(directory, 'platform-state.json'));
  const snapshot = {
    sessions: [{ userId: 'user-1', sessionToken: 'token-1', expiresAt: Date.now() + 60_000 }],
    rooms: [{ roomId: 'room-1', inviteCode: 'ABC123', players: [] }]
  };

  store.save(snapshot);
  assert.deepEqual(store.load(), snapshot);
  rmSync(directory, { recursive: true, force: true });
});
