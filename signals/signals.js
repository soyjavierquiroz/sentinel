import pkg from "pg";
import fetch from "node-fetch";
import fs from "fs";
import cron from "node-cron";

const { Pool } = pkg;

/* ================================
   Config (ENV con defaults)
================================= */
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "SentinelP2P123!";
const QTY_USDT_BASE = parseFloat(process.env.QTY_USDT_BASE || "500"); // tamaño por add
const TRAIL_PCT = parseFloat(process.env.TRAIL_PCT || "0.015");       // 1.5%
const ADD_STEP_PCT = parseFloat(process.env.ADD_STEP_PCT || "0.008");  // +0.8% por add
const MAX_ADDS = parseInt(process.env.MAX_ADDS || "3", 10);            // 3 adds
const SPREAD_CAP_FOR_ADD = parseFloat(process.env.SPREAD_CAP_FOR_ADD || "1.0"); // 1.0%

/* ================================
   Postgres + Telegram
================================= */
const pool = new Pool({
  host: "sentinel-data_postgres",
  user: "sentinel",
  database: "sentinel",
  password: POSTGRES_PASSWORD,
  port: 5432
});

let telegramToken = process.env.TELEGRAM_BOT_TOKEN || null;
let telegramChatId = process.env.TELEGRAM_CHAT_ID || null;

if (!telegramToken && process.env.TELEGRAM_BOT_TOKEN_FILE) {
  telegramToken = fs.readFileSync(process.env.TELEGRAM_BOT_TOKEN_FILE, "utf-8").trim();
}
if (!telegramChatId && process.env.TELEGRAM_CHAT_ID_FILE) {
  telegramChatId = fs.readFileSync(process.env.TELEGRAM_CHAT_ID_FILE, "utf-8").trim();
}

/* ================================
   Utils
================================= */
function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function stdev(vals) {
  if (vals.length < 2) return 0;
  const m = vals.reduce((a,b)=>a+b,0)/vals.length;
  const v = vals.reduce((a,x)=>a+(x-m)*(x-m),0)/(vals.length-1);
  return Math.sqrt(v);
}

async function sendTelegram(message) {
  if (!telegramToken || !telegramChatId) return;
  try {
    const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramChatId, text: message })
    });
    const json = await res.json();
    if (!json.ok) console.error("❌ Telegram:", json);
  } catch (e) {
    console.error("❌ Telegram error:", e.message);
  }
}

/* ================================
   DB helpers
================================= */
async function getOpenPosition() {
  const r = await pool.query(`SELECT * FROM positions WHERE status='OPEN' ORDER BY id DESC LIMIT 1`);
  return r.rows[0] || null;
}

async function createPosition(entryPrice, qty) {
  const r = await pool.query(
    `INSERT INTO positions (status, avg_price_bob, qty_usdt, max_price_since_entry, adds_count)
     VALUES ('OPEN',$1,$2,$1,0) RETURNING *`,
    [entryPrice, qty]
  );
  return r.rows[0];
}

async function updatePosition(id, fields) {
  const cols = [];
  const vals = [];
  let idx = 1;
  for (const [k,v] of Object.entries(fields)) { cols.push(`${k}=$${idx++}`); vals.push(v); }
  vals.push(id);
  await pool.query(`UPDATE positions SET ${cols.join(", ")}, updated_at=NOW() WHERE id=$${idx}`, vals);
}

async function closePosition(pos, exitPrice) {
  const costIn = pos.avg_price_bob * pos.qty_usdt;
  const costOut = exitPrice * pos.qty_usdt;
  const pnl_bob = costOut - costIn;
  const pnl_pct = (pnl_bob / costIn) * 100;

  await updatePosition(pos.id, { status: 'CLOSED' });

  // registrar salida en trades_demo (venta)
  await pool.query(
    `INSERT INTO trades_demo (side, qty_usdt, price_bob, cost_bob, pnl_bob, pnl_pct, ref_trade_id, note)
     VALUES ('SELL',$1,$2,$3,$4,$5,$6,$7)`,
    [pos.qty_usdt, exitPrice, costOut, pnl_bob, pnl_pct, pos.id, 'Cierre por trailing/failsafe']
  );

  await sendTelegram(
    `🔻 EXIT\nQty: ${pos.qty_usdt} USDT\nPrecio: ${exitPrice.toFixed(4)} Bs\nP&L: ${pnl_bob.toFixed(2)} Bs (${pnl_pct.toFixed(2)}%)`
  );
}

/* ================================
   Lógica de momentum / adds / trailing
================================= */
async function detectSignals() {
  try {
    console.log("🔍 Evaluando señales...");

    // 60 min de datos para EMAs y breakout
    const { rows } = await pool.query(
      `SELECT ts, mid_price, spread_pct
       FROM p2p_ticks
       WHERE ts > NOW() - interval '60 minutes'
       ORDER BY ts ASC`
    );
    if (rows.length < 10) { console.log("⚠️ Pocos datos"); return; }

    const prices = rows.map(r => parseFloat(r.mid_price));
    const spreads = rows.map(r => parseFloat(r.spread_pct ?? 0));
    const last = prices[prices.length - 1];
    const lastSpread = spreads[spreads.length - 1];

    // EMAs
    const ema1 = calcEMA(prices, 1);
    const ema3 = calcEMA(prices, 3);
    const ema5 = calcEMA(prices, 5);

    // breakout: max 45m
    const win = rows.filter(r => true).slice(-45); // aprox últimos 45 registros
    const max45 = Math.max(...prices.slice(-Math.min(45, prices.length)));
    const breakout = last >= max45 * 1.002; // +0.2%

    // ruido bajo
    const vol = stdev(prices.slice(-5)) / (ema3 || last) * 100; // %
    const lowNoise = vol <= 0.2;

    // momentum sostenido (orden de medias)
    const momentum = (ema1 && ema3 && ema5) && (ema1 > ema3 && ema3 > ema5);

    let pos = await getOpenPosition();

    // ===== Sin posición: abrir si hay momentum y breakout =====
    if (!pos) {
      if (momentum && breakout && lowNoise) {
        pos = await createPosition(last, QTY_USDT_BASE);
        await pool.query(
          `INSERT INTO trades_demo (side, qty_usdt, price_bob, cost_bob, pnl_bob, pnl_pct, ref_trade_id, note)
           VALUES ('BUY',$1,$2,$3,NULL,NULL,$4,$5)`,
          [QTY_USDT_BASE, last, QTY_USDT_BASE * last, pos.id, 'Entrada momentum']
        );
        await sendTelegram(`✅ ENTRY\nQty: ${QTY_USDT_BASE} USDT\nPrecio: ${last.toFixed(4)} Bs\nTRAIL: ${(TRAIL_PCT*100).toFixed(2)}%`);
      } else {
        console.log(`ℹ️ Sin entrada. last=${last.toFixed(4)} ema1=${ema1?.toFixed(4)} ema3=${ema3?.toFixed(4)} ema5=${ema5?.toFixed(4)}`);
      }
      return;
    }

    // ===== Con posición: actualizar trailing y evaluar add/exit =====
    const maxPrice = Math.max(pos.max_price_since_entry || pos.avg_price_bob, last);
    const trailingStop = maxPrice * (1 - TRAIL_PCT);

    // actualizar max_price
    if (maxPrice !== pos.max_price_since_entry) {
      await updatePosition(pos.id, { max_price_since_entry: maxPrice });
    }

    // EXIT por trailing o fail-safe medias
    const failSafe = (ema1 && ema3) ? (ema1 < ema3) : false;
    if (last <= trailingStop || failSafe) {
      await closePosition({ ...pos, max_price_since_entry: maxPrice }, last);
      return;
    }

    // ADD: escalera en +0.8% por add, con spread bajo y momentum vigente
    if (pos.adds_count < MAX_ADDS && momentum && lastSpread <= SPREAD_CAP_FOR_ADD) {
      const nextLevel = pos.avg_price_bob * (1 + ADD_STEP_PCT * (pos.adds_count + 1));
      if (last >= nextLevel) {
        const newQty = pos.qty_usdt + QTY_USDT_BASE;
        const newAvg = (pos.avg_price_bob * pos.qty_usdt + last * QTY_USDT_BASE) / newQty;
        await pool.query(
          `INSERT INTO trades_demo (side, qty_usdt, price_bob, cost_bob, pnl_bob, pnl_pct, ref_trade_id, note)
           VALUES ('BUY',$1,$2,$3,NULL,NULL,$4,$5)`,
          [QTY_USDT_BASE, last, QTY_USDT_BASE * last, pos.id, `Add #${pos.adds_count+1}`]
        );
        await updatePosition(pos.id, {
          avg_price_bob: newAvg,
          qty_usdt: newQty,
          adds_count: pos.adds_count + 1,
          max_price_since_entry: maxPrice
        });
        await sendTelegram(`➕ ADD #${pos.adds_count + 1}\nQty +${QTY_USDT_BASE} USDT (total ${newQty})\nPrecio: ${last.toFixed(4)} Bs\nNuevo avg: ${newAvg.toFixed(4)} Bs`);
        return;
      }
    }

    console.log(`📊 OPEN | avg=${pos.avg_price_bob.toFixed(4)} qty=${pos.qty_usdt} last=${last.toFixed(4)} max=${maxPrice.toFixed(4)} trail=${trailingStop.toFixed(4)} adds=${pos.adds_count}`);
  } catch (err) {
    console.error("❌ Error signals:", err.message);
  }
}

/* ================================
   Resumen diario 20:00 America/La_Paz
================================= */
async function dailySummary() {
  try {
    const { rows } = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE side='BUY') AS buys,
         COUNT(*) FILTER (WHERE side='SELL') AS sells,
         COALESCE(SUM(pnl_bob),0) AS pnl_bob,
         AVG(pnl_pct) FILTER (WHERE pnl_pct IS NOT NULL) AS avg_pct
       FROM trades_demo
       WHERE ts::date = NOW()::date`
    );
    const { rows: lastTick } = await pool.query(
      `SELECT mid_price FROM p2p_ticks ORDER BY ts DESC LIMIT 1`
    );
    const r = rows[0];
    const price = lastTick.length ? lastTick[0].mid_price : null;
    await sendTelegram(
      `📊 Resumen diario\n` +
      `💵 Último: ${price ?? "N/A"} Bs\n` +
      `🟢 BUY: ${r.buys} | 🔴 SELL: ${r.sells}\n` +
      `💰 P&L: ${parseFloat(r.pnl_bob).toFixed(2)} Bs | Prom: ${r.avg_pct ? r.avg_pct.toFixed(2)+"%" : "N/A"}`
    );
  } catch (e) {
    console.error("❌ Error resumen diario:", e.message);
  }
}

/* ================================
   Schedulers
================================= */
setInterval(detectSignals, 60 * 1000);
detectSignals();

cron.schedule("0 20 * * *", () => {
  console.log("📅 Resumen diario 20:00");
  dailySummary();
}, { timezone: "America/La_Paz" });
