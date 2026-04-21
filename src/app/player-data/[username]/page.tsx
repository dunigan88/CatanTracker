"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerTotals, RESOURCE_COLORS } from "@/lib/analysisData";
import { motion } from "framer-motion";

// Cost of each build in raw resource cards, standard Catan.
const COSTS = { settlement: 4, city: 5, dev: 3 };

// Each chapter section is taller than the viewport so the sticky box can
// "hold" at the top of the screen for a long stretch of scrolling, giving
// the dots time to animate and the user time to absorb the visual change.
const CHAPTER_HEIGHT_VH = 170;

export default function PlayerProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const decoded = decodeURIComponent(username);
  const { data: totals } = usePlayerTotals();

  if (!totals) return <div className="text-muted">Loading profile…</div>;

  const player = totals.find((p) => p.username === decoded);
  if (!player) {
    return (
      <div className="space-y-4">
        <div className="text-loss">Player &quot;{decoded}&quot; not found.</div>
        <Link href="/player-data" className="text-accent underline">Back to Player Data</Link>
      </div>
    );
  }

  return <ProfileScroll player={player} />;
}

function ProfileScroll({ player }: { player: Totals }) {
  const chapters = buildChapters(player);
  const [activeChapter, setActiveChapter] = useState(0);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport once + on resize
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Dot cap: tighter on phones where SVG animation perf drops off.
  // Desktop cap of 4000 covers every player in the current dataset uncapped
  // (biggest is ~3329), so real numbers come and go on steals / trades.
  const cap = isMobile ? 1200 : 4000;

  // White background on this page only. Restore on unmount.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#ffffff";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  // IntersectionObserver: each chapter section is 100vh tall. When its
  // midpoint crosses the viewport center, that chapter becomes active.
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    sectionRefs.current.forEach((el, i) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          // Activate this chapter as soon as its TOP crosses the top of the
          // viewport — i.e., right when its sticky box locks in at the top.
          // The rootMargin shrinks the activation strip to roughly the
          // top portion of the viewport.
          if (entry.isIntersecting) setActiveChapter(i);
        },
        {
          threshold: [0],
          // Activation zone = a thin strip near the top of the viewport.
          // Negative bottom margin = the trigger zone ends well above the bottom.
          rootMargin: "-15% 0px -75% 0px",
        }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [chapters.length]);

  return (
    <div className="relative">
      <div className="pb-4">
        <Link href="/player-data" className="text-sm text-muted hover:text-accent">← Back to Player Data</Link>
      </div>

      {/* MOBILE: sticky dot canvas pinned near top of viewport.
          Positioned below the site header (sticky top:4rem).
          Stays visible while the user scrolls chapters below. */}
      <div
        className="md:hidden sticky top-[4.5rem] z-10 bg-white py-2 border-b-[3px] border-black"
      >
        <div className="h-[42vh] flex items-center justify-center">
          {isMobile && (
            <DotScene player={player} activeChapter={activeChapter} cap={cap} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6 relative">
        {/* LEFT: stacked text chapters, each 170vh — they "lock" one at a time */}
        <div>
          {chapters.map((c, i) => (
            <section
              key={i}
              ref={(el: HTMLElement | null) => { sectionRefs.current[i] = el; }}
              style={{ height: `${CHAPTER_HEIGHT_VH}vh` }}
              className="relative"
            >
              <div
                className="sticky top-[calc(4.5rem+42vh)] md:top-[7rem] border-[3px] border-black rounded-2xl p-6 w-full shadow-[0_4px_0_rgba(0,0,0,0.08)] transition-opacity duration-300 relative"
                style={{
                  background: c.kind === "insight" ? "#f6ecd2" : "#e5d4a3",
                  opacity: i === activeChapter ? 1 : 0.45,
                }}
              >
                <div
                  className="absolute top-3 right-5 text-xs font-extrabold tracking-wider uppercase"
                  style={{ color: "rgba(0,0,0,0.55)" }}
                >
                  {player.username}
                </div>
                <div className="text-xs font-extrabold tracking-wider uppercase mb-2"
                     style={{ color: c.kind === "insight" ? "#9c4300" : "rgba(0,0,0,0.7)" }}>
                  {c.kind === "insight" ? "Insight" : `Chapter ${i + 1} of ${chapters.length}`}
                </div>
                <h2
                  className={`${c.kind === "insight" ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"} font-extrabold tracking-tight mb-3 leading-tight text-black`}
                >
                  {c.title}
                </h2>
                <div className="text-base md:text-lg font-semibold text-black leading-snug">
                  {c.body}
                </div>
                {i === 0 && (
                  <div
                    className="mt-5 text-xs font-extrabold tracking-wider uppercase flex items-center gap-1.5"
                    style={{ color: "rgba(0,0,0,0.55)" }}
                  >
                    Scroll down for more
                    <span aria-hidden>↓</span>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        {/* DESKTOP: sticky dot canvas on the right */}
        <div className="hidden md:block">
          <div className="sticky top-[6.5rem] h-[80vh] flex items-center justify-center">
            {!isMobile && (
              <DotScene player={player} activeChapter={activeChapter} cap={cap} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// On small screens: show viz above each chapter via a separate mobile path
// (kept simple — desktop is primary target for this viz).

// ============================================================================
// Dot canvas that reacts to scroll progress
// ============================================================================

type Totals = {
  username: string;
  games: number;
  cards_from_rolls: number;
  gained_lumber: number;
  gained_brick: number;
  gained_wool: number;
  gained_grain: number;
  gained_ore: number;
  stolen_from: number;
  cards_lost_to_7: number;
  cards_traded_away: number;
  cards_traded_for: number;
  settlements: number;
  cities: number;
  dev_cards_bought: number;
  // Per-resource cards lost to robber (victim)
  stolen_lumber: number;
  stolen_brick: number;
  stolen_wool: number;
  stolen_grain: number;
  stolen_ore: number;
  // Per-resource cards discarded on 7-rolls
  lost7_lumber: number;
  lost7_brick: number;
  lost7_wool: number;
  lost7_grain: number;
  lost7_ore: number;
  // Per-resource cards GIVEN in accepted P2P + bank trades
  traded_away_lumber: number;
  traded_away_brick: number;
  traded_away_wool: number;
  traded_away_grain: number;
  traded_away_ore: number;
  // Per-resource cards RECEIVED in accepted P2P + bank trades
  traded_for_lumber: number;
  traded_for_brick: number;
  traded_for_wool: number;
  traded_for_grain: number;
  traded_for_ore: number;
  // Year of Plenty
  yop_lumber: number;
  yop_brick: number;
  yop_wool: number;
  yop_grain: number;
  yop_ore: number;
  // Monopoly — this player's gains
  mono_gain_lumber: number;
  mono_gain_brick: number;
  mono_gain_wool: number;
  mono_gain_grain: number;
  mono_gain_ore: number;
  // Monopoly — this player's losses
  mono_loss_lumber: number;
  mono_loss_brick: number;
  mono_loss_wool: number;
  mono_loss_grain: number;
  mono_loss_ore: number;
  // Robber — this player's gains (thief side)
  robber_gain_lumber: number;
  robber_gain_brick: number;
  robber_gain_wool: number;
  robber_gain_grain: number;
  robber_gain_ore: number;
};

function DotScene({
  player,
  activeChapter,
  cap,
}: {
  player: Totals;
  activeChapter: number;
  cap: number;
}) {
  const { dots } = useMemo(() => buildDots(player, cap), [player, cap]);
  return (
    <motion.svg
      viewBox="-500 -320 1000 640"
      className="w-full h-full max-w-4xl"
      preserveAspectRatio="xMidYMid meet"
    >
      {dots.map((d) => (
        <AnimatedDot key={d.id} d={d} activeChapter={activeChapter} />
      ))}
    </motion.svg>
  );
}

// ---- Per-dot animated positions ------------------------------------------

type DotDef = {
  id: number;
  color: string;
  resource: "lumber" | "brick" | "wool" | "grain" | "ore";
  // One position per chapter
  positions: { x: number; y: number; opacity: number }[];
};

function AnimatedDot({
  d,
  activeChapter,
}: {
  d: DotDef;
  activeChapter: number;
}) {
  const target = d.positions[activeChapter] ?? d.positions[0];
  return (
    <motion.circle
      r={4}
      fill={d.color}
      stroke="#1a2332"
      strokeWidth={0.6}
      initial={{ cx: d.positions[0].x, cy: d.positions[0].y, opacity: d.positions[0].opacity }}
      animate={{ cx: target.x, cy: target.y, opacity: target.opacity }}
      transition={{ duration: 4.0, ease: [0.2, 0.8, 0.2, 1] }}
    />
  );
}

// ---- Position computation ------------------------------------------------

function buildDots(p: Totals, cap: number): { dots: DotDef[] } {
  const perResource: Array<{ resource: DotDef["resource"]; count: number }> = [
    { resource: "lumber", count: p.gained_lumber },
    { resource: "brick", count: p.gained_brick },
    { resource: "wool", count: p.gained_wool },
    { resource: "grain", count: p.gained_grain },
    { resource: "ore", count: p.gained_ore },
  ];

  // Down-sample very large datasets for perf. Below the cap, scale = 1 so
  // the real counts come through exactly.
  const totalReal = perResource.reduce((s, r) => s + r.count, 0);
  const totalTradedFor =
    p.traded_for_lumber + p.traded_for_brick + p.traded_for_wool +
    p.traded_for_grain + p.traded_for_ore;
  const grandTotal = totalReal + totalTradedFor;
  const scale = grandTotal > cap ? cap / grandTotal : 1;

  const dotsPerRes = perResource.map((r) => ({
    resource: r.resource,
    count: Math.max(0, Math.round(r.count * scale)),
    // For dots specifically: use blue for wool instead of the cream
    // RESOURCE_COLORS value, since cream wouldn't show against the white bg.
    color:
      r.resource === "wool"
        ? "#4fa6eb"
        : RESOURCE_COLORS[r.resource] ?? "#888",
  }));

  // Build flat dot list with assigned resources
  const flat: {
    id: number;
    resource: DotDef["resource"];
    color: string;
    resIdx: number;
    posInCluster: number;
  }[] = [];
  let id = 0;
  dotsPerRes.forEach((res, rIdx) => {
    for (let j = 0; j < res.count; j++) {
      flat.push({
        id: id++,
        resource: res.resource,
        color: res.color,
        resIdx: rIdx,
        posInCluster: j,
      });
    }
  });

  const total = flat.length;
  if (total === 0) return { dots: [] };

  // Shuffle for chapter 1 (deterministic seed based on username length)
  const shuffled = [...flat];
  const seed = p.username.length;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const rnd = Math.sin(seed * 9999 + i * 17) * 10000;
    const j = Math.floor(Math.abs(rnd - Math.floor(rnd)) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // ---- CHAPTER 1: Tightly-packed disc using golden-angle (sunflower) layout.
  // Dot positions are deterministic; the colors come from `shuffled` so the
  // disc is multi-colored speckle rather than sectored.
  // Spacing adapts to dot count so the disc always fits in the viewBox
  // (viewBox is 1000x640; max radius ~300 to leave margin).
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.508 degrees
  const MAX_DISC_RADIUS = 300;
  const SPACING = Math.min(7.2, MAX_DISC_RADIUS / Math.sqrt(total + 1));
  const chapter1Positions = shuffled.map((_, i) => {
    const r = SPACING * Math.sqrt(i + 0.5);
    const a = i * GOLDEN_ANGLE;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  // Re-key by the dot's flat index (since shuffled scrambled colors)
  const chapter1: { x: number; y: number }[] = new Array(total);
  shuffled.forEach((d, i) => {
    chapter1[d.id] = chapter1Positions[i];
  });

  // ---- CHAPTER 2: Grouped by resource into 5 clusters arranged on a
  // pentagon. The pentagon's radius scales with the largest cluster so the
  // layout stays balanced regardless of player size, and clusters never
  // overlap.
  const pentagonOrder: DotDef["resource"][] = [
    "wool",  // top
    "grain", // upper-right
    "ore",   // lower-right
    "brick", // lower-left
    "lumber",// upper-left
  ];

  // Packing: dots are a constant 4px radius. Inside each cluster we pack
  // them with adaptive spacing — if counts are very large, dots overlap
  // into a tight clump (still clearly colored/grouped) rather than scaling
  // the whole viz down.
  const maxClusterCount = Math.max(...dotsPerRes.map((r) => r.count), 1);
  const SAFE_HALF_HEIGHT = 300;
  const MAX_CLUSTER_RADIUS = 130; // target cluster size cap
  const GAP = 28; // min gap between adjacent clusters

  const clusterPadding = 6;
  // Solve spacing so the biggest cluster hits MAX_CLUSTER_RADIUS. For
  // clusters with few dots, use the natural 7px spacing. If the math
  // yields spacing below the dot diameter (8), dots will overlap within
  // the clump — that's the intended "clump" look.
  const DEFAULT_SPACING = 7.0;
  const PACK_SPACING = Math.min(
    DEFAULT_SPACING,
    (MAX_CLUSTER_RADIUS - clusterPadding) / Math.sqrt(maxClusterCount + 1)
  );

  const clusterRadiusFor = (count: number) =>
    count > 0 ? PACK_SPACING * Math.sqrt(count + 0.5) + clusterPadding : 0;

  const clusterRadii: Record<DotDef["resource"], number> = {
    lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0,
  };
  dotsPerRes.forEach((r) => {
    clusterRadii[r.resource] = clusterRadiusFor(r.count);
  });

  const adjacentMinDist: number[] = [];
  for (let i = 0; i < pentagonOrder.length; i++) {
    const a = pentagonOrder[i];
    const b = pentagonOrder[(i + 1) % pentagonOrder.length];
    adjacentMinDist.push(clusterRadii[a] + clusterRadii[b] + GAP);
  }
  const requiredR = Math.max(...adjacentMinDist) / (2 * Math.sin(Math.PI / 5));
  const maxClusterR = Math.max(...Object.values(clusterRadii));
  const fitR = SAFE_HALF_HEIGHT - maxClusterR - 8;
  const pentagonR = Math.max(120, Math.min(fitR, requiredR * 1.05));

  // Pentagon vertices: top first, going clockwise (SVG y-down).
  const baseAngle = -Math.PI / 2;
  const clusterCenters: Record<DotDef["resource"], { x: number; y: number }> =
    {
      lumber: { x: 0, y: 0 }, brick: { x: 0, y: 0 },
      wool:   { x: 0, y: 0 }, grain: { x: 0, y: 0 },
      ore:    { x: 0, y: 0 },
    };
  pentagonOrder.forEach((res, i) => {
    const a = baseAngle + (i * 2 * Math.PI) / 5;
    clusterCenters[res] = {
      x: pentagonR * Math.cos(a),
      y: pentagonR * Math.sin(a),
    };
  });

  // Place each dot using sunflower packing inside its cluster
  const chapter2 = flat.map((d) => {
    const center = clusterCenters[d.resource];
    const i = d.posInCluster;
    const r = PACK_SPACING * Math.sqrt(i + 0.5);
    const a = i * GOLDEN_ANGLE;
    return {
      x: center.x + Math.cos(a) * r,
      y: center.y + Math.sin(a) * r,
    };
  });

  // Resource boundaries inside `flat` (flat is sorted lumber→brick→wool→grain→ore)
  const resBoundaries = new Map<DotDef["resource"], [number, number]>();
  let cursor = 0;
  dotsPerRes.forEach((res) => {
    resBoundaries.set(res.resource, [cursor, cursor + res.count]);
    cursor += res.count;
  });

  // ---- CHAPTER 3: Stolen — robber + monopoly losses combined
  const stolenSet = new Set<number>();
  (["lumber", "brick", "wool", "grain", "ore"] as DotDef["resource"][])
    .forEach((res) => {
      const range = resBoundaries.get(res);
      if (!range) return;
      const [start, end] = range;
      const robberLost = Math.round(
        ((p[`stolen_${res}` as keyof Totals] as number) ?? 0) * scale
      );
      const monoLost = Math.round(
        ((p[`mono_loss_${res}` as keyof Totals] as number) ?? 0) * scale
      );
      const total = Math.min(robberLost + monoLost, end - start);
      for (let i = end - 1; i >= end - total; i--) stolenSet.add(i);
    });

  const chapter3 = flat.map((d, i) => {
    if (stolenSet.has(i)) {
      return { x: -800 + (i % 50), y: -400 + ((i * 13) % 200), opacity: 0 };
    }
    return { ...chapter2[i], opacity: 1 };
  });

  // ---- CHAPTER 4: 7-rolls — pick the ACTUAL lost-by-resource counts
  const lostSet = new Set<number>();
  (["lumber", "brick", "wool", "grain", "ore"] as DotDef["resource"][])
    .forEach((res) => {
      const range = resBoundaries.get(res);
      if (!range) return;
      const [start, end] = range;
      const realLost = Math.round(
        ((p[`lost7_${res}` as keyof Totals] as number) ?? 0) * scale
      );
      // pick from the end of this range, skipping any already-stolen
      let toMark = realLost;
      for (let i = end - 1; i >= start && toMark > 0; i--) {
        if (stolenSet.has(i)) continue;
        lostSet.add(i);
        toMark--;
      }
    });

  const chapter4 = flat.map((d, i) => {
    if (stolenSet.has(i)) return chapter3[i]; // already gone
    if (lostSet.has(i)) {
      return { x: -200 + ((i * 29) % 400), y: -800, opacity: 0 };
    }
    return { ...chapter2[i], opacity: 1 };
  });

  const stolenCount = stolenSet.size;
  const lostCount = lostSet.size;

  // ---- CHAPTER 5: Trading — real per-resource counts
  // (a) Traded-away: for each resource, pick `traded_away_<res>` dots from
  //     that resource's cluster (skipping any already stolen or lost to 7).
  // (b) Traded-for: NEW dots (colored by received resource) fly in from the
  //     right into their matching cluster. We append these to the dot list.
  const tradedAwaySet = new Set<number>();
  (["lumber", "brick", "wool", "grain", "ore"] as DotDef["resource"][])
    .forEach((res) => {
      const range = resBoundaries.get(res);
      if (!range) return;
      const [start, end] = range;
      const realAway = Math.round(
        ((p[`traded_away_${res}` as keyof Totals] as number) ?? 0) * scale
      );
      let toMark = realAway;
      for (let i = end - 1; i >= start && toMark > 0; i--) {
        if (stolenSet.has(i) || lostSet.has(i)) continue;
        tradedAwaySet.add(i);
        toMark--;
      }
    });

  // Build three waves of incoming dots. Each wave "arrives" at a specific
  // chapter — they're off-screen before that chapter and in-cluster after.
  // Waves (chapter indices, 0-based):
  //   chapter 3 = stole-from-others (robber + monopoly gains)
  //   chapter 4 = year-of-plenty
  //   chapter 7 = traded-for
  type IncomingDot = {
    resource: DotDef["resource"];
    color: string;
    posInCluster: number;
    arriveChapter: number; // 0-based chapter index
  };
  const incomingDots: IncomingDot[] = [];

  // Track how many slots each cluster has already consumed by originals +
  // earlier waves so each new wave stacks AFTER the previous ones.
  const clusterCursor: Record<DotDef["resource"], number> = {
    lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0,
  };
  (["lumber", "brick", "wool", "grain", "ore"] as DotDef["resource"][]).forEach(
    (res) => {
      clusterCursor[res] = dotsPerRes.find((x) => x.resource === res)?.count ?? 0;
    }
  );

  const colorFor = (res: DotDef["resource"]) =>
    res === "wool" ? "#4fa6eb" : RESOURCE_COLORS[res] ?? "#888";

  // Wave A: stole-from-others (robber_gain + mono_gain) — chapter index 4
  (["lumber", "brick", "wool", "grain", "ore"] as DotDef["resource"][]).forEach(
    (res) => {
      const robber = Math.round(
        ((p[`robber_gain_${res}` as keyof Totals] as number) ?? 0) * scale
      );
      const mono = Math.round(
        ((p[`mono_gain_${res}` as keyof Totals] as number) ?? 0) * scale
      );
      const n = robber + mono;
      for (let k = 0; k < n; k++) {
        incomingDots.push({
          resource: res,
          color: colorFor(res),
          posInCluster: clusterCursor[res]++,
          arriveChapter: 4,
        });
      }
    }
  );

  // Wave B: Year of Plenty — chapter index 6
  (["lumber", "brick", "wool", "grain", "ore"] as DotDef["resource"][]).forEach(
    (res) => {
      const n = Math.round(
        ((p[`yop_${res}` as keyof Totals] as number) ?? 0) * scale
      );
      for (let k = 0; k < n; k++) {
        incomingDots.push({
          resource: res,
          color: colorFor(res),
          posInCluster: clusterCursor[res]++,
          arriveChapter: 6,
        });
      }
    }
  );

  // Wave C: traded-for — chapter index 10 in new 13-chapter flow
  (["lumber", "brick", "wool", "grain", "ore"] as DotDef["resource"][]).forEach(
    (res) => {
      const n = Math.round(
        ((p[`traded_for_${res}` as keyof Totals] as number) ?? 0) * scale
      );
      for (let k = 0; k < n; k++) {
        incomingDots.push({
          resource: res,
          color: colorFor(res),
          posInCluster: clusterCursor[res]++,
          arriveChapter: 10,
        });
      }
    }
  );

  // Chapter 5: traded-AWAY dots exit; no new dots yet
  const chapter5 = flat.map((d, i) => {
    if (stolenSet.has(i)) return chapter3[i];
    if (lostSet.has(i)) return chapter4[i];
    if (tradedAwaySet.has(i)) {
      return { x: 800 + ((i * 19) % 50), y: -200 + ((i * 31) % 400), opacity: 0 };
    }
    return { ...chapter2[i], opacity: 1 };
  });
  // Chapter 6: traded-FOR dots fly in (handled by the incoming-dot
  // positions appended below). For existing dots, position is unchanged
  // from chapter 5.
  const chapter6Existing = chapter5.map((p) => ({ ...p }));

  // ---- CHAPTER 7: Spending — dots arranged in rows of recipe units.
  // Each build type is placed in its own bucket, filled with rows of
  // "units" where every unit = one build's worth of cards in recipe order.
  //   Settlement unit (×4):  brick, lumber, grain, wool
  //   City unit (×5):        ore, ore, ore, grain, grain
  //   Dev-card unit (×3):    ore, wool, grain
  type BucketName = "settlements" | "cities" | "dev";
  const recipes: Record<BucketName, DotDef["resource"][]> = {
    settlements: ["brick", "lumber", "grain", "wool"],
    cities:      ["ore", "ore", "ore", "grain", "grain"],
    dev:         ["ore", "wool", "grain"],
  };
  const unitCounts: Record<BucketName, number> = {
    settlements: Math.round(p.settlements * scale),
    cities:      Math.round(p.cities * scale),
    dev:         Math.round(p.dev_cards_bought * scale),
  };

  // Bucket x-range layout
  const bucketBounds: Record<BucketName, { xStart: number; xEnd: number }> = {
    settlements: { xStart: -480, xEnd: -180 },
    cities:      { xStart: -130, xEnd: 130 },
    dev:         { xStart:  180, xEnd: 480 },
  };
  const BUCKET_Y_TOP = -160;
  const BUCKET_Y_BOT = 260;

  // Generate target positions for each bucket — an ordered list of
  // (resource, x, y) slots
  type Slot = { resource: DotDef["resource"]; x: number; y: number };
  const bucketSlots: Record<BucketName, Slot[]> = {
    settlements: [],
    cities: [],
    dev: [],
  };

  (Object.keys(recipes) as BucketName[]).forEach((bName) => {
    const recipe = recipes[bName];
    const units = unitCounts[bName];
    if (units === 0) return;
    const { xStart, xEnd } = bucketBounds[bName];
    const cardsPerUnit = recipe.length;
    // Geometry
    const dotSpacing = 9; // px between dots inside a unit
    const unitGap = 18;   // px between units horizontally
    const rowHeight = 14; // px between row centers vertically
    const unitWidth = (cardsPerUnit - 1) * dotSpacing + unitGap;
    const bucketWidth = xEnd - xStart;
    const unitsPerRow = Math.max(1, Math.floor(bucketWidth / unitWidth));
    const rowCount = Math.ceil(units / unitsPerRow);
    // Compress row height if the bucket would overflow vertically
    const availableHeight = BUCKET_Y_BOT - BUCKET_Y_TOP;
    const actualRowHeight = Math.min(rowHeight, availableHeight / Math.max(rowCount, 1));

    for (let u = 0; u < units; u++) {
      const row = Math.floor(u / unitsPerRow);
      const col = u % unitsPerRow;
      const unitX = xStart + col * unitWidth;
      const unitY = BUCKET_Y_TOP + row * actualRowHeight;
      for (let c = 0; c < cardsPerUnit; c++) {
        bucketSlots[bName].push({
          resource: recipe[c],
          x: unitX + c * dotSpacing,
          y: unitY,
        });
      }
    }
  });

  // Build pools of available dots per resource (survivors + incoming)
  const availableFlat: Record<DotDef["resource"], number[]> = {
    lumber: [], brick: [], wool: [], grain: [], ore: [],
  };
  flat.forEach((d, i) => {
    if (stolenSet.has(i) || lostSet.has(i) || tradedAwaySet.has(i)) return;
    availableFlat[d.resource].push(i);
  });
  const availableIncoming: Record<DotDef["resource"], number[]> = {
    lumber: [], brick: [], wool: [], grain: [], ore: [],
  };
  incomingDots.forEach((inc, k) => {
    availableIncoming[inc.resource].push(k);
  });

  // Per-resource combined pools (originals then incoming)
  const pools: Record<DotDef["resource"], Array<["flat" | "inc", number]>> = {
    lumber: [], brick: [], wool: [], grain: [], ore: [],
  };
  (["lumber", "brick", "wool", "grain", "ore"] as DotDef["resource"][]).forEach((r) => {
    pools[r] = [
      ...availableFlat[r].map((i) => ["flat", i] as ["flat", number]),
      ...availableIncoming[r].map((i) => ["inc", i] as ["inc", number]),
    ];
  });
  const poolCursors: Record<DotDef["resource"], number> = {
    lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0,
  };

  // Assignment: for each bucket in order, iterate slot-by-slot and grab a
  // dot of the required resource from its pool. If the pool is empty, a
  // filler dot (colored correctly) is fabricated — invisible in earlier
  // chapters, visible at its slot in chapter 7. This keeps the recipe
  // exact regardless of upstream accounting.
  const flatChapter7 = new Map<number, { x: number; y: number; opacity: number }>();
  const incomingChapter7Map = new Map<number, { x: number; y: number; opacity: number }>();
  const fillerDots: {
    resource: DotDef["resource"];
    color: string;
    x: number;
    y: number;
  }[] = [];

  (["settlements", "cities", "dev"] as BucketName[]).forEach((bName) => {
    bucketSlots[bName].forEach((slot) => {
      const pool = pools[slot.resource];
      const cursor = poolCursors[slot.resource];
      const pos = { x: slot.x, y: slot.y, opacity: 1 };
      if (cursor < pool.length) {
        const [t, id] = pool[cursor];
        poolCursors[slot.resource] = cursor + 1;
        if (t === "flat") flatChapter7.set(id, pos);
        else incomingChapter7Map.set(id, pos);
      } else {
        fillerDots.push({
          resource: slot.resource,
          color:
            slot.resource === "wool"
              ? "#4fa6eb"
              : RESOURCE_COLORS[slot.resource] ?? "#888",
          x: slot.x,
          y: slot.y,
        });
      }
    });
  });

  // Leftover zone (top strip, faded)
  function leftoverPos(seed: number) {
    return { x: -400 + ((seed * 11) % 800), y: -290 + ((seed * 17) % 20), opacity: 0.18 };
  }

  const chapter7 = flat.map((d, i) => {
    if (stolenSet.has(i)) return chapter3[i];
    if (lostSet.has(i)) return chapter4[i];
    if (tradedAwaySet.has(i)) return chapter5[i];
    return flatChapter7.get(i) ?? leftoverPos(i);
  });
  const incomingChapter7: { x: number; y: number; opacity: number }[] =
    incomingDots.map((_, k) =>
      incomingChapter7Map.get(k) ?? leftoverPos(total + k)
    );

  // Assemble existing (original) dots for 13 chapters:
  //   1 intro  2 split  3 stolen  4 INSIGHT (stolen)  5 stole-from-others
  //   6 INSIGHT (stole)  7 YoP  8 lost-to-7  9 INSIGHT (7s)
  //   10 traded-away  11 traded-for  12 INSIGHT (trades)  13 spending
  const assembled: DotDef[] = flat.map((d, i) => ({
    id: d.id,
    color: d.color,
    resource: d.resource,
    positions: [
      { ...chapter1[i], opacity: 1 },    // 1 intro
      { ...chapter2[i], opacity: 1 },    // 2 split
      { ...chapter3[i] },                // 3 stolen
      { ...chapter3[i] },                // 4 INSIGHT stolen (hold)
      { ...chapter3[i] },                // 5 stole from others (hold)
      { ...chapter3[i] },                // 6 INSIGHT stole (hold)
      { ...chapter3[i] },                // 7 YoP (hold)
      { ...chapter4[i] },                // 8 lost to 7
      { ...chapter4[i] },                // 9 INSIGHT 7s (hold)
      { ...chapter5[i] },                // 10 traded away
      { ...chapter5[i] },                // 11 traded for (hold for originals)
      { ...chapter5[i] },                // 12 INSIGHT trades (hold)
      { ...chapter7[i] },                // 13 spending
    ],
  }));

  // Append incoming dots from all three waves. Each has its own
  // arriveChapter — invisible before, in-cluster at that chapter onward,
  // then routes to its spending slot (or leftover) at chapter 9.
  let nextId = assembled.length > 0 ? Math.max(...assembled.map((a) => a.id)) + 1 : 0;
  incomingDots.forEach((inc, k) => {
    const center = clusterCenters[inc.resource];
    const i = inc.posInCluster;
    const r = PACK_SPACING * Math.sqrt(i + 0.5);
    const a = i * GOLDEN_ANGLE;
    const inClusterPos = {
      x: center.x + Math.cos(a) * r,
      y: center.y + Math.sin(a) * r,
      opacity: 1,
    };
    const offscreenRight = {
      x: 800 + ((i * 19) % 50),
      y: -200 + ((i * 31) % 400),
      opacity: 0,
    };
    // Build 13-entry position array. Before arriveChapter → offscreen.
    // arriveChapter..11 → in cluster. 12 → spending slot or leftover.
    const positions = [];
    for (let c = 0; c < 12; c++) {
      positions.push(c < inc.arriveChapter ? offscreenRight : { ...inClusterPos });
    }
    positions.push(
      incomingChapter7Map.get(k) ?? leftoverPos(total + k)
    );
    assembled.push({
      id: nextId++,
      color: inc.color,
      resource: inc.resource,
      positions,
    });
  });

  // Filler dots — emerge from their resource's cluster. Invisible AT the
  // cluster center for chapters 1-12, then fade in and travel to their
  // spending slot during the chapter 12→13 transition.
  fillerDots.forEach((f) => {
    const center = clusterCenters[f.resource] ?? { x: 0, y: 0 };
    const hiddenAtCluster = { x: center.x, y: center.y, opacity: 0 };
    assembled.push({
      id: nextId++,
      color: f.color,
      resource: f.resource,
      positions: [
        hiddenAtCluster, hiddenAtCluster, hiddenAtCluster, hiddenAtCluster,
        hiddenAtCluster, hiddenAtCluster, hiddenAtCluster, hiddenAtCluster,
        hiddenAtCluster, hiddenAtCluster, hiddenAtCluster, hiddenAtCluster,
        { x: f.x, y: f.y, opacity: 1 }, // 13. emerges from cluster and travels to slot
      ],
    });
  });

  return { dots: assembled };
}

// ============================================================================
// Chapter copy
// ============================================================================

// Pick the resource with the highest count from a map; returns { name, count }.
function topResource(counts: Record<string, number>) {
  let best: { name: string; count: number } | null = null;
  for (const [k, v] of Object.entries(counts)) {
    if (best === null || v > best.count) best = { name: k, count: v };
  }
  return best ?? { name: "—", count: 0 };
}

type Chapter = {
  kind?: "narrative" | "insight";
  title: string;
  body: React.ReactNode;
};

function buildChapters(player: Totals): Chapter[] {
  const settleCost = player.settlements * COSTS.settlement;
  const cityCost = player.cities * COSTS.city;
  const devCost = player.dev_cards_bought * COSTS.dev;

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const top7 = topResource({
    Wood: player.lost7_lumber,
    Brick: player.lost7_brick,
    Sheep: player.lost7_wool,
    Wheat: player.lost7_grain,
    Ore: player.lost7_ore,
  });
  const topStolenFromYou = topResource({
    Wood: player.stolen_lumber + player.mono_loss_lumber,
    Brick: player.stolen_brick + player.mono_loss_brick,
    Sheep: player.stolen_wool + player.mono_loss_wool,
    Wheat: player.stolen_grain + player.mono_loss_grain,
    Ore: player.stolen_ore + player.mono_loss_ore,
  });
  const topStolenByYou = topResource({
    Wood: player.robber_gain_lumber + player.mono_gain_lumber,
    Brick: player.robber_gain_brick + player.mono_gain_brick,
    Sheep: player.robber_gain_wool + player.mono_gain_wool,
    Wheat: player.robber_gain_grain + player.mono_gain_grain,
    Ore: player.robber_gain_ore + player.mono_gain_ore,
  });
  const topTradedAway = topResource({
    Wood: player.traded_away_lumber,
    Brick: player.traded_away_brick,
    Sheep: player.traded_away_wool,
    Wheat: player.traded_away_grain,
    Ore: player.traded_away_ore,
  });
  const topTradedFor = topResource({
    Wood: player.traded_for_lumber,
    Brick: player.traded_for_brick,
    Sheep: player.traded_for_wool,
    Wheat: player.traded_for_grain,
    Ore: player.traded_for_ore,
  });

  const name = player.username;
  const stolenFromYou =
    player.stolen_lumber + player.stolen_brick + player.stolen_wool +
    player.stolen_grain + player.stolen_ore +
    player.mono_loss_lumber + player.mono_loss_brick + player.mono_loss_wool +
    player.mono_loss_grain + player.mono_loss_ore;
  const stolenByYou =
    player.robber_gain_lumber + player.robber_gain_brick + player.robber_gain_wool +
    player.robber_gain_grain + player.robber_gain_ore +
    player.mono_gain_lumber + player.mono_gain_brick + player.mono_gain_wool +
    player.mono_gain_grain + player.mono_gain_ore;
  const yopTotal =
    player.yop_lumber + player.yop_brick + player.yop_wool +
    player.yop_grain + player.yop_ore;

  return [
    {
      title: "Drill, Baby, Drill",
      body: `${name} extracted ${player.cards_from_rolls} resource cards from dice rolls across all of their games.`,
    },
    {
      title: "Breakdown of Resources by Type",
      body: (
        <div className="flex flex-wrap gap-2 mt-3">
          <ResourcePill label="Wood" count={player.gained_lumber} color="#517d19" />
          <ResourcePill label="Brick" count={player.gained_brick} color="#9c4300" />
          <ResourcePill label="Sheep" count={player.gained_wool} color="#4fa6eb" dark />
          <ResourcePill label="Wheat" count={player.gained_grain} color="#f0ad00" />
          <ResourcePill label="Ore" count={player.gained_ore} color="#7b6f83" />
        </div>
      ),
    },
    {
      title: "Oh No!!!",
      body: `Opponents took ${stolenFromYou} resources from ${name} via robbers and monopolies.`,
    },
    {
      kind: "insight",
      title: cap(topStolenFromYou.name),
      body: `is the resource opponents stole from ${name} the most — ${topStolenFromYou.count} cards lost to robbers and monopolies.`,
    },
    {
      title: "What Goes Around Comes Around",
      body: `${name} stole ${stolenByYou} resources from others via robbers and monopolies.`,
    },
    {
      kind: "insight",
      title: cap(topStolenByYou.name),
      body: `is the resource ${name} stole from opponents most — ${topStolenByYou.count} cards taken via robbers and monopolies.`,
    },
    {
      title: "Year of Plenty",
      body: `${name} gained ${yopTotal} resources from playing Year of Plenty cards.`,
    },
    {
      title: "Don't be Greedy",
      body: `${name} had to give up ${player.cards_lost_to_7} resources because 7s were rolled.`,
    },
    {
      kind: "insight",
      title: cap(top7.name),
      body: `is the resource ${name} discarded the most on 7-rolls — ${top7.count} cards in total.`,
    },
    {
      title: "The Art of the Deal",
      body: `Across every P2P trade and every bank/port trade, ${name} traded away ${player.cards_traded_away} resources.`,
    },
    {
      title: "The Art of the Deal",
      body: `${name} received ${player.cards_traded_for} cards in return.`,
    },
    {
      kind: "insight",
      title: `${cap(topTradedAway.name)} out, ${cap(topTradedFor.name)} in`,
      body: `${name} gave up ${cap(topTradedAway.name).toLowerCase()} (${topTradedAway.count}) more than any other resource, and brought back ${cap(topTradedFor.name).toLowerCase()} (${topTradedFor.count}) the most.`,
    },
    {
      title: "Big Spender",
      body: `${name} spent ${settleCost} resources on ${player.settlements} settlements, ${cityCost} on ${player.cities} cities, and ${devCost} on ${player.dev_cards_bought} dev cards.`,
    },
  ];
}

function ResourcePill({
  label,
  count,
  color,
  dark,
}: {
  label: string;
  count: number;
  color: string;
  dark?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-black font-extrabold"
      style={{ background: color, color: dark ? "#1a2332" : "#fff" }}
    >
      <span>{label}</span>
      <span className="font-mono">{count}</span>
    </span>
  );
}
