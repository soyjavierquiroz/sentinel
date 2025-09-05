CREATE TABLE IF NOT EXISTS p2p_ticks (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    asset TEXT NOT NULL,
    fiat TEXT NOT NULL,

    buy_best NUMERIC(18, 6) NOT NULL,
    sell_best NUMERIC(18, 6) NOT NULL,
    mid_price NUMERIC(18, 6) NOT NULL,
    spread_pct NUMERIC(10, 6) NOT NULL,

    meta_buy JSONB,
    meta_sell JSONB
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_p2p_ticks_ts ON p2p_ticks(ts DESC);
CREATE INDEX IF NOT EXISTS idx_p2p_ticks_asset_fiat ON p2p_ticks(asset, fiat);
