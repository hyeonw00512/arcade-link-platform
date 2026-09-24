import pg from 'pg';

const EMPTY_STATE = Object.freeze({ sessions: [], rooms: [] });

/**
 * Production persistence adapter. Keeping the platform snapshot in one
 * versioned row lets the existing room/session services remain independent of
 * a particular database while guest profiles survive Render restarts.
 */
export class PostgresStateStore {
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('DATABASE_URL이 필요합니다.');
    this.pool = new pg.Pool({ connectionString, ssl: sslOptions(connectionString) });
    this.writeQueue = Promise.resolve();
  }

  async load() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS arcade_link_platform_state (
        state_key TEXT PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const result = await this.pool.query(
      'SELECT state FROM arcade_link_platform_state WHERE state_key = $1',
      ['primary']
    );
    return normalizeState(result.rows[0]?.state);
  }

  save(state) {
    const snapshot = normalizeState(state);
    this.writeQueue = this.writeQueue.then(() => this.pool.query(`
      INSERT INTO arcade_link_platform_state (state_key, state, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
    `, ['primary', JSON.stringify(snapshot)]));
    return this.writeQueue;
  }

  async close() {
    await this.pool.end();
  }
}

function normalizeState(value) {
  return {
    sessions: Array.isArray(value?.sessions) ? value.sessions : [],
    rooms: Array.isArray(value?.rooms) ? value.rooms : []
  };
}

function sslOptions(connectionString) {
  // Local PostgreSQL installations commonly do not use TLS. Hosted URLs do.
  return /localhost|127\.0\.0\.1/i.test(connectionString) ? undefined : { rejectUnauthorized: false };
}
