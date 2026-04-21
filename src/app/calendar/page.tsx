"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useGames,
  useRosters,
  useStandings,
  formatDuration,
  GameMeta,
} from "@/lib/analysisData";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  parseISO,
} from "date-fns";

export default function CalendarPage() {
  const { data: games } = useGames();
  const { data: rosters } = useRosters();
  const { data: standings } = useStandings();
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Initialise anchor once games load
  const effectiveAnchor = anchor ?? (games && games.length > 0
    ? startOfMonth(parseISO(games[games.length - 1].start_time))
    : new Date());

  const gamesByDay = useMemo(() => {
    const map = new Map<string, GameMeta[]>();
    (games ?? []).forEach((g) => {
      const day = format(parseISO(g.start_time), "yyyy-MM-dd");
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(g);
    });
    return map;
  }, [games]);

  if (!games || !rosters || !standings) {
    return <div className="text-muted">Loading calendar…</div>;
  }

  const monthStart = startOfMonth(effectiveAnchor);
  const monthEnd = endOfMonth(effectiveAnchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const selectedGames =
    selectedDay &&
    (gamesByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Calendar</h1>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setAnchor(addMonths(effectiveAnchor, -1))}
          className="px-3 py-2 bg-card border-[3px] border-black rounded-lg hover:border-accent text-sm"
        >
          ← Prev
        </button>
        <div className="text-xl font-semibold">{format(effectiveAnchor, "MMMM yyyy")}</div>
        <button
          onClick={() => setAnchor(addMonths(effectiveAnchor, 1))}
          className="px-3 py-2 bg-card border-[3px] border-black rounded-lg hover:border-accent text-sm"
        >
          Next →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-bold text-muted uppercase tracking-wide">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const count = gamesByDay.get(key)?.length ?? 0;
          const inMonth = isSameMonth(day, monthStart);
          const isSelected = selectedDay && isSameDay(day, selectedDay);
          const hasGames = count > 0;
          return (
            <button
              key={key}
              onClick={() => hasGames && setSelectedDay(day)}
              disabled={!hasGames}
              className={`aspect-square rounded-lg border text-left p-2 transition-all ${
                !inMonth ? "opacity-30" : ""
              } ${
                hasGames
                  ? "bg-accent-alt-soft border-accent-alt hover:bg-[#d8e5bf] cursor-pointer"
                  : "bg-card border-card-border cursor-default"
              } ${isSelected ? "ring-2 ring-accent" : ""}`}
            >
              <div className="text-sm font-semibold">{format(day, "d")}</div>
              {hasGames && (
                <div className="mt-1 text-xs font-extrabold" style={{ color: "#517d19" }}>
                  {count} {count === 1 ? "game" : "games"}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (selectedGames?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">
            {format(selectedDay, "MMMM d, yyyy")} · {selectedGames!.length}{" "}
            {selectedGames!.length === 1 ? "game" : "games"}
          </h2>
          <div className="space-y-2">
            {selectedGames!.map((g) => (
              <GameSummaryCard
                key={g.game_id}
                game={g}
                rosters={rosters}
                standings={standings}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GameSummaryCard({
  game,
  rosters,
  standings,
}: {
  game: GameMeta;
  rosters: { game_id: string; player_color: number; username: string; is_bot: boolean }[];
  standings: { game_id: string; player_color: number; rank: number; vp_total: number; won: boolean; vp_cards: number }[];
}) {
  const players = rosters.filter((r) => r.game_id === game.game_id);
  const standingsForGame = standings.filter((s) => s.game_id === game.game_id);
  const byColor = new Map(standingsForGame.map((s) => [s.player_color, s]));
  const sortedPlayers = [...players].sort(
    (a, b) => (byColor.get(a.player_color)?.rank ?? 99) - (byColor.get(b.player_color)?.rank ?? 99)
  );

  return (
    <Link
      href={`/games/${game.game_id}`}
      className="block bg-card border-[3px] border-black rounded-lg p-4 hover:border-accent transition-colors"
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-mono text-muted">
            {format(parseISO(game.start_time), "h:mm a")}
          </span>
          <span className="flex items-center gap-2 text-sm">
            {sortedPlayers.map((p, i) => {
              const s = byColor.get(p.player_color);
              return (
                <span key={p.player_color}>
                  <span className={s?.won ? "text-accent font-semibold" : "text-foreground"}>
                    {s?.won ? "W " : ""}
                    {p.username}
                  </span>
                  <span className="text-muted ml-1 text-xs">{s?.vp_total}vp</span>
                  {i < sortedPlayers.length - 1 && <span className="text-muted ml-2">·</span>}
                </span>
              );
            })}
          </span>
        </div>
        <div className="text-xs text-muted flex items-center gap-3">
          <span>{game.total_turns} turns</span>
          <span>{formatDuration(game.duration_s)}</span>
          <span className="text-accent">View →</span>
        </div>
      </div>
    </Link>
  );
}
