"use client";

import { useState, useMemo } from "react";
import {
  usePlayerTotals,
  useP2PPrices,
  useSettlementTiles,
  useDiceHist,
  useRosters,
  useGames,
  PlayerTotals,
} from "@/lib/analysisData";
import { Pill, pillColorAt } from "@/components/Pill";
import {
  PricePerResource,
  DiceDistribution,
  SettlementResources,
  SettlementDiceNumbers,
  ExpectedProduction,
} from "@/app/analysis/page";

type Mode = "total" | "per_game";

const COLUMNS: { key: keyof PlayerTotals; label: string; percent?: boolean; keepAsRate?: boolean }[] = [
  { key: "games", label: "Games" },
  { key: "dev_cards_bought", label: "Dev Cards Bought" },
  { key: "dev_cards_played", label: "Dev Cards Played" },
  { key: "roads", label: "Roads" },
  { key: "settlements", label: "Settlements" },
  { key: "cities", label: "Cities" },
  { key: "longest_road_cards", label: "Longest Road Cards" },
  { key: "largest_army_cards", label: "Largest Army Cards" },
  { key: "trades_proposed", label: "Trades Proposed" },
  { key: "trades_accepted", label: "Successful Trades" },
  { key: "trade_completion_rate", label: "Trade Completion", percent: true, keepAsRate: true },
  { key: "bank_trades", label: "Bank Trades" },
  { key: "times_robbed_others", label: "Times Robbed Others" },
  { key: "resources_blocked", label: "Resources Blocked" },
  { key: "cards_lost_to_7", label: "Cards Lost to 7" },
  { key: "cards_from_rolls", label: "Resources From Rolls" },
  { key: "gained_lumber", label: "Wood" },
  { key: "gained_brick", label: "Brick" },
  { key: "gained_wool", label: "Sheep" },
  { key: "gained_grain", label: "Wheat" },
  { key: "gained_ore", label: "Ore" },
  { key: "luck_ratio", label: "Luck Ratio", keepAsRate: true },
];

export default function Home() {
  const { data, loading, error } = usePlayerTotals();
  const { data: prices } = useP2PPrices();
  const { data: tiles } = useSettlementTiles();
  const { data: dice } = useDiceHist();
  const { data: rosters } = useRosters();
  const { data: games } = useGames();
  const [mode, setMode] = useState<Mode>("total");
  const [sortKey, setSortKey] = useState<keyof PlayerTotals>("resources_used");
  const [sortDesc, setSortDesc] = useState(true);
  const [minGames, setMinGames] = useState(1);
  const maxGamesInData = useMemo(
    () => (data ? Math.max(1, ...data.map((p) => p.games)) : 1),
    [data]
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((p) => p.games >= minGames);
    const transformed = filtered.map((p) => {
      if (mode === "total") return p;
      // per-game — divide all numeric columns except games and the rate
      const out: Record<string, string | number | null> = { username: p.username, games: p.games };
      for (const c of COLUMNS) {
        if (c.key === "games") continue;
        const raw = p[c.key] as number | null;
        if (raw === null) { out[c.key as string] = null; continue; }
        if (c.keepAsRate) { out[c.key as string] = raw; continue; }
        out[c.key as string] = p.games > 0 ? Math.round((raw / p.games) * 100) / 100 : 0;
      }
      return out as unknown as PlayerTotals;
    });
    const sorted = [...transformed].sort((a, b) => {
      const av = (a[sortKey] as number | null) ?? -Infinity;
      const bv = (b[sortKey] as number | null) ?? -Infinity;
      if (sortKey === "username") {
        const diff = String(a.username).localeCompare(String(b.username));
        return sortDesc ? -diff : diff;
      }
      return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return sorted;
  }, [data, mode, sortKey, sortDesc, minGames]);

  const maxByCol = useMemo(() => {
    const out: Record<string, number> = {};
    if (!data) return out;
    for (const c of COLUMNS) {
      if (c.key === "games" || c.keepAsRate) continue;
      const vals = rows
        .filter((r) => r.games > 1)
        .map((r) => (r[c.key] as number | null) ?? 0)
        .filter((v) => Number.isFinite(v));
      out[c.key as string] = vals.length ? Math.max(...vals) : 0;
    }
    return out;
  }, [rows, data]);

  if (loading) return <div className="text-muted">Loading player data…</div>;
  if (error) return <div className="text-loss">Error: {error}</div>;
  if (!data) return null;

  function toggleSort(key: keyof PlayerTotals) {
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Statistics</h1>

      <Collapsible title="Summary Table" defaultOpen>
        <div className="p-5 space-y-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <p className="text-sm text-muted m-0">
              {rows.length} of {data.length} players · click any column header to sort. Greyed rows (Per Game view) = players with just one game.
            </p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-muted select-none whitespace-nowrap">
                Min games
                <input
                  type="number"
                  min={1}
                  max={maxGamesInData}
                  value={minGames}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setMinGames(Math.max(1, Math.min(maxGamesInData, Math.round(n))));
                  }}
                  className="w-14 px-2 py-1 rounded border-2 border-black bg-card text-black font-bold text-center"
                />
              </label>
              <div className="flex gap-2">
                {(["total", "per_game"] as const).map((m, i) => (
                  <Pill
                    key={m}
                    active={mode === m}
                    color={pillColorAt(i)}
                    onClick={() => setMode(m)}
                  >
                    {m === "total" ? "Total" : "Per Game"}
                  </Pill>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card border-2 border-black rounded-lg overflow-auto">
            <table className="w-full text-base">
          <thead className="bg-[#e5d4a3]">
            <tr>
              <Th label="Player" active={sortKey === "username"} desc={sortDesc} onClick={() => toggleSort("username")} sticky />
              {COLUMNS.map((c) => (
                <Th
                  key={c.key}
                  label={c.label}
                  active={sortKey === c.key}
                  desc={sortDesc}
                  onClick={() => toggleSort(c.key)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const greyRow = mode === "per_game" && r.games <= 1;
              return (
                <tr
                  key={r.username}
                  className={`border-t border-card-border ${greyRow ? "bg-[#eae4d4] text-muted italic" : "hover:bg-[#faf5e4]"}`}
                >
                  <td className="px-3 py-3 font-extrabold text-black text-left sticky left-0 bg-card">
                    {r.username}
                  </td>
                  {COLUMNS.map((c) => {
                    const v = r[c.key] as number | null;
                    let display: string;
                    if (v === null || v === undefined) display = "–";
                    else if (c.key === "luck_ratio") {
                      const pct = Math.round(((v as number) - 1) * 100);
                      display = `${pct >= 0 ? "+" : ""}${pct}%`;
                    } else if (c.percent) display = `${Math.round((v as number) * 100)}%`;
                    else display = `${v}`;
                    const mx = maxByCol[c.key as string] ?? 0;
                    const frac = !greyRow && mx > 0 ? Math.min((v ?? 0) / mx, 1) : 0;
                    let bg: string | undefined;
                    if (greyRow || c.key === "games") {
                      bg = undefined;
                    } else if (c.key === "luck_ratio") {
                      // Symmetric: green for lucky (>1), red for unlucky (<1)
                      const dev = Math.max(-0.2, Math.min(0.2, ((v ?? 1) - 1))) / 0.2;
                      if (v === null || v === undefined) bg = undefined;
                      else if (dev >= 0) bg = `rgba(81, 125, 25, ${(dev * 0.45).toFixed(2)})`;
                      else bg = `rgba(176, 64, 48, ${(-dev * 0.45).toFixed(2)})`;
                    } else {
                      bg = `rgba(81, 125, 25, ${(frac * 0.45).toFixed(2)})`;
                    }
                    const cellClass = `px-3 py-3 text-center text-black font-bold${
                      greyRow && c.key === "games" ? " bg-card not-italic" : ""
                    }`;
                    return (
                      <td
                        key={c.key}
                        className={cellClass}
                        style={{ background: bg }}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
              </tbody>
            </table>
          </div>

          <details className="text-sm text-muted">
            <summary className="cursor-pointer hover:text-accent">Column meanings</summary>
            <ul className="mt-3 space-y-1 list-disc pl-5">
              <li><b>Trades Accepted</b> — offers this player proposed that someone else accepted</li>
              <li><b>Trade Completion</b> — Trades Accepted / Trades Proposed</li>
              <li><b>Times Robbed Others</b> — times this player placed the robber and stole a card</li>
              <li><b>Resources Blocked</b> — times a tile of theirs would have produced but the robber was on it</li>
              <li><b>Cards Lost to 7</b> — total cards discarded on 7-rolls</li>
              <li><b>Resources From Rolls</b> — total resource cards received from dice rolls</li>
              <li><b>Longest Road Cards</b> — games this player ended holding the Longest Road bonus</li>
              <li><b>Largest Army Cards</b> — games this player ended holding the Largest Army bonus</li>
              <li><b>Luck Ratio</b> — (cards from rolls) ÷ (expected cards from rolls), where expected accounts for pips × turns-alive, city doublings, and robber blocks. +5% means they got 5% more than expected. Ratio across all games — identical in Total and Per Game views since it&apos;s a rate, not a count.</li>
            </ul>
          </details>
        </div>
      </Collapsible>

      {prices && rosters && (
        <Collapsible title="Average P2P Trade Price per Resource">
          <PricePerResource prices={prices} rosters={rosters} />
        </Collapsible>
      )}

      {dice && (
        <Collapsible title="Dice-Roll Distribution">
          <DiceDistribution dice={dice} />
        </Collapsible>
      )}

      {tiles && rosters && (
        <Collapsible title="Resources Adjacent to Initial Settlements">
          <SettlementResources tiles={tiles} rosters={rosters} />
        </Collapsible>
      )}

      {tiles && rosters && (
        <Collapsible title="Dice Numbers of Initial Settlement Tiles">
          <SettlementDiceNumbers tiles={tiles} rosters={rosters} />
        </Collapsible>
      )}

      {tiles && rosters && games && (
        <Collapsible title="Expected Production per Settlement">
          <ExpectedProduction tiles={tiles} rosters={rosters} games={games} />
        </Collapsible>
      )}
    </div>
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group bg-card border-[3px] border-black rounded-lg overflow-hidden"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none flex items-center justify-between px-5 py-4 text-xl md:text-2xl font-extrabold tracking-tight hover:bg-[#d8e5bf] transition-colors">
        <span>{title}</span>
        <span className="text-accent text-2xl font-black transition-transform group-open:rotate-90 select-none">
          ▸
        </span>
      </summary>
      <div className="border-t-[3px] border-black">{children}</div>
    </details>
  );
}

function Th({
  label,
  active,
  desc,
  onClick,
  sticky,
}: {
  label: string;
  active: boolean;
  desc: boolean;
  onClick: () => void;
  sticky?: boolean;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-3 text-sm font-extrabold uppercase tracking-wide text-black cursor-pointer select-none whitespace-nowrap hover:text-accent ${
        sticky ? "sticky left-0 bg-[#e5d4a3] text-left" : "text-center"
      }`}
    >
      {label}
      {active && <span className="ml-1 text-accent">{desc ? "↓" : "↑"}</span>}
    </th>
  );
}
