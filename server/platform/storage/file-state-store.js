import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFile = fileURLToPath(new URL('../../../data/platform-state.json', import.meta.url));

/**
 * Development persistence adapter. Its interface is intentionally small so it
 * can later be replaced with a database-backed adapter without changing rooms
 * or session code.
 */
export class FileStateStore {
  constructor(filePath = process.env.PLATFORM_DATA_FILE || defaultFile) {
    this.filePath = filePath;
  }

  load() {
    if (!existsSync(this.filePath)) return { sessions: [], rooms: [] };
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : []
    };
  }

  save({ sessions, rooms }) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryFile = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    writeFileSync(temporaryFile, JSON.stringify({ sessions, rooms }, null, 2), 'utf8');
    renameSync(temporaryFile, this.filePath);
  }
}
