import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import {
  getDb, createUser, verifyUser, getUserById,
  getOrCreateMonthData, updateMonthData,
  getTickets, addTicket, deleteTicket,
  getGenesysTickets, addGenesysTicket, deleteGenesysTicket,
  getDailyChanges, addDailyChange,
  getDailyShifts, upsertDailyShift,
  getUserSettings, updateUserSettings,
} from "./database";

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "green-tab-secret-key-change-in-production";

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

// Initialize DB on startup
getDb().then(() => console.log("Database initialized")).catch(console.error);

// ---- Auth Middleware ----
interface AuthRequest extends express.Request {
  userId: string;
}

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const token = authHeader.substring(7);
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    (req as AuthRequest).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ---- Auth Routes ----
app.post("/api/auth/signup", async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) {
    res.status(400).json({ error: "Email, username, and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const result = await createUser(email, username, password);
  if ("error" in result) {
    res.status(409).json({ error: result.error });
    return;
  }
  const token = jwt.sign({ userId: result.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ user: result, token });
});

app.post("/api/auth/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const user = await verifyUser(email, password);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ user, token });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const user = await getUserById(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user });
});

// ---- Month Data Routes ----
app.get("/api/performance/:year/:month", authMiddleware, async (req, res) => {
  const year = parseInt(req.params.year as string);
  const month = parseInt(req.params.month as string);
  const userId = (req as AuthRequest).userId;

  const monthData = await getOrCreateMonthData(userId, year, month);
  const tickets = await getTickets(monthData.id as string);
  const genesysTickets = await getGenesysTickets(monthData.id as string);
  const changes = await getDailyChanges(monthData.id as string);

  res.json({
    ...monthData,
    goodByChannel: { phone: monthData.good_phone, chat: monthData.good_chat, email: monthData.good_email },
    badByChannel: { phone: monthData.bad_phone, chat: monthData.bad_chat, email: monthData.bad_email },
    offDays: JSON.parse((monthData.off_days as string) || "[]"),
    tickets,
    genesysTickets,
    dailyChanges: changes,
  });
});

app.put("/api/performance/:year/:month", authMiddleware, async (req, res) => {
  const year = parseInt(req.params.year as string);
  const month = parseInt(req.params.month as string);
  const userId = (req as AuthRequest).userId;

  const monthData = await getOrCreateMonthData(userId, year, month);
  const { goodByChannel, badByChannel, offDays, tickets, genesysTickets, dailyChanges, ...fields } = req.body;

  if (goodByChannel) {
    fields.good_phone = goodByChannel.phone || 0;
    fields.good_chat = goodByChannel.chat || 0;
    fields.good_email = goodByChannel.email || 0;
  }
  if (badByChannel) {
    fields.bad_phone = badByChannel.phone || 0;
    fields.bad_chat = badByChannel.chat || 0;
    fields.bad_email = badByChannel.email || 0;
  }
  if (offDays) {
    fields.off_days = JSON.stringify(offDays);
  }

  const updated = await updateMonthData(monthData.id as string, fields);
  res.json(updated);
});

// ---- Tickets Routes ----
app.post("/api/tickets/:monthDataId", authMiddleware, async (req, res) => {
  const monthDataId = req.params.monthDataId as string;
  const ticket = await addTicket(monthDataId, req.body);
  res.json(ticket);
});

app.delete("/api/tickets/:ticketId", authMiddleware, async (req, res) => {
  const ticketId = req.params.ticketId as string;
  const ok = await deleteTicket(ticketId);
  ok ? res.json({ success: true }) : res.status(404).json({ error: "Ticket not found" });
});

// ---- Genesys Tickets Routes ----
app.post("/api/genesys-tickets/:monthDataId", authMiddleware, async (req, res) => {
  const monthDataId = req.params.monthDataId as string;
  const ticket = await addGenesysTicket(monthDataId, req.body);
  res.json(ticket);
});

app.delete("/api/genesys-tickets/:ticketId", authMiddleware, async (req, res) => {
  const ticketId = req.params.ticketId as string;
  const ok = await deleteGenesysTicket(ticketId);
  ok ? res.json({ success: true }) : res.status(404).json({ error: "Ticket not found" });
});

// ---- Daily Changes Routes ----
app.post("/api/daily-changes/:monthDataId", authMiddleware, async (req, res) => {
  const monthDataId = req.params.monthDataId as string;
  const change = await addDailyChange(monthDataId, req.body);
  res.json(change);
});

// ---- Daily Shifts Routes ----
app.get("/api/shifts", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const yearMonth = req.query.yearMonth as string | undefined;
  const shifts = await getDailyShifts(userId, yearMonth);
  res.json(shifts);
});

app.post("/api/shifts", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const shift = await upsertDailyShift(userId, req.body);
  res.json(shift);
});

// ---- User Settings Routes ----
app.get("/api/settings", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const settings = await getUserSettings(userId);
  res.json(settings);
});

app.put("/api/settings", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const settings = await updateUserSettings(userId, req.body);
  res.json(settings);
});

// ---- Health Check ----
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🟢 Green Tab API running on port ${PORT}`);
});