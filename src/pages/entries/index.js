import React, { useEffect } from "react";
import CoinStats from "../../components/CoinStats";
import PnLMarplot from "../../components/PnLMarplot";
import PnLWinRatePie from "../../components/PnLWinRatePie";
import EquityCurve from "../../components/EquityCurve";
import MaxDrawdown from "../../components/MaxDrawdown";
import AICryptoHero from "../../components/AICryptoHero";
import CoinsLayer from "../../components/CoinsLayer";
import "./style.css";
import { sendEvent } from "../../analytics";

const ALL_SYMBOLS = [
  "ADAUSDT",
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "PEPEUSDT",
  "TRUMPUSDT",
];

export const Entries = () => {
  useEffect(() => {
    sendEvent({
      action: "view_entries",
      category: "engagement",
      label: "Entries – AI Crypto Strategy",
    });
  }, []);

  return (
    <>
      {/* Global animated background */}
      <div className="page-bg animated-gradient" />
      <div className="page-spotlight" />
      <CoinsLayer />
      <AICryptoHero />

      {/* Extra right padding so contact links stay visible */}
      <main className="app-shell app-shell--wide">
        {/* Top row: left = Win Rate, right = Equity Curve (wide) + Max Drawdown */}
        <section className="split-panels metrics-section">
          {/* LEFT column (same width as PnL by Symbol) */}
          <div className="panel panel--bar">
            <div className="panel__body panel__body--fill">
              <PnLWinRatePie
                symbols={ALL_SYMBOLS}
                exchange="binance"
                db="coin-stats"
              />
            </div>
          </div>

          {/* RIGHT column: transparent panel, EquityCurve wide + MaxDrawdown to the right */}
          <div className="panel panel--candle panel--transparent">
            <div className="panel__body panel__body--fill metrics-right">
              <div className="metrics-right__equity">
                <EquityCurve
                  symbols={ALL_SYMBOLS}
                  exchange="binance"
                  db="coin-stats"
                  startingBalance={1000}
                />
              </div>
              <div className="metrics-right__drawdown">
                <MaxDrawdown
                  symbols={ALL_SYMBOLS}
                  exchange="binance"
                  db="coin-stats"
                  startingBalance={100}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Bottom: 30% bar chart | 70% candlestick */}
        <section className="split-panels">
          <div className="panel panel--bar">
            <div className="panel__body panel__body--fill">
              <PnLMarplot
                symbols={ALL_SYMBOLS}
                exchange="binance"
                db="coin-stats"
                height={520}
              />
            </div>
          </div>

          <div className="panel panel--candle">
            <div className="panel__body panel__body--fill">
              <CoinStats
                initialSymbol="ETHUSDT"
                initialInterval="1h"
                height={550}
              />
            </div>
          </div>
        </section>
      </main>
    </>
  );
};
