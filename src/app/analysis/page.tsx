"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Pill, pillColorAt } from "@/components/Pill";
import {
  usePlayerTotals,
  useP2PPrices,
  useSettlementTiles,
  useDiceHist,
  useRosters,
  useGames,
  RESOURCE_COLORS,
  RESOURCE_ORDER,
  NON_RESOURCE_COLOR,
  resourceName,
  type P2PPrice,
} from "@/lib/analysisData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Cell,
  useXAxisScale,
  useYAxisScale,
} from "recharts";

const ALL_LABEL = "All players";

// Generate y-axis ticks at 0, 5, 10, 15, ... up to a comfortable ceiling.
function tickStep5(maxVal: number): number[] {
  const top = Math.max(5, Math.ceil(maxVal / 5) * 5);
  const out: number[] = [];
  for (let i = 0; i <= top; i += 5) out.push(i);
  return out;
}

export default function PlayerProfilesPage() {
  const router = useRouter();
  const { data, loading, error } = usePlayerTotals();
  if (loading) return <div className="text-muted">Loading players…</div>;
  if (error) return <div className="text-loss">Error: {error}</div>;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Player Profiles</h1>
      <p className="text-sm text-muted">
        Pick a player below to see their journey — how many resources they collected, what they lost, and what they built.
      </p>
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted select-none">
        Player
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) router.push(`/player-data/${encodeURIComponent(v)}`);
          }}
          className="px-3 py-1.5 rounded border-2 border-black bg-card text-black font-bold text-sm"
        >
          <option value="" disabled>
            Choose a player…
          </option>
          {data.map((p) => (
            <option key={p.username} value={p.username}>
              {p.username}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// ========================================================================
// Section 1: Overall average price per resource (P2P trades)
// ========================================================================
export function PricePerResource({
  prices,
  rosters,
}: {
  prices: P2PPrice[];
  rosters: Roster[];
}) {
  const players = useMemo(
    () => Array.from(new Set(rosters.map((r) => r.username))).sort(),
    [rosters]
  );
  const [who, setWho] = useState<string>(ALL_LABEL);

  const rows = useMemo(() => {
    // Build {game_id: {player_color: username}} for filtering
    const rosterMap = new Map<string, string>();
    rosters.forEach((r) => rosterMap.set(`${r.game_id}:${r.player_color}`, r.username));
    const filtered = who === ALL_LABEL
      ? prices
      : prices.filter((p) => {
          const a = rosterMap.get(`${p.game_id}:${p.offerer_color}`);
          const b = rosterMap.get(`${p.game_id}:${p.accepter_color}`);
          return a === who || b === who;
        });
    const map = new Map<string, { total: number; n: number }>();
    filtered.forEach((p) => {
      const m = map.get(p.resource) ?? { total: 0, n: 0 };
      m.total += p.price;
      m.n += 1;
      map.set(p.resource, m);
    });
    return RESOURCE_ORDER.map((r) => {
      const m = map.get(r);
      return {
        resource: r,
        avg: m ? m.total / m.n : 0,
        n: m?.n ?? 0,
      };
    }).sort((a, b) => a.avg - b.avg);
  }, [prices, rosters, who]);

  return (
    <Section
      subtitle={
        who === ALL_LABEL
          ? "Each resource's bar shows how many cards someone had to give up to receive one card of that resource, pooled across every completed P2P trade where at least one side was a single resource type. Higher value = scarcer resource. 1.00 would mean a perfectly even 1-for-1 trade."
          : `Each resource's bar shows how many cards ${who} (or their trading partners) gave up to receive one card of that resource, averaged across trades ${who} participated in where at least one side was a single resource type.`
      }
    >
      <PlayerTabs players={players} value={who} onChange={setWho} />
      <div className="bg-card border-[3px] border-black rounded-lg p-5">
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 16, right: 72, bottom: 40, left: 72 }}
            >
              <XAxis
                type="number"
                stroke="black"
                strokeWidth={2.5}
                tickLine={false}
                tick={{ fontWeight: 800, fill: "#000" }}
                tickMargin={8}
                label={{
                  value: "Cards Given per Card Received",
                  position: "insideBottom",
                  offset: -10,
                  style: { fill: "#000", fontWeight: 800 },
                }}
              />
              <YAxis
                type="category"
                dataKey="resource"
                tickFormatter={(v) => resourceName(String(v), true)}
                stroke="black" strokeWidth={2.5} tickLine={false}
                width={80}
                tickMargin={8}
                tick={{ fontWeight: 800, fill: "#000" }}
              />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid var(--card-border)", borderRadius: 8 }}
                cursor={{ fill: "rgba(11,91,181,0.06)" }}
                labelFormatter={(v) => resourceName(String(v), true)}
              />
              <Bar dataKey="avg" radius={[0, 6, 6, 0]} stroke="black" strokeWidth={2.5} label={{ position: "right", formatter: (v: unknown) => `${(v as number).toFixed(2)}`, fontWeight: 800, fill: "#000", offset: 10 }}>
                {rows.map((r) => (
                  <Cell key={r.resource} fill={RESOURCE_COLORS[r.resource] ?? "#888"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}

// ========================================================================
// Section 2: Dice distribution pooled
// ========================================================================
export function DiceDistribution({
  dice,
}: {
  dice: { game_id: string; total: number; count: number }[];
}) {
  const rows = useMemo(() => {
    const by = new Map<number, number>();
    dice.forEach((d) => by.set(d.total, (by.get(d.total) ?? 0) + d.count));
    const out: { total: number; count: number }[] = [];
    for (let t = 2; t <= 12; t++) out.push({ total: t, count: by.get(t) ?? 0 });
    return out;
  }, [dice]);

  return (
    <Section subtitle="Frequency of each total across every game. 7s highlighted. Pooled across all players — each game's rolls affect everyone equally, so there's no meaningful per-player split.">
      <div className="bg-card border-[3px] border-black rounded-lg p-4">
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 16, right: 16, left: 8, bottom: 16 }}>
              <XAxis dataKey="total" stroke="black" strokeWidth={2.5} tickLine={false} tick={{ fontWeight: 800, fill: "#000" }}  tickMargin={8} />
              <YAxis stroke="black" strokeWidth={2.5} tickLine={false} tick={{ fontWeight: 800, fill: "#000" }} tickMargin={8} ticks={tickStep5(Math.max(...rows.map(r => r.count), 5))} domain={[0, "dataMax"]} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid var(--card-border)", borderRadius: 8, color: "#1a2332" }}
                cursor={{ fill: "rgba(11,91,181,0.06)" }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} stroke="black" strokeWidth={2.5}>
                {rows.map((r) => (
                  <Cell key={r.total} fill={r.total === 7 ? "#9c4300" : NON_RESOURCE_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}

// ========================================================================
// Section 3: Resources adjacent to initial settlements (tabbed by player)
// ========================================================================
type SettleTile = { game_id: string; player_color: number; placement_order: number; is_initial: boolean; corner_id: number; dice_number: number; resource: string; pips: number };
type Roster = { game_id: string; player_color: number; username: string };

export function SettlementResources({ tiles, rosters }: { tiles: SettleTile[]; rosters: Roster[] }) {
  const { joined, players } = useJoinedTiles(tiles, rosters);
  const [who, setWho] = useState<string>(ALL_LABEL);

  const filtered = who === ALL_LABEL ? joined : joined.filter((t) => t.username === who);
  const initial = filtered.filter((t) => t.is_initial && t.resource !== "desert");

  const data = useMemo(() => {
    const byOrder = new Map<number, Map<string, number>>();
    initial.forEach((t) => {
      if (!byOrder.has(t.placement_order)) byOrder.set(t.placement_order, new Map());
      const m = byOrder.get(t.placement_order)!;
      m.set(t.resource, (m.get(t.resource) ?? 0) + 1);
    });
    const orders = [...byOrder.keys()].filter((o) => o <= 2).sort();
    return orders.map((o) => ({
      order: o,
      label: o === 1 ? "1st Settlement" : "2nd Settlement",
      rows: RESOURCE_ORDER.map((r) => ({
        resource: r,
        count: byOrder.get(o)!.get(r) ?? 0,
      })),
    }));
  }, [initial]);

  return (
    <Section
      title="Resources adjacent to initial settlements"
      subtitle="How often each resource touches a 1st vs 2nd starting settlement. Toggle between combined and per-player."
    >
      <PlayerTabs players={players} value={who} onChange={setWho} />
      <div className="grid md:grid-cols-2 gap-4">
        {data.map((d) => {
          const maxC = Math.max(...d.rows.map((r) => r.count), 1);
          return (
            <div key={d.order} className="bg-card border-[3px] border-black rounded-lg p-4">
              <div className="font-semibold mb-3">{d.label}</div>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={d.rows} margin={{ top: 16, right: 8, left: 0, bottom: 16 }}>
                    <XAxis
                      dataKey="resource"
                      tickFormatter={(v) => resourceName(String(v), true)}
                      stroke="black" strokeWidth={2.5} tickLine={false}
                      tick={{ fontWeight: 800, fill: "#000" }}
                      tickMargin={8}
                      interval={0}
                    />
                    <YAxis stroke="black" strokeWidth={2.5} tickLine={false} domain={[0, Math.max(Math.ceil(maxC * 1.15), 5)]} tick={{ fontWeight: 800, fill: "#000" }} tickMargin={8} ticks={tickStep5(maxC)} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid var(--card-border)", borderRadius: 8, color: "#1a2332" }}
                      cursor={{ fill: "rgba(11,91,181,0.06)" }}
                      labelFormatter={(v) => resourceName(String(v), true)}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} stroke="black" strokeWidth={2.5} label={{ position: "top", fontWeight: 800, fill: "#000", offset: 8 }}>
                      {d.rows.map((r) => (
                        <Cell key={r.resource} fill={RESOURCE_COLORS[r.resource] ?? "#888"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ========================================================================
// Section 4: Dice numbers touched by initial settlements (tabbed by player)
// ========================================================================
export function SettlementDiceNumbers({ tiles, rosters }: { tiles: SettleTile[]; rosters: Roster[] }) {
  const { joined, players } = useJoinedTiles(tiles, rosters);
  const [who, setWho] = useState<string>(ALL_LABEL);

  const filtered = who === ALL_LABEL ? joined : joined.filter((t) => t.username === who);
  const initial = filtered.filter((t) => t.is_initial && t.dice_number > 0);

  const data = useMemo(() => {
    const byOrder = new Map<number, Map<number, number>>();
    initial.forEach((t) => {
      if (!byOrder.has(t.placement_order)) byOrder.set(t.placement_order, new Map());
      const m = byOrder.get(t.placement_order)!;
      m.set(t.dice_number, (m.get(t.dice_number) ?? 0) + 1);
    });
    const orders = [...byOrder.keys()].filter((o) => o <= 2).sort();
    const allDice = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
    return orders.map((o) => ({
      order: o,
      label: o === 1 ? "1st Settlement" : "2nd Settlement",
      rows: allDice.map((n) => ({
        dice: n,
        count: byOrder.get(o)!.get(n) ?? 0,
        isRed: n === 6 || n === 8,
      })),
    }));
  }, [initial]);

  return (
    <Section
      title="Dice numbers of initial settlement tiles"
      subtitle="How often each number is adjacent to a 1st or 2nd starting settlement. Red numbers (6, 8) in darker blue."
    >
      <PlayerTabs players={players} value={who} onChange={setWho} />
      {(() => {
        // Shared y-axis across both panels so they're visually comparable
        const sharedMax = Math.max(
          1,
          ...data.flatMap((d) => d.rows.map((r) => r.count))
        );
        const sharedDomain: [number, number] = [0, Math.max(Math.ceil(sharedMax * 1.15), 5)];
        const sharedTicks = tickStep5(sharedMax);
        return (
      <div className="grid md:grid-cols-2 gap-4">
        {data.map((d) => {
          return (
            <div key={d.order} className="bg-card border-[3px] border-black rounded-lg p-4">
              <div className="font-semibold mb-3">{d.label}</div>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={d.rows} margin={{ top: 16, right: 8, left: 0, bottom: 16 }}>
              <XAxis dataKey="dice" stroke="black" strokeWidth={2.5} tickLine={false} tick={{ fontWeight: 800, fill: "#000" }}  tickMargin={8} />
                    <YAxis stroke="black" strokeWidth={2.5} tickLine={false} domain={sharedDomain} tick={{ fontWeight: 800, fill: "#000" }} tickMargin={8} ticks={sharedTicks} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid var(--card-border)", borderRadius: 8, color: "#1a2332" }}
                      cursor={{ fill: "rgba(11,91,181,0.06)" }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} stroke="black" strokeWidth={2.5} label={{ position: "top", fontWeight: 800, fill: "#000", offset: 8 }}>
                      {d.rows.map((r) => (
                        <Cell key={r.dice} fill={r.isRed ? "#2770a8" : NON_RESOURCE_COLOR} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
        );
      })()}
    </Section>
  );
}

// ========================================================================
// Section 5: Expected production per settlement (tabbed by player, with overall mean overlay)
// ========================================================================
const SETTLEMENT_PAL: Record<number, string> = {
  1: "#3b6cb1",
  2: "#d97a3e",
  3: "#6aa15d",
  4: "#a54878",
};

type AnimatedDot = {
  key: string;
  order: number;
  x: number;
  y: number;
  opacity: number;
};

// Rendered as a direct child of ScatterChart — uses Recharts 3 axis-scale
// hooks to convert data coords to pixels, then lets framer-motion tween
// cx/cy/opacity whenever `who` (and thus jitter) changes.
function AnimatedDotLayer({ dots }: { dots: AnimatedDot[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  return (
    <g style={{ pointerEvents: "none" }}>
      {dots.map((d) => {
        const cx = xScale(d.x);
        const cy = yScale(d.y);
        if (cx === undefined || cy === undefined) return null;
        return (
          <motion.circle
            key={d.key}
            initial={false}
            animate={{ cx, cy, opacity: d.opacity }}
            transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
            r={5}
            fill={SETTLEMENT_PAL[d.order]}
            stroke="#1a2332"
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

export function ExpectedProduction({
  tiles,
  rosters,
  games,
}: {
  tiles: SettleTile[];
  rosters: Roster[];
  games: { game_id: string; start_time: string }[];
}) {
  const { joined, players } = useJoinedTiles(tiles, rosters);
  const [who, setWho] = useState<string>(ALL_LABEL);
  const router = useRouter();

  const gameDateMap = useMemo(() => {
    const m = new Map<string, string>();
    games.forEach((g) => {
      m.set(
        g.game_id,
        new Date(g.start_time).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      );
    });
    return m;
  }, [games]);

  const perSettle = useMemo(() => {
    const byKey = new Map<string, { order: number; pips: number; game_id: string; player_color: number; corner_id: number; username: string }>();
    joined.forEach((t) => {
      if (t.placement_order > 4) return;
      const key = `${t.game_id}-${t.player_color}-${t.corner_id}-${t.placement_order}`;
      const cur = byKey.get(key) ?? {
        order: t.placement_order,
        pips: 0,
        game_id: t.game_id,
        player_color: t.player_color,
        corner_id: t.corner_id,
        username: t.username,
      };
      cur.pips += t.pips ?? 0;
      byKey.set(key, cur);
    });
    return [...byKey.values()];
  }, [joined]);

  const overallMeans = useMemo(() => {
    const sums = new Map<number, { sum: number; n: number }>();
    perSettle.forEach((s) => {
      const m = sums.get(s.order) ?? { sum: 0, n: 0 };
      m.sum += s.pips;
      m.n += 1;
      sums.set(s.order, m);
    });
    const out = new Map<number, number>();
    sums.forEach((v, k) => out.set(k, v.sum / v.n));
    return out;
  }, [perSettle]);

  const filtered = who === ALL_LABEL ? perSettle : perSettle.filter((s) => s.username === who);

  // Every dot always lives in the dataset; x and opacity reshuffle with `who`
  // so framer-motion can tween positions instead of remounting.
  const animatedDots = useMemo(() => {
    const base = perSettle.map((s) => ({
      key: `${s.game_id}-${s.player_color}-${s.corner_id}-${s.order}`,
      order: s.order,
      y: s.pips,
      username: s.username,
      game_id: s.game_id,
    }));
    const visible = who === ALL_LABEL ? base : base.filter((d) => d.username === who);
    const xMap = new Map<string, number>();
    [1, 2, 3, 4].forEach((o) => {
      const rows = visible.filter((d) => d.order === o);
      const n = rows.length;
      rows.forEach((r, i) => {
        const x = o + (n > 1 ? (i / (n - 1) - 0.5) * 0.55 + Math.sin(i * 91.2) * 0.05 : 0);
        xMap.set(r.key, x);
      });
    });
    return base.map((d) => ({
      ...d,
      x: xMap.get(d.key) ?? d.order,
      opacity: xMap.has(d.key) ? 1 : 0,
    }));
  }, [perSettle, who]);

  // Group by order — simple deterministic sine-based jitter
  const data = useMemo(() => {
    return [1, 2, 3, 4].map((o) => {
      const rows = filtered.filter((s) => s.order === o);
      const n = rows.length;
      const jittered = rows.map((r, i) => ({
        x: o + (n > 1 ? (i / (n - 1) - 0.5) * 0.55 + Math.sin(i * 91.2) * 0.05 : 0),
        y: r.pips,
        order: o,
        game_id: r.game_id,
        username: r.username,
        game_date: gameDateMap.get(r.game_id) ?? "",
      }));
      const mean = n ? rows.reduce((a, b) => a + b.pips, 0) / n : 0;
      const maxPip = n ? Math.max(...rows.map((r) => r.pips)) : 0;
      return {
        order: o,
        rows: jittered,
        mean,
        maxPip,
        overall: overallMeans.get(o) ?? 0,
      };
    });
  }, [filtered, overallMeans, gameDateMap]);

  return (
    <Section
      title="Expected production per settlement"
      subtitle="Sum of adjacent tile pips (6/8 = 5, 5/9 = 4, 4/10 = 3, 3/11 = 2, 2/12 = 1). Max 15. Grey bar = overall mean across all players."
    >
      <PlayerTabs players={players} value={who} onChange={setWho} />
      <div className="bg-card border-[3px] border-black rounded-lg p-4">
        <div style={{ width: "100%", height: 440 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 40, right: 30, bottom: 40, left: 30 }}>              <XAxis
                type="number"
                dataKey="x"
                domain={[0.5, 4.5]}
                ticks={[1, 2, 3, 4]}
                tickFormatter={(v) => {
                  const o = Math.round(v as number);
                  return `${o}${["st", "nd", "rd", "th"][o - 1]} settlement`;
                }}
                stroke="var(--muted)"
                tick={{ fontWeight: 800, fill: "#000" }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, 16]}
                ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16]}
                stroke="black" strokeWidth={2.5} tickLine={false}
                tick={{ fontWeight: 800, fill: "#000" }}
                label={{ value: "Expected Production", angle: -90, position: "insideLeft", offset: 10, style: { fill: "#000", fontWeight: 800, textAnchor: "middle" } }}
               tickMargin={8} />
              {/* Tooltip: show player + date (Combined) or date only (player tab) */}
              <Tooltip
                cursor={{ stroke: "var(--accent)", strokeWidth: 1, strokeDasharray: "3 3" }}
                contentStyle={{ background: "#fff", border: "1px solid var(--card-border)", borderRadius: 8, color: "#1a2332", fontWeight: 600, padding: "8px 12px" }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => {
                  const payload = props?.payload;
                  const p = Array.isArray(payload) && payload.length > 0 ? payload[0]?.payload : null;
                  if (!p || !p.game_id) return null;
                  return (
                    <div style={{ background: "#fff", border: "1px solid #dde3eb", borderRadius: 8, padding: "8px 12px", fontWeight: 800, color: "#1a2332", fontSize: 13, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                      {who === ALL_LABEL && <div style={{ color: SETTLEMENT_PAL[p.order] }}>{p.username}</div>}
                      <div style={{ color: "#5a6674", fontWeight: 600 }}>{p.game_date}</div>
                      <div style={{ color: "#5a6674", fontSize: 11, marginTop: 2 }}>click to open game</div>
                    </div>
                  );
                }}
              />
              {/* Invisible Scatters — Recharts still uses them for tooltip
                  hit-testing and click navigation. The visible dots are
                  rendered by <Customized> below with framer-motion. */}
              {data.map((d) => (
                <Scatter
                  key={`hit-${d.order}`}
                  data={d.rows}
                  fill="transparent"
                  stroke="transparent"
                  isAnimationActive={false}
                  style={{ cursor: "pointer" }}
                  onClick={(pt: { payload?: { game_id?: string } }) => {
                    const gid = pt?.payload?.game_id;
                    if (gid) router.push(`/games/${gid}`);
                  }}
                />
              ))}
              {/* Animated visible dots — slide between positions when the
                  player tab changes. */}
              <AnimatedDotLayer dots={animatedDots} />

              {/* Grey overall-mean bars (appear ON TOP of dots) */}
              {[1, 2, 3, 4].map((o) => {
                const mean = overallMeans.get(o) ?? 0;
                return (
                  <ReferenceLine
                    key={`overall-${o}`}
                    segment={[
                      { x: o - 0.4, y: mean },
                      { x: o + 0.4, y: mean },
                    ]}
                    stroke="#8b95a2"
                    strokeWidth={4}
                    ifOverflow="extendDomain"
                  />
                );
              })}
              {/* Player-specific mean bar — only differs from overall when a player is selected */}
              {who !== ALL_LABEL &&
                data.map((d) =>
                  d.rows.length > 0 ? (
                    <ReferenceLine
                      key={`mean-${d.order}`}
                      segment={[
                        { x: d.order - 0.4, y: d.mean },
                        { x: d.order + 0.4, y: d.mean },
                      ]}
                      stroke={SETTLEMENT_PAL[d.order]}
                      strokeWidth={5}
                      ifOverflow="extendDomain"
                    />
                  ) : null
                )}
              {/* Mean text labels above the top dot per order */}
              {data.map((d) =>
                d.rows.length > 0 ? (
                  <ReferenceLine
                    key={`mean-label-${d.order}`}
                    segment={[
                      { x: d.order - 0.001, y: Math.min(d.maxPip + 1.3, 16.5) },
                      { x: d.order + 0.001, y: Math.min(d.maxPip + 1.3, 16.5) },
                    ]}
                    stroke="transparent"
                    ifOverflow="extendDomain"
                    label={{
                      value: `mean = ${d.mean.toFixed(2)}`,
                      position: "top",
                      fill: "#000",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                ) : null
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}

// ========================================================================
// Helpers
// ========================================================================
// Title is rendered by the collapsible wrapper in the Statistics page;
// here we only expose the subtitle + content of each figure.
function Section({
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 p-5">
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      {children}
    </section>
  );
}

function PlayerTabs({
  players,
  value,
  onChange,
}: {
  players: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const all = [ALL_LABEL, ...players];
  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted select-none">
      Player
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded border-2 border-black bg-card text-black font-bold text-sm"
      >
        {all.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  );
}

function useJoinedTiles(tiles: SettleTile[], rosters: Roster[]) {
  return useMemo(() => {
    const rosterMap = new Map<string, string>();
    rosters.forEach((r) => rosterMap.set(`${r.game_id}:${r.player_color}`, r.username));
    const joined = tiles.map((t) => ({
      ...t,
      username: rosterMap.get(`${t.game_id}:${t.player_color}`) ?? `Color ${t.player_color}`,
    }));
    const players = [...new Set(joined.map((j) => j.username))].sort();
    return { joined, players };
  }, [tiles, rosters]);
}
