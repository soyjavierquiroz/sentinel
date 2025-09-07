import fetch from "node-fetch";
import pkg from "pg";

const { Pool } = pkg;

// 🔑 Contraseña de Postgres desde env
const password = process.env.POSTGRES_PASSWORD || "SentinelP2P123!";

if (!password) {
  console.error("❌ No se encontró contraseña para Postgres.");
  process.exit(1);
}

// 🔌 Conexión a Postgres
const pool = new Pool({
  host: "sentinel-data_postgres",
  user: "sentinel",
  database: "sentinel",
  password,
  port: 5432
});

const API_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

// 🚨 Parámetros de filtros
const MIN_ORDERS = 30;
const MIN_FINISH_RATE = 0.8;
const MIN_BOB = 1000;
const MAX_BOB = 7000;

async function getBestPrice(tradeType = "BUY") {
  const params = {
    asset: "USDT",
    fiat: "BOB",
    tradeType,
    page: 1,
    rows: 20,
    payTypes: [],
    order: "price",
    sortType: "asc"
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0"
    },
    body: JSON.stringify(params)
  });

  const json = await res.json();
  if (!json.data || json.data.length === 0) {
    console.log(`⚠️ No hay anuncios para ${tradeType}`);
    return { best: null, meta: [] };
  }

  // 🛡️ Filtrar anuncios válidos
  const valid = json.data.filter(item => {
    const adv = item.adv;
    const trader = item.advertiser;
    const min = parseFloat(adv.minSingleTransAmount);
    const max = parseFloat(adv.maxSingleTransAmount);

    return (
      trader.monthOrderCount >= MIN_ORDERS &&
      trader.monthFinishRate >= MIN_FINISH_RATE &&
      min <= MAX_BOB &&
      max >= MIN_BOB
    );
  });

  if (valid.length === 0) {
    console.log(`⚠️ No hay anuncios válidos para ${tradeType}`);
    return { best: null, meta: [] };
  }

  return {
    best: parseFloat(valid[0].adv.price),
    meta: valid.slice(0, 3) // top 3 válidos
  };
}

async function collectAndStore() {
  try {
    console.log("🔄 Iniciando ciclo de captura...");

    const buy = await getBestPrice("BUY");
    const sell = await getBestPrice("SELL");

    if (!buy.best || !sell.best) {
      console.log("⚠️ No se pudo obtener buy/sell");
      return;
    }

    const mid_price = (buy.best + sell.best) / 2;
    const spread_pct = ((sell.best - buy.best) / mid_price) * 100;

    await pool.query(
      `INSERT INTO p2p_ticks (asset, fiat, buy_best, sell_best, mid_price, spread_pct, meta_buy, meta_sell)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        "USDT",
        "BOB",
        buy.best,
        sell.best,
        mid_price,
        spread_pct,
        JSON.stringify(buy.meta),
        JSON.stringify(sell.meta)
      ]
    );

    console.log(
      `✅ Tick guardado: buy=${buy.best}, sell=${sell.best}, spread=${spread_pct.toFixed(
        2
      )}%`
    );
  } catch (err) {
    console.error("❌ Error en collector:", err.message);
  }
}

// ▶️ Loop infinito cada 60s
setInterval(collectAndStore, 60 * 1000);

// ▶️ Primera ejecución inmediata
collectAndStore();
