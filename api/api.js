
// Health
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "sentinel-api", ts: new Date().toISOString() });
});

// Último tick
app.get("/last-tick", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM p2p_ticks ORDER BY ts DESC LIMIT 1"
    );
    res.json({ ok: true, data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Histórico de ticks
app.get("/ticks", async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  try {
    const { rows } = await pool.query(
      "SELECT * FROM p2p_ticks ORDER BY ts DESC LIMIT $1",
      [limit]
    );
    res.json({ ok: true, data: rows.reverse() }); // invertimos para ir de más viejo → más nuevo
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Posición actual
app.get("/position", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM positions ORDER BY opened_at DESC LIMIT 1"
    );
    res.json({ ok: true, data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Últimos trades
app.get("/trades", async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const { rows } = await pool.query(
      "SELECT * FROM trades ORDER BY ts DESC LIMIT $1",
      [limit]
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Resumen de PnL
app.get("/pnl/summary", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COALESCE(SUM(pnl),0) as total_pnl,
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winners,
        SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losers
      FROM trades
    `);
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Arranque
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ sentinel-api escuchando en :${PORT}`);
});
