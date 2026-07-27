export const SECURITY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS security_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    initialized_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_config (
    role TEXT PRIMARY KEY CHECK (role IN ('staff', 'admin')),
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leader_pins (
    person_id TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS scan_rate_limits (
    bucket TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL
  )`,
] as const;
