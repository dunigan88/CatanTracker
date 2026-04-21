"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import {
  useGames,
  useRosters,
  useStandings,
  useVPTimeline,
  useResourceCum,
  useSettlementTiles,
  useCityUpgrades,
  useRobberMoves,
  COLONIST_COLORS,
  formatDuration,
} from "@/lib/analysisData";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Pill, pillColorAt } from "@/components/Pill";

type View = "summary" | "vp" | "resources";

export default function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { data: games } = useGames();
  const { data: rosters } = useRosters();
  const { data: standings } = useStandings();
  const { data: vpData } = useVPTimeline();
  const { data: resData } = useResourceCum();
  const { data: settleTiles } = useSettlementTiles();
  const { data: cityUpgrades } = useCityUpgrades();
  const { data: robberMoves } = useRobberMoves();
  const [view, setView] = useState<View>("summary");

  if (!games || !rosters || !standings || !vpData || !resData || !settleTiles || !cityUpgrades || !robberMoves) {
    return <div className="text-muted">Loading game…</div>;
  }

  const game = games.find((g) => g.game_id === gameId);
  if (!game) return <div className="text-loss">Game not found.</div>;

  const gamePlayers = rosters.filter((r) => r.game_id === gameId);
  const gameStandings = standings.filter((s) => s.game_id === gameId);
  const winner = gameStandings.find((s) => s.won);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <Link href="/calendar" className="text-muted hover:text-accent">← Calendar</Link>
        <span className="text-muted">·</span>
        <Link href="/records" className="text-muted hover:text-accent">Records</Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          {format(parseISO(game.start_time), "MMMM d, yyyy 'at' h:mm a")}
        </h1>
        <div className="text-sm text-muted flex items-center gap-4 flex-wrap">
          <span>{game.total_turns} turns</span>
          <span>{formatDuration(game.duration_s)}</span>
          <span>Play to {game.vp_to_win} VP</span>
          {game.is_discord && <span className="text-accent">Discord</span>}
          {game.is_ranked && <span className="text-accent">Ranked</span>}
        </div>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          {gameStandings
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((s) => {
              const player = gamePlayers.find((p) => p.player_color === s.player_color);
              return (
                <span
                  key={s.player_color}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-card rounded-lg border border-card-border"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-black/40"
                    style={{ background: COLONIST_COLORS[s.player_color] }}
                  />
                  <span className={s.won ? "font-bold text-accent" : ""}>{player?.username}</span>
                  <span className="text-muted">{s.vp_total}vp</span>
                </span>
              );
            })}
          {winner && (
            <span className="text-xs text-muted">
              Winner revealed {winner.vp_cards} hidden VP card{winner.vp_cards === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Pill active={view === "summary"} color={pillColorAt(0)} onClick={() => setView("summary")}>
          Summary
        </Pill>
        <Pill active={view === "vp"} color={pillColorAt(1)} onClick={() => setView("vp")}>
          Victory Points
        </Pill>
        <Pill active={view === "resources"} color={pillColorAt(2)} onClick={() => setView("resources")}>
          Resource Production
        </Pill>
      </div>

      {view === "summary" ? (
        <GameSummary
          resData={resData.filter((r) => r.game_id === gameId)}
          settleTiles={settleTiles.filter((t) => t.game_id === gameId)}
          cityUpgrades={cityUpgrades.filter((c) => c.game_id === gameId)}
          robberMoves={robberMoves.filter((m) => m.game_id === gameId)}
          rosters={gamePlayers}
          winnerColor={winner?.player_color ?? null}
          totalTurns={game.total_turns}
        />
      ) : view === "vp" ? (
        <VPChart
          vpData={vpData.filter((v) => v.game_id === gameId)}
          game={game}
          winnerColor={winner?.player_color ?? null}
          standings={gameStandings}
        />
      ) : (
        <ResourceChart resData={resData.filter((r) => r.game_id === gameId)} winnerColor={winner?.player_color ?? null} />
      )}
    </div>
  );
}

// ---- Summary ------------------------------------------------------------

type GameRosterRow = { player_color: number; username: string };
type GameResRow = { player_color: number; username: string; turn: number; cards: number };
type GameTileRow = {
  player_color: number;
  pips: number;
  corner_id: number;
  tile_id: number;
  placement_turn?: number;
};
type GameCityRow = { player_color: number; corner_id: number; upgrade_turn: number };
type GameRobberRow = { turn: number; tile_id: number };

function GameSummary({
  resData,
  settleTiles,
  cityUpgrades,
  robberMoves,
  rosters,
  winnerColor,
  totalTurns,
}: {
  resData: GameResRow[];
  settleTiles: GameTileRow[];
  cityUpgrades: GameCityRow[];
  robberMoves: GameRobberRow[];
  rosters: GameRosterRow[];
  winnerColor: number | null;
  totalTurns: number;
}) {
  // Expected value coverage = sum over turns t of (pips of settlements
  // alive at turn t). A settlement placed on turn N contributes pips ×
  // (totalTurns - N) — so late builds count for fewer turns. Initial
  // placements (turn 0) earn the full weight.
  const { totalRolled, perPlayer, maxResources, maxEv, maxLuckPct } = useMemo(() => {
    const cardsByColor: Record<number, number> = {};
    resData.forEach((r) => {
      cardsByColor[r.player_color] = (cardsByColor[r.player_color] ?? 0) + r.cards;
    });
    // corner_id → earliest upgrade_turn for each player's city
    const cityTurnByCorner = new Map<string, number>();
    cityUpgrades.forEach((c) => {
      const k = `${c.player_color}-${c.corner_id}`;
      const prev = cityTurnByCorner.get(k);
      if (prev === undefined || c.upgrade_turn < prev) cityTurnByCorner.set(k, c.upgrade_turn);
    });
    // Robber intervals: each move places the robber on a tile until the
    // next move. tile is blocked over [start, end] inclusive.
    const robberSorted = [...robberMoves].sort((a, b) => a.turn - b.turn);
    const robberIntervals: { tile: number; start: number; end: number }[] = [];
    for (let i = 0; i < robberSorted.length; i++) {
      const start = robberSorted[i].turn;
      const end = i + 1 < robberSorted.length ? robberSorted[i + 1].turn - 1 : totalTurns;
      robberIntervals.push({ tile: robberSorted[i].tile_id, start, end });
    }
    const blockedInWindow = (tile: number, a: number, b: number) => {
      if (b < a) return 0;
      let total = 0;
      for (const iv of robberIntervals) {
        if (iv.tile !== tile) continue;
        const s = Math.max(iv.start, a);
        const e = Math.min(iv.end, b);
        if (e >= s) total += e - s + 1;
      }
      return total;
    };
    const evByColor: Record<number, number> = {};
    const expByColor: Record<number, number> = {};
    settleTiles.forEach((t) => {
      const placed = t.placement_turn ?? 0;
      const active = Math.max(0, totalTurns - placed);
      // Store pips × turns here; divide by totalTurns at the end so the
      // displayed value is "average pips held per turn" (small, intuitive
      // number) instead of a massive cumulative total.
      evByColor[t.player_color] = (evByColor[t.player_color] ?? 0) + t.pips * active;
      // Expected cards: settlement-phase counts 1×, city-phase counts 2×.
      // Subtract turns the robber was on this tile during each phase.
      const upgrade = cityTurnByCorner.get(`${t.player_color}-${t.corner_id}`);
      const sStart = placed + 1;
      const sEnd = upgrade !== undefined ? upgrade : totalTurns;
      const cStart = upgrade !== undefined ? upgrade + 1 : totalTurns + 1;
      const cEnd = totalTurns;
      const sTurns = Math.max(0, sEnd - sStart + 1);
      const cTurns = Math.max(0, cEnd - cStart + 1);
      const sBlocked = blockedInWindow(t.tile_id, sStart, sEnd);
      const cBlocked = blockedInWindow(t.tile_id, cStart, cEnd);
      const exp =
        (t.pips * (sTurns - sBlocked)) / 36 +
        (t.pips * 2 * (cTurns - cBlocked)) / 36;
      expByColor[t.player_color] = (expByColor[t.player_color] ?? 0) + exp;
    });
    const total = Object.values(cardsByColor).reduce((a, b) => a + b, 0);
    const rows = rosters
      .map((r) => {
        const actual = cardsByColor[r.player_color] ?? 0;
        const expected = expByColor[r.player_color] ?? 0;
        const pct = expected > 0 ? ((actual - expected) / expected) * 100 : 0;
        const evSum = evByColor[r.player_color] ?? 0;
        const evPerTurn = totalTurns > 0 ? evSum / totalTurns : 0;
        return {
          color: r.player_color,
          username: r.username,
          resources: actual,
          ev: Math.round(evPerTurn * 10) / 10,
          expected,
          luckPct: pct,
          isWinner: r.player_color === winnerColor,
        };
      })
      .sort((a, b) => b.resources - a.resources);
    return {
      totalRolled: total,
      perPlayer: rows,
      maxResources: Math.max(1, ...rows.map((r) => r.resources)),
      maxEv: Math.max(1, ...rows.map((r) => r.ev)),
      maxLuckPct: Math.max(10, ...rows.map((r) => Math.abs(r.luckPct))),
    };
  }, [resData, settleTiles, cityUpgrades, robberMoves, rosters, winnerColor, totalTurns]);

  const topEv = perPlayer.slice().sort((a, b) => b.ev - a.ev)[0];
  const topResources = perPlayer.slice().sort((a, b) => b.resources - a.resources)[0];
  const byLuck = perPlayer.slice().sort((a, b) => b.luckPct - a.luckPct);
  const luckiestPlayer = byLuck[0];
  const unluckiestPlayer = byLuck[byLuck.length - 1];

  return (
    <div className="bg-card border-[3px] border-black rounded-lg p-6 space-y-6">
      <div className="flex items-end gap-8 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wide font-bold text-muted">
            Resources Rolled This Game
          </div>
          <div className="text-5xl font-extrabold text-black leading-none mt-1">
            {totalRolled}
          </div>
        </div>
        {topResources && (
          <HeaderStat
            label="Most Resources"
            color={COLONIST_COLORS[topResources.color]}
            name={topResources.username}
            value={`${topResources.resources}`}
          />
        )}
        {topEv && (
          <HeaderStat
            label="Top Expected Value"
            color={COLONIST_COLORS[topEv.color]}
            name={topEv.username}
            value={`${topEv.ev}/turn`}
          />
        )}
        {luckiestPlayer && (
          <HeaderStat
            label="Luckiest"
            color={COLONIST_COLORS[luckiestPlayer.color]}
            name={luckiestPlayer.username}
            value={`${luckiestPlayer.luckPct >= 0 ? "+" : ""}${luckiestPlayer.luckPct.toFixed(0)}%`}
            valueColor={luckiestPlayer.luckPct >= 0 ? "#517d19" : "#b04030"}
          />
        )}
        {unluckiestPlayer && unluckiestPlayer !== luckiestPlayer && (
          <HeaderStat
            label="Unluckiest"
            color={COLONIST_COLORS[unluckiestPlayer.color]}
            name={unluckiestPlayer.username}
            value={`${unluckiestPlayer.luckPct >= 0 ? "+" : ""}${unluckiestPlayer.luckPct.toFixed(0)}%`}
            valueColor={unluckiestPlayer.luckPct >= 0 ? "#517d19" : "#b04030"}
          />
        )}
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide font-bold text-muted mb-3">
          Resources From Rolls · By Player
        </div>
        <div className="space-y-2">
          {perPlayer.map((r) => {
            const share = totalRolled > 0 ? (r.resources / totalRolled) * 100 : 0;
            return (
              <SummaryBar
                key={`res-${r.color}`}
                color={r.color}
                username={r.username}
                isWinner={r.isWinner}
                value={r.resources}
                maxValue={maxResources}
                trailing={`${share.toFixed(0)}%`}
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide font-bold text-muted mb-3">
          Expected Value Coverage · By Player
        </div>
        <div className="space-y-2">
          {perPlayer
            .slice()
            .sort((a, b) => b.ev - a.ev)
            .map((r) => (
              <SummaryBar
                key={`ev-${r.color}`}
                color={r.color}
                username={r.username}
                isWinner={r.isWinner}
                value={r.ev}
                maxValue={maxEv}
              />
            ))}
        </div>
        <div className="text-xs text-muted mt-3 leading-relaxed">
          For each settlement, pip total (6/8 = 5, 5/9 = 4, 4/10 = 3, 3/11 = 2, 2/12 = 1)
          is weighted by how many turns it was on the board and averaged across the whole
          game. So &quot;12&quot; means the player had ~12 pips of production active on average across
          every turn of the game. Late builds drag this down; cities don&apos;t count double here.
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide font-bold text-muted mb-3">
          Dice Luck · Actual Resources vs. Expected
        </div>
        <div className="space-y-2">
          {perPlayer
            .slice()
            .sort((a, b) => b.luckPct - a.luckPct)
            .map((r) => (
              <LuckRow
                key={`luck-${r.color}`}
                color={r.color}
                username={r.username}
                isWinner={r.isWinner}
                actual={r.resources}
                expected={r.expected}
                pct={r.luckPct}
                maxAbsPct={maxLuckPct}
              />
            ))}
        </div>
        <div className="text-xs text-muted mt-3 leading-relaxed">
          Expected = Σ (pips × unblocked-turns-alive ÷ 36) across every tile each player&apos;s
          settlements touched. City upgrades double the multiplier from the upgrade turn
          onward. Turns where the robber was parked on a tile are subtracted from that
          tile&apos;s alive window. Positive % = got more than expected (lucky).
        </div>
      </div>
    </div>
  );
}

function LuckRow({
  color,
  username,
  isWinner,
  actual,
  expected,
  pct,
  maxAbsPct,
}: {
  color: number;
  username: string;
  isWinner: boolean;
  actual: number;
  expected: number;
  pct: number;
  maxAbsPct: number;
}) {
  const barWidth = maxAbsPct > 0 ? (Math.abs(pct) / maxAbsPct) * 50 : 0; // half width (0..50%)
  const positive = pct >= 0;
  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-block w-3 h-3 rounded-full border border-black/40 shrink-0"
        style={{ background: COLONIST_COLORS[color] }}
      />
      <span className="w-5 font-extrabold shrink-0 text-center" style={{ color: "#f0ad00" }}>
        {isWinner ? "W" : ""}
      </span>
      <span
        className="w-32 font-extrabold shrink-0"
        style={{ color: COLONIST_COLORS[color] }}
      >
        {username}
      </span>
      <div className="flex-1 h-6 relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-black/40" />
        <div
          className="absolute top-0 h-full border-2 border-black rounded"
          style={{
            width: `${barWidth}%`,
            left: positive ? "50%" : `${50 - barWidth}%`,
            background: positive ? "#517d19" : "#b04030",
          }}
        />
      </div>
      <span
        className="w-16 text-right font-mono font-extrabold shrink-0"
        style={{ color: positive ? "#517d19" : "#b04030" }}
      >
        {positive ? "+" : ""}
        {pct.toFixed(0)}%
      </span>
      <span className="w-28 text-right font-mono text-muted shrink-0">
        {actual} / {expected.toFixed(0)}
      </span>
    </div>
  );
}

function HeaderStat({
  label,
  color,
  name,
  value,
  valueColor,
}: {
  label: string;
  color: string;
  name: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide font-bold text-muted">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full border border-black/40"
          style={{ background: color }}
        />
        <span className="text-sm md:text-base font-extrabold" style={{ color }}>
          {name}
        </span>
        <span
          className="text-sm md:text-base font-extrabold"
          style={{ color: valueColor ?? "#000" }}
        >
          · {value}
        </span>
      </div>
    </div>
  );
}

function SummaryBar({
  color,
  username,
  isWinner,
  value,
  maxValue,
  trailing,
}: {
  color: number;
  username: string;
  isWinner: boolean;
  value: number;
  maxValue: number;
  trailing?: string;
}) {
  const widthPct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-block w-3 h-3 rounded-full border border-black/40 shrink-0"
        style={{ background: COLONIST_COLORS[color] }}
      />
      <span className="w-5 font-extrabold shrink-0 text-center" style={{ color: "#f0ad00" }}>
        {isWinner ? "W" : ""}
      </span>
      <span
        className="w-32 font-extrabold shrink-0"
        style={{ color: COLONIST_COLORS[color] }}
      >
        {username}
      </span>
      <div className="flex-1 h-6 relative">
        <div
          className="h-full border-2 border-black rounded"
          style={{
            width: `${widthPct}%`,
            background: COLONIST_COLORS[color],
            minWidth: value > 0 ? 4 : 0,
          }}
        />
      </div>
      <span className="w-20 text-right font-mono font-bold text-black shrink-0">
        {value}
      </span>
      {trailing !== undefined && (
        <span className="w-14 text-right font-mono text-muted shrink-0">
          {trailing}
        </span>
      )}
    </div>
  );
}

// ---- VP Chart -----------------------------------------------------------

type VPRow = {
  game_id: string; player_color: number; username: string;
  turn: number; vp_total: number; is_final: boolean;
};

function VPChart({
  vpData,
  game,
  winnerColor,
  standings,
}: {
  vpData: VPRow[];
  game: { vp_to_win: number };
  winnerColor: number | null;
  standings: { player_color: number; vp_total: number; vp_cards: number }[];
}) {
  const { chartRows, playerKeys, leaderTable, hiddenByColor, publicFinalByColor, lastTurn } = useMemo(() => {
    const visible = vpData.filter((v) => !v.is_final);
    const players = Array.from(new Set(vpData.map((v) => v.player_color)));
    const nameByColor = new Map(vpData.map((v) => [v.player_color, v.username]));
    const keys = players.map((p) => ({
      color: p,
      username: nameByColor.get(p) ?? `P${p}`,
      dataKey: `p_${p}`,
    }));

    // True endGameState VP + VP card breakdown from standings
    const finalByColor = new Map(
      standings.map((s) => [
        s.player_color,
        { full: s.vp_total, vpCards: s.vp_cards, publicFinal: s.vp_total - s.vp_cards },
      ])
    );

    // Build per-turn rows from visible (non-final) data
    const byTurn = new Map<number, Record<string, number | null | string>>();
    visible.forEach((v) => {
      const r = byTurn.get(v.turn) ?? { turn: v.turn };
      r[`p_${v.player_color}`] = v.vp_total;
      byTurn.set(v.turn, r);
    });
    const rowsArr = Array.from(byTurn.values())
      .sort((a, b) => (a.turn as number) - (b.turn as number));

    // Forward-fill per player
    const lastVal: Record<string, number | null> = {};
    rowsArr.forEach((r) => {
      keys.forEach((k) => {
        const v = r[k.dataKey];
        if (typeof v === "number") {
          lastVal[k.dataKey] = v;
        } else {
          r[k.dataKey] = lastVal[k.dataKey] ?? null;
        }
      });
    });

    // Turns-in-lead (ties share) — based on public VP only
    const leaderCounts: Record<number, number> = {};
    rowsArr.forEach((r) => {
      let maxVal = -Infinity;
      keys.forEach((k) => {
        const v = r[k.dataKey] as number | null;
        if (v !== null && v > maxVal) maxVal = v;
      });
      if (maxVal <= 0) return;
      keys.forEach((k) => {
        const v = r[k.dataKey] as number | null;
        if (v === maxVal) leaderCounts[k.color] = (leaderCounts[k.color] ?? 0) + 1;
      });
    });

    // On the final real turn, overwrite VP with public_final so the line
    // reflects late longest-road / largest-army / winning builds that may
    // have happened after the last turn-boundary snapshot. Do NOT extend
    // past the last real turn. Hidden VP cards are shown in the tooltip
    // and leader box, not as a line extension.
    const lastRow = rowsArr[rowsArr.length - 1];
    if (lastRow) {
      keys.forEach((k) => {
        const f = finalByColor.get(k.color);
        if (f) lastRow[k.dataKey] = f.publicFinal;
      });
    }

    const hiddenByColor: Record<number, number> = {};
    const publicFinalByColor: Record<number, number> = {};
    keys.forEach((k) => {
      const f = finalByColor.get(k.color);
      hiddenByColor[k.color] = f?.vpCards ?? 0;
      publicFinalByColor[k.color] = f?.publicFinal ?? 0;
    });

    const leaders = keys
      .map((k) => ({
        color: k.color,
        username: k.username,
        turns: leaderCounts[k.color] ?? 0,
        isWinner: k.color === winnerColor,
        hiddenVp: hiddenByColor[k.color] ?? 0,
      }))
      .sort((a, b) => (b.turns - a.turns) || ((b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0)));

    const lastTurn = lastRow ? (lastRow.turn as number) : 0;

    return { chartRows: rowsArr, playerKeys: keys, leaderTable: leaders, hiddenByColor, publicFinalByColor, lastTurn };
  }, [vpData, winnerColor, standings]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Explicit y-axis ticks: step 2 up to vp_to_win, domain extends 1 above unlabeled
  const yTicks: number[] = [];
  for (let i = 0; i <= game.vp_to_win; i += 2) yTicks.push(i);
  if (yTicks[yTicks.length - 1] !== game.vp_to_win) yTicks.push(game.vp_to_win);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = (props: any) => {
    const { active, payload, label } = props as {
      active?: boolean;
      payload?: Array<{ value?: number; color?: string; name?: string; dataKey?: string }>;
      label?: string | number;
    };
    if (!active || !payload || payload.length === 0) return null;
    const isLast = Number(label) === lastTurn;
    return (
      <div style={{ background: "#fff", border: "1px solid #3a3a3a", borderRadius: 8, padding: "8px 12px", fontWeight: 600 }}>
        <div style={{ color: "#ccc", marginBottom: 4 }}>Turn {label}{isLast ? " (final)" : ""}</div>
        {payload.map((p) => {
          const colorMatch = (p.dataKey as string | undefined)?.match(/^p_(\d+)$/);
          const colorNum = colorMatch ? Number(colorMatch[1]) : null;
          const hidden = colorNum !== null ? (hiddenByColor[colorNum] ?? 0) : 0;
          const publicVal = p.value ?? 0;
          return (
            <div key={p.dataKey as string} style={{ color: p.color, fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{p.name}</span>: {publicVal}
              {isLast && (
                <span style={{ color: "#999", marginLeft: 6 }}>
                  +{hidden} hidden = {publicVal + hidden}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-card border-[3px] border-black rounded-lg p-4 space-y-4">
      <LeaderBox title="Turns in Lead (Public VP, Ties Share)" rows={leaderTable} />
      <div style={{ width: "100%", height: 460 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartRows} margin={{ top: 20, right: 120, bottom: 30, left: 30 }}>
                        <XAxis dataKey="turn" type="number" domain={["dataMin", "dataMax"]} label={{ value: "Turns Completed", position: "insideBottom", offset: -10, style: { fill: "#999", fontWeight: 700 } }} stroke="black" strokeWidth={2.5} tickLine={false} tickMargin={8} />
            <YAxis
              stroke="black" strokeWidth={2.5} tickLine={false}
              label={{ value: "Victory Points", angle: -90, position: "insideLeft", offset: 10, style: { fill: "#000", fontWeight: 800, textAnchor: "middle" } }}
              domain={[0, game.vp_to_win + 1]}
              ticks={yTicks}
              allowDecimals={false}
              tickFormatter={(v) => (v === game.vp_to_win + 1 ? "" : `${v}`)}
            tickMargin={8} />
            <Tooltip content={renderTooltip} />
            <Legend wrapperStyle={{ paddingTop: 10 }} />
            <ReferenceLine y={game.vp_to_win} stroke="#8b95a2" strokeDasharray="7 6" strokeWidth={2.5} label={{ value: `win = ${game.vp_to_win}`, position: "right", fill: "#000", fontWeight: 800, fontSize: 13 }} />
            {playerKeys.map((k) => (
              <Line
                key={k.dataKey}
                type="stepAfter"
                dataKey={k.dataKey}
                stroke={COLONIST_COLORS[k.color]}
                strokeWidth={4.2}
                dot={false}
                name={k.username + (k.color === winnerColor ? " (W)" : "")}
                connectNulls
                animationDuration={2500}
                animationEasing="ease-out"
              />
            ))}
            {playerKeys.map((k) => {
              const hidden = hiddenByColor[k.color] ?? 0;
              if (hidden <= 0) return null;
              const pubVP = publicFinalByColor[k.color] ?? 0;
              return (
                <ReferenceLine
                  key={`reveal-${k.color}`}
                  stroke={COLONIST_COLORS[k.color]}
                  strokeWidth={3}
                  strokeDasharray="6 6"
                  segment={[
                    { x: lastTurn, y: pubVP },
                    { x: lastTurn, y: pubVP + hidden },
                  ]}
                  ifOverflow="extendDomain"
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- Resource Chart -----------------------------------------------------

type ResRow = {
  game_id: string; player_color: number; username: string;
  turn: number; cards: number; cumulative: number;
};

function ResourceChart({ resData, winnerColor }: { resData: ResRow[]; winnerColor: number | null }) {
  const { chartRows, playerKeys, leaderTable } = useMemo(() => {
    const players = Array.from(new Set(resData.map((r) => r.player_color)));
    const nameByColor = new Map(resData.map((r) => [r.player_color, r.username]));
    const keys = players.map((p) => ({
      color: p,
      username: nameByColor.get(p) ?? `P${p}`,
      dataKey: `p_${p}`,
    }));
    const maxTurn = Math.max(...resData.map((r) => r.turn), 1);

    const byTurn = new Map<number, Record<string, number | null | string>>();
    for (let t = 1; t <= maxTurn; t++) byTurn.set(t, { turn: t });
    resData.forEach((r) => {
      const row = byTurn.get(r.turn)!;
      row[`p_${r.player_color}`] = r.cumulative;
    });
    const rowsArr = Array.from(byTurn.values()).sort((a, b) => (a.turn as number) - (b.turn as number));

    const lastVal: Record<string, number> = {};
    rowsArr.forEach((row) => {
      keys.forEach((k) => {
        const v = row[k.dataKey];
        if (typeof v === "number") lastVal[k.dataKey] = v;
        else row[k.dataKey] = lastVal[k.dataKey] ?? 0;
      });
    });

    const leaderCounts: Record<number, number> = {};
    rowsArr.forEach((row) => {
      let maxVal = -Infinity;
      keys.forEach((k) => {
        const v = row[k.dataKey] as number;
        if (v > maxVal) maxVal = v;
      });
      if (maxVal <= 0) return;
      keys.forEach((k) => {
        const v = row[k.dataKey] as number;
        if (v === maxVal) leaderCounts[k.color] = (leaderCounts[k.color] ?? 0) + 1;
      });
    });
    const leaders = keys
      .map((k) => ({
        color: k.color,
        username: k.username,
        turns: leaderCounts[k.color] ?? 0,
        isWinner: k.color === winnerColor,
      }))
      .sort((a, b) => (b.turns - a.turns) || ((b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0)));

    return { chartRows: rowsArr, playerKeys: keys, leaderTable: leaders };
  }, [resData, winnerColor]);

  return (
    <div className="bg-card border-[3px] border-black rounded-lg p-4 space-y-4">
      <LeaderBox title="Turns as Resource Leader (Ties Share)" rows={leaderTable} />
      <div style={{ width: "100%", height: 460 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartRows} margin={{ top: 20, right: 120, bottom: 30, left: 30 }}>
                        <XAxis dataKey="turn" type="number" domain={["dataMin", "dataMax"]} label={{ value: "Turns Completed", position: "insideBottom", offset: -10, style: { fill: "#999", fontWeight: 700 } }} stroke="black" strokeWidth={2.5} tickLine={false} tickMargin={8} />
            <YAxis
              stroke="black"
              strokeWidth={2.5}
              tickLine={false}
              tickMargin={8}
              tick={{ fontWeight: 800, fill: "#000" }}
              label={{ value: "Cumulative Cards From Rolls", angle: -90, position: "insideLeft", offset: 10, style: { fill: "#000", fontWeight: 800, textAnchor: "middle" } }}
              domain={[0, (dmax: number) => Math.max(5, Math.ceil(dmax / 5) * 5)]}
              ticks={(() => {
                const dmax = Math.max(...chartRows.flatMap((r) => playerKeys.map((k) => (r[k.dataKey] as number) ?? 0)), 5);
                const top = Math.max(5, Math.ceil(dmax / 5) * 5);
                const out: number[] = [];
                for (let i = 0; i <= top; i += 5) out.push(i);
                return out;
              })()}
            />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #3a3a3a", borderRadius: 8 }}
              labelFormatter={(t) => `Turn ${t}`}
            />
            <Legend wrapperStyle={{ paddingTop: 10 }} />
            {playerKeys.map((k) => (
              <Line
                key={k.dataKey}
                type="stepAfter"
                dataKey={k.dataKey}
                stroke={COLONIST_COLORS[k.color]}
                strokeWidth={4.2}
                dot={false}
                name={k.username + (k.color === winnerColor ? " (W)" : "")}
                connectNulls
                animationDuration={2500}
                animationEasing="ease-out"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- Shared leader box --------------------------------------------------

function LeaderBox({
  title,
  rows,
}: {
  title: string;
  rows: { color: number; username: string; turns: number; isWinner: boolean; hiddenVp?: number }[];
}) {
  return (
    <div className="inline-block bg-card border-[3px] border-black rounded-lg px-4 py-3 min-w-64">
      <div className="text-xs uppercase tracking-wide font-bold text-muted mb-2">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.color} className="flex items-center gap-2 text-sm font-semibold">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: COLONIST_COLORS[r.color] }}
            />
            <span className="w-6 font-extrabold" style={{ color: "#f0ad00" }}>{r.isWinner ? "W" : ""}</span>
            <span className="flex-1" style={{ color: COLONIST_COLORS[r.color] }}>
              {r.username}
              {typeof r.hiddenVp === "number" ? (
                <span className="ml-2 text-xs text-muted font-normal">
                  ({r.hiddenVp} hidden VP)
                </span>
              ) : null}
            </span>
            <span className="text-muted font-mono">{r.turns}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
