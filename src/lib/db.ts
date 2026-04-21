import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "colonist.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      colonist_username TEXT PRIMARY KEY,
      display_name TEXT,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      start_time TEXT NOT NULL,
      duration_ms INTEGER,
      turn_count INTEGER,
      vp_to_win INTEGER,
      max_players INTEGER,
      is_private INTEGER,
      friendly_robber INTEGER,
      map_setting INTEGER,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_players (
      game_id TEXT NOT NULL REFERENCES games(id),
      colonist_username TEXT NOT NULL,
      rank INTEGER NOT NULL,
      points INTEGER NOT NULL,
      finished INTEGER DEFAULT 1,
      quit_with_penalty INTEGER DEFAULT 0,
      player_color INTEGER,
      play_order INTEGER,
      PRIMARY KEY (game_id, colonist_username)
    );
  `);
}

export default getDb;
