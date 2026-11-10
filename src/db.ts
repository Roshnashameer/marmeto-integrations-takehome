import Database from 'better-sqlite3';
import { CONFIG } from './config';

export const db = new Database(CONFIG.dbPath);

export function initDb() {
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_webhooks (
      webhook_id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      items TEXT NOT NULL,
      status TEXT CHECK(status IN ('PENDING', 'PROCESSING', 'CONFIRMED', 'FAILED')) DEFAULT 'PENDING',
      shipment_id TEXT,
      attempts INTEGER DEFAULT 0,
      next_retry_at INTEGER DEFAULT 0,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dead_letter_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE,
      last_error TEXT,
      attempts INTEGER,
      parked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
