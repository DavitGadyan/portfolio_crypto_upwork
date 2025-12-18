import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_SYMBOLS = [
  "ADAUSDT",
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "PEPEUSDT",
  "TRUMPUSDT",
];

const DEFAULT_COLORS = {
  bg: "#0b1220",
  grid: "#1f2a44",
  text: "#cbd5e1",
  pos: "#22c55e",
  neg: "#ef4444",
  linePos: "#22c55e",
  lineNeg: "#ef4444",
};

// Helper: convert various timestamp formats -> seconds
function toSec(v) {
  if (v == null) return undefined;
  if (typeof v === "number") {
    // treat 13-digit as ms
    if (v > 2_000_000_000_000) return Math.floor(v / 1000);
    return v; // already seconds
  }
  const s = String(v);
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000); // ms
  if (/^\d{10}$/.test(s)) return Number(s); // sec
  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

// Helper: pick "close time" from trade (raw Firestore object)
function getCloseSec(t) {
  return (
    toSec(t.close_timestamp) ??
    toSec(t.exit) ??
    toSec(t.close_time) ??
    toSec(t.timestamp) ??
    toSec(t.entry_timestamp)
  );
}

// Helper: pick P&L for trade (prefers real_profit_loss)
function getPL(t) {
  // 1) real_profit_loss
  if (typeof t.real_profit_loss === "number") return t.real_profit_loss;
  if (t.real_profit_loss != null) {
    const v = Number(t.real_profit_loss);
    if (Number.isFinite(v)) return v;
  }

  // 2) real_net_profit_loss
  if (typeof t.real_net_profit_loss === "number") return t.real_net_profit_loss;
  if (t.real_net_profit_loss != null) {
    const v = Number(t.real_net_profit_loss);
    if (Number.isFinite(v)) return v;
  }

  // 3) real_net_pnl
  if (typeof t.real_net_pnl === "number") return t.real_net_pnl;
  if (t.real_net_pnl != null) {
    const v = Number(t.real_net_pnl);
    if (Number.isFinite(v)) return v;
  }

  // 4) real_pnl
  if (typeof t.real_pnl === "number") return t.real_pnl;
  if (t.real_pnl != null) {
    const v = Number(t.real_pnl);
    if (Number.isFinite(v)) return v;
  }

  return undefined;
}

/**
 * EquityCurve (Daily combined equity)
 * -----------------------------------
 * - Fetches ALL trades for given symbols from /api/coin-stats/raw
 * - Uses: real_profit_loss (preferred), then real_net_profit_loss, real_net_pnl, real_pnl
 * - Groups trades by close day (UTC) and sums daily PL
 * - Builds equity curve starting from startingBalance (default 100)
 * - Renders SVG line chart
 * - Shows ONLY "Net PnL: xxx"
 */
export default function EquityCurve({
  symbols = DEFAULT_SYMBOLS,
  exchange = "binance",
  db,
  height = 260,
  width = 520,
  startingBalance = 1000,
  palette = {},
}) {
  const colors = useMemo(() => ({ ...DEFAULT_COLORS, ...palette }), [palette]);
  const [points, setPoints] = useState([]); // [{ date, equity }]
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const API_BASE = process.env.REACT_APP_API_BASE || "";

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      setErr("");

      const dailyPL = {}; // { 'YYYY-MM-DD': sum(PL) }

      try {
        await Promise.all(
          symbols.map(async (sym) => {
            const qs = new URLSearchParams({ exchange, symbol: sym });
            if (db) qs.set("db", db); // currently ignored by server, but harmless

            const url = `${API_BASE}/api/coin-stats/raw?${qs.toString()}`;
            const res = await fetch(url);

            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

            const json = await res.json();
            const trades = Array.isArray(json.trades) ? json.trades : [];

            for (const t of trades) {
              const ctSec = getCloseSec(t);
              if (!Number.isFinite(ctSec)) continue;

              const pl = getPL(t);
              if (!Number.isFinite(pl)) continue;

              const d = new Date(ctSec * 1000);
              const day = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
              dailyPL[day] = (dailyPL[day] || 0) + pl;
            }
          })
        );

        const days = Object.keys(dailyPL).sort();
        const pts = [];
        let equity = startingBalance;

        for (const day of days) {
          equity += dailyPL[day];
          pts.push({ date: day, equity });
        }

        if (!cancelled) {
          setPoints(pts);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(","), exchange, db, startingBalance]);

  const hasData = points.length > 0;

  // Derive equity metrics
  let minEq = startingBalance;
  let maxEq = startingBalance;
  let finalEq = startingBalance;

  if (hasData) {
    const vals = points.map((p) => p.equity);
    minEq = Math.min(...vals);
    maxEq = Math.max(...vals);
    finalEq = points[points.length - 1].equity;
  }

  const netPnl = finalEq - startingBalance;
  const netPositive = netPnl >= 0;

  // Chart geometry
  const paddingLeft = 40;
  const paddingRight = 12;
  const paddingTop = 16;
  const paddingBottom = 32;

  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  const getX = (index) => {
    if (points.length <= 1) return paddingLeft + innerWidth / 2;
    const step = innerWidth / (points.length - 1);
    return paddingLeft + index * step;
  };

  const getY = (eq) => {
    let min = minEq;
    let max = maxEq;
    if (max - min < 1e-6) max = min + 1; // avoid division by zero
    const norm = (eq - min) / (max - min); // 0..1
    return paddingTop + (1 - norm) * innerHeight;
  };

  let pathD = "";
  if (hasData) {
    pathD = points
      .map((p, idx) => {
        const x = getX(idx);
        const y = getY(p.equity);
        return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }

  const css = `
  .pnlLine-wrap{
    background:${colors.bg};
    color:${colors.text};
    border:1px solid #1e293b;
    border-radius:14px;
    overflow:hidden;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
  }
  .pnlLine-toolbar{
    display:flex;
    align-items:center;
    padding:10px 12px;
    border-bottom:1px solid #1e293b;
    background:linear-gradient(180deg,#111a2e,#0e1628);
  }
  .pnlLine-title{
    font-weight:700;
    font-size:14px;
    opacity:.9;
  }
  .pnlLine-status{
    margin-left:auto;
    font-size:12px;
    opacity:.8;
  }
  .pnlLine-body{
    padding:10px;
  }
  .pnlLine-empty{
    font-size:13px;
    opacity:.8;
    padding:20px 0;
    text-align:center;
  }
  .pnlLine-legend{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    margin-top:8px;
    font-size:12px;
  }
  .pill{
    border-radius:9999px;
    padding:2px 10px;
    border:1px solid #334155;
    background:#0f172a;
  }
  .pill.pos{
    color:#16a34a;
    border-color:#14532d;
    background:rgba(34,197,94,.1);
  }
  .pill.neg{
    color:#ef4444;
    border-color:#7f1d1d;
    background:rgba(239,68,68,.1);
  }
  .axisLabel{
    font-size:11px;
    fill:${colors.text};
    opacity:.7;
  }
  `;

  return (
    <div className="pnlLine-wrap">
      <style>{css}</style>

      <div className="pnlLine-toolbar">
        <div className="pnlLine-title">Equity Curve (Daily)</div>
        <div className="pnlLine-status">
          {loading ? (
            "Loading…"
          ) : err ? (
            <span style={{ color: "#fca5a5" }}>{err}</span>
          ) : null}
        </div>
      </div>

      <div className="pnlLine-body">
        {!hasData ? (
          <div className="pnlLine-empty">No trades available.</div>
        ) : (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Daily equity curve"
          >
            {/* background */}
            <rect x="0" y="0" width={width} height={height} fill={colors.bg} />

            {/* reference line at starting balance if within range */}
            {minEq <= startingBalance && startingBalance <= maxEq && (
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={getY(startingBalance)}
                y2={getY(startingBalance)}
                stroke={colors.grid}
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.7"
              />
            )}

            {/* equity curve */}
            <path
              d={pathD}
              fill="none"
              stroke={netPositive ? colors.linePos : colors.lineNeg}
              strokeWidth="2"
            />

            {/* final point marker */}
            <circle
              cx={getX(points.length - 1)}
              cy={getY(finalEq)}
              r="3"
              fill={netPositive ? colors.pos : colors.neg}
            />

            {/* x-axis date labels */}
            {points.map((p, idx) => {
              const x = getX(idx);
              const y = height - 8;
              return (
                <text
                  key={p.date}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  className="axisLabel"
                >
                  {p.date.slice(5)} {/* MM-DD */}
                </text>
              );
            })}
          </svg>
        )}

        <div className="pnlLine-legend">
          <span className={`pill ${netPositive ? "pos" : "neg"}`}>
            Net PnL: {netPositive ? "+" : ""}
            {netPnl.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}
