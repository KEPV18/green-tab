import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
let db: SqlJsDatabase | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database from file if it exists
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA foreign_keys = ON");
  createTables(db);
  return db;
}

function saveDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
}

function createTables(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS month_data (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      good INTEGER DEFAULT 0,
      bad INTEGER DEFAULT 0,
      karma_bad INTEGER DEFAULT 0,
      genesys_good INTEGER DEFAULT 0,
      genesys_bad INTEGER DEFAULT 0,
      fcr REAL DEFAULT 0,
      aht REAL DEFAULT 0,
      good_phone INTEGER DEFAULT 0,
      good_chat INTEGER DEFAULT 0,
      good_email INTEGER DEFAULT 0,
      bad_phone INTEGER DEFAULT 0,
      bad_chat INTEGER DEFAULT 0,
      bad_email INTEGER DEFAULT 0,
      off_days TEXT DEFAULT '[]',
      UNIQUE(user_id, year, month),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      month_data_id TEXT NOT NULL,
      ticket_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('DSAT', 'Karma')),
      channel TEXT NOT NULL CHECK(channel IN ('Phone', 'Chat', 'Email')),
      note TEXT DEFAULT '',
      FOREIGN KEY (month_data_id) REFERENCES month_data(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS genesys_tickets (
      id TEXT PRIMARY KEY,
      month_data_id TEXT NOT NULL,
      ticket_link TEXT DEFAULT '',
      rating_score INTEGER DEFAULT 0,
      customer_phone TEXT DEFAULT '',
      ticket_date TEXT DEFAULT '',
      ticket_id TEXT DEFAULT '',
      channel TEXT DEFAULT 'Phone',
      note TEXT DEFAULT '',
      FOREIGN KEY (month_data_id) REFERENCES month_data(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_changes (
      id TEXT PRIMARY KEY,
      month_data_id TEXT NOT NULL,
      change_date TEXT NOT NULL,
      change_time TEXT NOT NULL,
      field_name TEXT NOT NULL,
      old_value REAL,
      new_value REAL,
      change_amount REAL,
      FOREIGN KEY (month_data_id) REFERENCES month_data(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_shifts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      shift_date TEXT NOT NULL,
      shift_start TEXT,
      shift_end TEXT,
      break1_time TEXT,
      break1_duration INTEGER DEFAULT 0,
      break2_time TEXT,
      break2_duration INTEGER DEFAULT 0,
      break3_time TEXT,
      break3_duration INTEGER DEFAULT 0,
      notes TEXT,
      is_off_day INTEGER DEFAULT 0,
      is_site_day INTEGER DEFAULT 0,
      absence_type TEXT,
      ot_hours_day REAL DEFAULT 0,
      ot_hours_night REAL DEFAULT 0,
      ot_hours_special REAL DEFAULT 0,
      UNIQUE(user_id, shift_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      shift_start_time TEXT DEFAULT '09:00',
      theme TEXT DEFAULT 'dark',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  saveDb();
}

// Helper to convert a row to plain object
function rowToObj(stmt: any): Record<string, any> | null {
  const row = stmt.getAsObject();
  return Object.keys(row).length > 0 ? row : null;
}

function rowsToArray(result: any[]): Record<string, any>[] {
  return result.map(row => {
    const obj: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      obj[key] = row[key];
    }
    return obj;
  });
}

// ---- Auth ----
export async function createUser(email: string, username: string, password: string): Promise<{ id: string; email: string; username: string; createdAt: string } | { error: string }> {
  const d = await getDb();
  const existing = d.exec("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0 && existing[0].values.length > 0) return { error: "This email is already registered" };

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const createdAt = new Date().toISOString();

  d.run("INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", [id, email, username, passwordHash, createdAt]);
  saveDb();

  return { id, email, username, createdAt };
}

export async function verifyUser(email: string, password: string): Promise<{ id: string; email: string; username: string; createdAt: string } | null> {
  const d = await getDb();
  const result = d.exec("SELECT id, email, username, password_hash, created_at FROM users WHERE email = ?", [email]);
  if (result.length === 0 || result[0].values.length === 0) return null;

  const row = result[0];
  const id = row.values[0][0] as string;
  const emailVal = row.values[0][1] as string;
  const username = row.values[0][2] as string;
  const passwordHash = row.values[0][3] as string;
  const createdAt = row.values[0][4] as string;

  if (!bcrypt.compareSync(password, passwordHash)) return null;
  return { id, email: emailVal, username, createdAt };
}

export async function getUserById(id: string): Promise<{ id: string; email: string; username: string; createdAt: string } | null> {
  const d = await getDb();
  const result = d.exec("SELECT id, email, username, created_at FROM users WHERE id = ?", [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;

  return {
    id: result[0].values[0][0] as string,
    email: result[0].values[0][1] as string,
    username: result[0].values[0][2] as string,
    createdAt: result[0].values[0][3] as string,
  };
}

// ---- Month Data ----
export async function getOrCreateMonthData(userId: string, year: number, month: number): Promise<Record<string, any>> {
  const d = await getDb();
  const result = d.exec("SELECT * FROM month_data WHERE user_id = ? AND year = ? AND month = ?", [userId, year, month]);

  if (result.length > 0 && result[0].values.length > 0) {
    const columns = result[0].columns;
    const values = result[0].values[0];
    const obj: Record<string, any> = {};
    columns.forEach((col, i) => { obj[col] = values[i]; });
    return obj;
  }

  const id = uuidv4();
  d.run("INSERT INTO month_data (id, user_id, year, month) VALUES (?, ?, ?, ?)", [id, userId, year, month]);
  saveDb();

  return { id, user_id: userId, year, month, good: 0, bad: 0, karma_bad: 0, genesys_good: 0, genesys_bad: 0, fcr: 0, aht: 0, good_phone: 0, good_chat: 0, good_email: 0, bad_phone: 0, bad_chat: 0, bad_email: 0, off_days: "[]" };
}

export async function updateMonthData(monthDataId: string, data: Record<string, any>): Promise<Record<string, any> | null> {
  const d = await getDb();
  const fields = Object.keys(data).filter(k => k !== "id" && k !== "month_data_id");
  if (fields.length === 0) return null;

  const setClause = fields.map(f => `${f} = ?`).join(", ");
  const values = fields.map(f => data[f]);
  values.push(monthDataId);

  d.run(`UPDATE month_data SET ${setClause} WHERE id = ?`, values);
  saveDb();

  const result = d.exec("SELECT * FROM month_data WHERE id = ?", [monthDataId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const columns = result[0].columns;
  const row = result[0].values[0];
  const obj: Record<string, any> = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

// ---- Tickets ----
export async function getTickets(monthDataId: string): Promise<Record<string, any>[]> {
  const d = await getDb();
  const result = d.exec("SELECT * FROM tickets WHERE month_data_id = ?", [monthDataId]);
  if (result.length === 0) return [];
  return result[0].values.map(row => {
    const obj: Record<string, any> = {};
    result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

export async function addTicket(monthDataId: string, ticket: { ticketId: string; type: string; channel: string; note: string }): Promise<Record<string, any>> {
  const d = await getDb();
  const id = uuidv4();
  d.run("INSERT INTO tickets (id, month_data_id, ticket_id, type, channel, note) VALUES (?, ?, ?, ?, ?, ?)", [id, monthDataId, ticket.ticketId, ticket.type, ticket.channel, ticket.note]);
  saveDb();

  const result = d.exec("SELECT * FROM tickets WHERE id = ?", [id]);
  const obj: Record<string, any> = {};
  result[0].columns.forEach((col, i) => { obj[col] = result[0].values[0][i]; });
  return obj;
}

export async function deleteTicket(ticketId: string): Promise<boolean> {
  const d = await getDb();
  d.run("DELETE FROM tickets WHERE id = ?", [ticketId]);
  saveDb();
  return true;
}

// ---- Genesys Tickets ----
export async function getGenesysTickets(monthDataId: string): Promise<Record<string, any>[]> {
  const d = await getDb();
  const result = d.exec("SELECT * FROM genesys_tickets WHERE month_data_id = ?", [monthDataId]);
  if (result.length === 0) return [];
  return result[0].values.map(row => {
    const obj: Record<string, any> = {};
    result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

export async function addGenesysTicket(monthDataId: string, ticket: Record<string, any>): Promise<Record<string, any>> {
  const d = await getDb();
  const id = uuidv4();
  d.run("INSERT INTO genesys_tickets (id, month_data_id, ticket_link, rating_score, customer_phone, ticket_date, ticket_id, channel, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, monthDataId, ticket.ticketLink || "", ticket.ratingScore || 0, ticket.customerPhone || "", ticket.ticketDate || "", ticket.ticketId || "", ticket.channel || "Phone", ticket.note || ""]);
  saveDb();

  const result = d.exec("SELECT * FROM genesys_tickets WHERE id = ?", [id]);
  const obj: Record<string, any> = {};
  result[0].columns.forEach((col, i) => { obj[col] = result[0].values[0][i]; });
  return obj;
}

export async function deleteGenesysTicket(ticketId: string): Promise<boolean> {
  const d = await getDb();
  d.run("DELETE FROM genesys_tickets WHERE id = ?", [ticketId]);
  saveDb();
  return true;
}

// ---- Daily Changes ----
export async function getDailyChanges(monthDataId: string): Promise<Record<string, any>[]> {
  const d = await getDb();
  const result = d.exec("SELECT * FROM daily_changes WHERE month_data_id = ? ORDER BY change_date, change_time", [monthDataId]);
  if (result.length === 0) return [];
  return result[0].values.map(row => {
    const obj: Record<string, any> = {};
    result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

export async function addDailyChange(monthDataId: string, change: Record<string, any>): Promise<Record<string, any>> {
  const d = await getDb();
  const id = uuidv4();
  d.run("INSERT INTO daily_changes (id, month_data_id, change_date, change_time, field_name, old_value, new_value, change_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, monthDataId, change.changeDate, change.changeTime, change.fieldName, change.oldValue ?? null, change.newValue ?? null, change.changeAmount ?? null]);
  saveDb();

  const result = d.exec("SELECT * FROM daily_changes WHERE id = ?", [id]);
  const obj: Record<string, any> = {};
  result[0].columns.forEach((col, i) => { obj[col] = result[0].values[0][i]; });
  return obj;
}

// ---- Daily Shifts ----
export async function getDailyShifts(userId: string, yearMonth?: string): Promise<Record<string, any>[]> {
  const d = await getDb();
  if (yearMonth) {
    const result = d.exec("SELECT * FROM daily_shifts WHERE user_id = ? AND shift_date LIKE ? ORDER BY shift_date", [userId, `${yearMonth}%`]);
    if (result.length === 0) return [];
    return result[0].values.map(row => {
      const obj: Record<string, any> = {};
      result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }
  const result = d.exec("SELECT * FROM daily_shifts WHERE user_id = ? ORDER BY shift_date", [userId]);
  if (result.length === 0) return [];
  return result[0].values.map(row => {
    const obj: Record<string, any> = {};
    result[0].columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

export async function upsertDailyShift(userId: string, shift: Record<string, any>): Promise<Record<string, any>> {
  const d = await getDb();
  const id = uuidv4();
  d.run(`INSERT INTO daily_shifts (id, user_id, shift_date, shift_start, shift_end, break1_time, break1_duration, break2_time, break2_duration,
    break3_time, break3_duration, notes, is_off_day, is_site_day, absence_type, ot_hours_day, ot_hours_night, ot_hours_special)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, shift_date) DO UPDATE SET
    shift_start = excluded.shift_start, shift_end = excluded.shift_end, break1_time = excluded.break1_time, break1_duration = excluded.break1_duration,
    break2_time = excluded.break2_time, break2_duration = excluded.break2_duration, break3_time = excluded.break3_time, break3_duration = excluded.break3_duration,
    notes = excluded.notes, is_off_day = excluded.is_off_day, is_site_day = excluded.is_site_day, absence_type = excluded.absence_type,
    ot_hours_day = excluded.ot_hours_day, ot_hours_night = excluded.ot_hours_night, ot_hours_special = excluded.ot_hours_special`,
    [id, userId, shift.shiftDate, shift.shiftStart || null, shift.shiftEnd || null, shift.break1Time || null, shift.break1Duration || 0,
     shift.break2Time || null, shift.break2Duration || 0, shift.break3Time || null, shift.break3Duration || 0, shift.notes || null,
     shift.isOffDay ? 1 : 0, shift.isSiteDay ? 1 : 0, shift.absenceType || null, shift.otHoursDay || 0, shift.otHoursNight || 0, shift.otHoursSpecial || 0]);
  saveDb();

  const result = d.exec("SELECT * FROM daily_shifts WHERE user_id = ? AND shift_date = ?", [userId, shift.shiftDate]);
  const obj: Record<string, any> = {};
  result[0].columns.forEach((col, i) => { obj[col] = result[0].values[0][i]; });
  return obj;
}

// ---- User Settings ----
export async function getUserSettings(userId: string): Promise<Record<string, any>> {
  const d = await getDb();
  const result = d.exec("SELECT * FROM user_settings WHERE user_id = ?", [userId]);
  if (result.length === 0 || result[0].values.length === 0) {
    d.run("INSERT INTO user_settings (user_id, shift_start_time, theme) VALUES (?, '09:00', 'dark')", [userId]);
    saveDb();
    return { user_id: userId, shift_start_time: "09:00", theme: "dark" };
  }
  const obj: Record<string, any> = {};
  result[0].columns.forEach((col, i) => { obj[col] = result[0].values[0][i]; });
  return obj;
}

export async function updateUserSettings(userId: string, settings: Record<string, any>): Promise<Record<string, any>> {
  const d = await getDb();
  const fields = Object.keys(settings).filter(k => k !== "user_id");
  if (fields.length === 0) return getUserSettings(userId);

  const setClause = fields.map(f => `${f} = ?`).join(", ");
  const values = fields.map(f => settings[f]);
  values.push(userId);
  d.run(`UPDATE user_settings SET ${setClause} WHERE user_id = ?`, values);
  saveDb();

  return getUserSettings(userId);
}