-- positions: estado de posición demo (una abierta a la vez)
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  status VARCHAR(10) NOT NULL,               -- OPEN | CLOSED
  avg_price_bob NUMERIC(18,6) NOT NULL,      -- precio promedio
  qty_usdt NUMERIC(18,6) NOT NULL,           -- tamaño total USDT
  max_price_since_entry NUMERIC(18,6),       -- para trailing
  adds_count INT DEFAULT 0,                  -- adds ejecutados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
