import express from "express";
import cors from "cors";
import pkg from "pg";
import fs from "fs";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// ---- Config / Secrets ----
let password = process.env.POSTGRES_PASSWORD || null;
if (!password && process.env.POSTGRES_PASSWORD_FILE) {
  try {
    password = fs.readFileSync(process.env.POSTGRES_PASSWORD_FILE, "utf-8").trim();
  } catch (e) {
    console.error("❌ No pude leer POSTGRES_PASSWORD_FILE:", e.message);
  }
}

const pool = new Pool({
  host: process.env.PGHOST || "sentinel-data_postgres",
  user: process.env.PGUSER || "sentinel",
  database: process.env.PGDATABASE || "sentinel",
  password,
  port: parseInt(process.env.PGPORT || "5432", 10),
  max: 10,
  idleTimeoutMillis: 30_000
});

// ---- Endpoints ----
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "sentinel-api", ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/last-tick", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ts, asset, fiat, buy_best, sell_best, mid_price, spread_pct
       FROM p2p_ticks ORDER BY ts DESC LIMIT 1`
    );
    res.json({ ok: true, data: rows[0] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/position", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, status, avg_price_bob, qty_usdt, max_price_since_entry, adds_count,
              created_at, updated_at
       FROM positions
       WHERE status='OPEN'
       ORDER BY id DESC LIMIT 1`
    );
    res.json({ ok: true, data: rows[0] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/trades", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 200);
  try {
    const { rows } = await pool.query(
      `SELECT id, ts, side, qty_usdt, price_bob, cost_bob, pnl_bob, pnl_pct, ref_trade_id, note
       FROM trades_demo
       ORDER BY ts DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/pnl/summary", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE side='BUY') AS buys,
         COUNT(*) FILTER (WHERE side='SELL') AS sells,
         COALESCE(SUM(pnl_bob),0) AS pnl_bob,
         AVG(pnl_pct) FILTER (WHERE pnl_pct IS NOT NULL) AS avg_pct
       FROM trades_demo`
    );
    res.json({ ok: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Server ----
const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`✅ sentinel-api escuchando en :${PORT}`);
});
