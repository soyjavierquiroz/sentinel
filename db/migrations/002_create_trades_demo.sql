-- Tabla de operaciones demo (paper trading)
CREATE TABLE IF NOT EXISTS trades_demo (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMPTZ DEFAULT NOW(),     -- timestamp de la acción
    side VARCHAR(4) NOT NULL,         -- BUY o SELL
    qty_usdt NUMERIC(18,6) NOT NULL,  -- cantidad en USDT
    price_bob NUMERIC(18,6) NOT NULL, -- precio de ejecución en BOB
    cost_bob NUMERIC(18,2),           -- costo total (qty * price)
    pnl_bob NUMERIC(18,2),            -- ganancia/pérdida en Bs (solo en SELL)
    pnl_pct NUMERIC(6,3),             -- % de ganancia/pérdida (solo en SELL)
    ref_trade_id INT,                 -- referencia al trade de entrada (para SELL)
    note TEXT                         -- notas o metadata
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_trades_demo_ts ON trades_demo(ts);
CREATE INDEX IF NOT EXISTS idx_trades_demo_side ON trades_demo(side);
