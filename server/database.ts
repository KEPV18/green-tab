import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "database.sqlite");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    createTables(db);
  }
  return db;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

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
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      month_data_id TEXT NOT NULL,
      ticket_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('DSAT', 'Karma')),
      channel TEXT NOT NULL CHECK(channel IN ('Phone', 'Chat', 'Email')),
      note TEXT DEFAULT '',
      FOREIGN KEY (month_data_id) REFERENCES month_data(id) ON DELETE CASCADE
    );

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
    );

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
    );

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
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      shift_start_time TEXT DEFAULT '09:00',
      theme TEXT DEFAULT 'dark',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

// ---- Auth ----

export function createUser(email: string, username: string, password: string): { id: string; email: string; username: string; createdAt: string } | { error: string } {
  const d = getDb();
  const existing = d.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return { error: "This email is already registered" };

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const createdAt = new Date().toISOString();

  d.prepare("INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, email, username, passwordHash, createdAt);

  return { id, email, username, createdAt };
}

export function verifyUser(email: string, password: string): { id: string; email: string; username: string; createdAt: string } | null {
  const d = getDb();
  const row = d.prepare("SELECT id, email, username, password_hash, created_at FROM users WHERE email = ?").get(email) as any;
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, email: row.email, username: row.username, createdAt: row.created_at };
}

export function getUserById(id: string): { id: string; email: string; username: string; createdAt: string } | null {
  const d = getDb();
  const row = d.prepare("SELECT id, email, username, created_at FROM users WHERE id = ?").get(id) as any;
  if (!row) return null;
  return { id: row.id, email: row.email, username: row.username, createdAt: row.created_at };
}

// ---- Month Data ----

export function getOrCreateMonthData(userId: string, year: number, month: number): any {
  const d = getDb();
  let row = d.prepare("SELECT * FROM month_data WHERE user_id = ? AND year = ? AND month = ?").get(userId, year, month) as any;
  if (!row) {
    const id = uuidv4();
    d.prepare(`INSERT INTO month_data (id, user_id, year, month, good, bad, karma_bad, genesys_good, genesys_bad, fcr, aht,
               good_phone, good_chat, good_email, bad_phone, bad_chat, bad_email, off_days)
               VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '[]')`)
      .run(id, userId, year, month);
    row = d.prepare("SELECT * FROM month_data WHERE id = ?").get(id);
  }
  return row;
}

export function updateMonthData(monthDataId: string, data: Record<string, unknown>): any {
  const d = getDb();
  const fields = Object.keys(data).filter(k => k !== "id" && k !== "month_data_id");
  if (fields.length === 0) return null;

  const setClause = fields.map(f => `${f} = @${f}`).join(", ");
  const stmt = d.prepare(`UPDATE month_data SET ${setClause} WHERE id = @id`);
  
  const params: Record<string, unknown> = { id: monthDataId };
  for (const f of fields) {
    params[f] = data[f];
  }
  stmt.run(params);
  return d.prepare("SELECT * FROM month_data WHERE id = ?").get(monthDataId);
}

// ---- Tickets ----

export function getTickets(monthDataId: string): any[] {
  const d = getDb();
  return d.prepare("SELECT * FROM tickets WHERE month_data_id = ?").all(monthDataId);
}

export function addTicket(monthDataId: string, ticket: { ticketId: string; type: string; channel: string; note: string }): any {
  const d = getDb();
  const id = uuidv4();
  d.prepare("INSERT INTO tickets (id, month_data_id, ticket_id, type, channel, note) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, monthDataId, ticket.ticketId, ticket.type, ticket.channel, ticket.note);
  return d.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
}

export function deleteTicket(ticketId: string): boolean {
  const d = getDb();
  const result = d.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
  return result.changes > 0;
}

// ---- Genesys Tickets ----

export function getGenesysTickets(monthDataId: string): any[] {
  const d = getDb();
  return d.prepare("SELECT * FROM genesys_tickets WHERE month_data_id = ?").all(monthDataId);
}

export function addGenesysTicket(monthDataId: string, ticket: Record<string, unknown>): any {
  const d = getDb();
  const id = uuidv4();
  d.prepare(`INSERT INTO genesys_tickets (id, month_data_id, ticket_link, rating_score, customer_phone, ticket_date, ticket_id, channel, note)
             VALUES (?, ?, @ticketLink, @ratingScore, @customerPhone, @ticketDate, @ticketId, @channel, @note)`)
    .run({ id, monthDataId: monthDataId, ticketLink: ticket.ticketLink || "", ratingScore: ticket.ratingScore || 0,
           customerPhone: ticket.customerPhone || "", ticketDate: ticket.ticketDate || "", ticketId: ticket.ticketId || "",
           channel: ticket.channel || "Phone", note: ticket.note || "" });
  return d.prepare("SELECT * FROM genesys_tickets WHERE id = ?").get(id);
}

export function deleteGenesysTicket(ticketId: string): boolean {
  const d = getDb();
  const result = d.prepare("DELETE FROM genesys_tickets WHERE id = ?").run(ticketId);
  return result.changes > 0;
}

// ---- Daily Changes ----

export function getDailyChanges(monthDataId: string): any[] {
  const d = getDb();
  return d.prepare("SELECT * FROM daily_changes WHERE month_data_id = ? ORDER BY change_date, change_time").all(monthDataId);
}

export function addDailyChange(monthDataId: string, change: Record<string, unknown>): any {
  const d = getDb();
  const id = uuidv4();
  d.prepare(`INSERT INTO daily_changes (id, month_data_id, change_date, change_time, field_name, old_value, new_value, change_amount)
             VALUES (?, ?, @changeDate, @changeTime, @fieldName, @oldValue, @newValue, @changeAmount)`)
    .run({ id, monthDataId: monthDataId, changeDate: change.changeDate, changeTime: change.changeTime,
           fieldName: change.fieldName, oldValue: change.oldValue, newValue: change.newValue, changeAmount: change.changeAmount });
  return d.prepare("SELECT * FROM daily_changes WHERE id = ?").get(id);
}

// ---- Daily Shifts ----

export function getDailyShifts(userId: string, yearMonth?: string): any[] {
  const d = getDb();
  if (yearMonth) {
    return d.prepare("SELECT * FROM daily_shifts WHERE user_id = ? AND shift_date LIKE ? ORDER BY shift_date").all(userId, `${yearMonth}%`);
  }
  return d.prepare("SELECT * FROM daily_shifts WHERE user_id = ? ORDER BY shift_date").all(userId);
}

export function upsertDailyShift(userId: string, shift: Record<string, unknown>): any {
  const d = getDb();
  const id = uuidv4();
  d.prepare(`INSERT INTO daily_shifts (id, user_id, shift_date, shift_start, shift_end, break1_time, break1_duration, break2_time, break2_duration,
             break3_time, break3_duration, notes, is_off_day, is_site_day, absence_type, ot_hours_day, ot_hours_night, ot_hours_special)
             VALUES (?, ?, @shiftDate, @shiftStart, @shiftEnd, @break1Time, @break1Duration, @break2Time, @break2Duration,
             @break3Time, @break3Duration, @notes, @isOffDay, @isSiteDay, @absenceType, @otHoursDay, @otHoursNight, @otHoursSpecial)
             ON CONFLICT(user_id, shift_date) DO UPDATE SET
             shift_start = @shiftStart, shift_end = @shiftEnd, break1_time = @break1Time, break1_duration = @break1Duration,
             break2_time = @break2Time, break2_duration = @break2Duration, break3_time = @break3Time, break3_duration = @break3Duration,
             notes = @notes, is_off_day = @isOffDay, is_site_day = @isSiteDay, absence_type = @absenceType,
             ot_hours_day = @otHoursDay, ot_hours_night = @otHoursNight, ot_hours_special = @otHoursSpecial`)
    .run({ id, userId, shiftDate: shift.shiftDate, shiftStart: shift.shiftStart || null, shiftEnd: shift.shiftEnd || null,
           break1Time: shift.break1Time || null, break1Duration: shift.break1Duration || 0, break2Time: shift.break2Time || null,
           break2Duration: shift.break2Duration || 0, break3Time: shift.break3Time || null, break3Duration: shift.break3Duration || 0,
           notes: shift.notes || null, isOffDay: shift.isOffDay ? 1 : 0, isSiteDay: shift.isSiteDay ? 1 : 0,
           absenceType: shift.absenceType || null, otHoursDay: shift.otHoursDay || 0, otHoursNight: shift.otHoursNight || 0,
           otHoursSpecial: shift.otHoursSpecial || 0 });
  return d.prepare("SELECT * FROM daily_shifts WHERE user_id = ? AND shift_date = ?").get(userId, shift.shiftDate);
}

// ---- User Settings ----

export function getUserSettings(userId: string): any {
  const d = getDb();
  let row = d.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
  if (!row) {
    d.prepare("INSERT INTO user_settings (user_id, shift_start_time, theme) VALUES (?, '09:00', 'dark')").run(userId);
    row = d.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
  }
  return row;
}

export function updateUserSettings(userId: string, settings: Record<string, unknown>): any {
  const d = getDb();
  const fields = Object.keys(settings).filter(k => k !== "user_id");
  if (fields.length === 0) return getUserSettings(userId);

  const setClause = fields.map(f => `${f} = @${f}`).join(", ");
  d.prepare(`UPDATE user_settings SET ${setClause} WHERE user_id = @userId`).run({ userId, ...settings });
  return getUserSettings(userId);
}