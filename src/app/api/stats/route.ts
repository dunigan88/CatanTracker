import { NextResponse } from "next/server";
import getDb from "@/lib/db";

interface PlayerRow {
  colonist_username: string;
  display_name: string;
}

interface StatsRow {
  username_lower: string;
  total_games: number;
  wins: number;
  avg_vp: number;
  avg_rank: number;
}

interface RecentGameRow {
  id: string;
  start_time: string;
  duration_ms: number;
  turn_count: number;
  vp_to_win: number;
  max_players: number;
}

interface GamePlayerRow {
  game_id: string;
  colonist_username: string;
  rank: number;
  points: number;
}

interface HeadToHeadRow {
  opponent: string;
  games: number;
  wins: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const player = searchParams.get("player");
  const from = searchParams.get("from");
  const db = getDb();

  if (player) {
    return getPlayerStats(db, player, from);
  }

  return getLeaderboard(db, from);
}

function getLeaderboard(db: ReturnType<typeof getDb>, from: string | null) {
  const players = db.prepare("SELECT * FROM players").all() as PlayerRow[];

  const fromIso = from ? new Date(from).toISOString() : null;

  const stats = db
    .prepare(
      `
    SELECT
      LOWER(gp.colonist_username) as username_lower,
      COUNT(*) as total_games,
      SUM(CASE WHEN gp.rank = 1 THEN 1 ELSE 0 END) as wins,
      ROUND(AVG(gp.points), 1) as avg_vp,
      ROUND(AVG(gp.rank), 2) as avg_rank
    FROM game_players gp
    JOIN games g ON g.id = gp.game_id
    WHERE (? IS NULL OR g.start_time >= ?)
    GROUP BY LOWER(gp.colonist_username)
  `
    )
    .all(fromIso, fromIso) as StatsRow[];

  const statsMap = new Map(stats.map((s) => [s.username_lower, s]));

  const leaderboard = players.map((p) => {
    const s = statsMap.get(p.colonist_username.toLowerCase());
    return {
      username: p.colonist_username,
      displayName: p.display_name,
      totalGames: s?.total_games ?? 0,
      wins: s?.wins ?? 0,
      winRate: s && s.total_games > 0 ? Math.round((s.wins / s.total_games) * 100) : 0,
      avgVp: s?.avg_vp ?? 0,
      avgRank: s?.avg_rank ?? 0,
    };
  });

  leaderboard.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.totalGames - a.totalGames;
  });

  const recentGames = db
    .prepare(
      `
    SELECT g.id, g.start_time, g.duration_ms, g.turn_count, g.vp_to_win, g.max_players
    FROM games g
    WHERE (? IS NULL OR g.start_time >= ?)
    ORDER BY g.start_time DESC
    LIMIT 10
  `
    )
    .all(fromIso, fromIso) as RecentGameRow[];

  const gameIds = recentGames.map((g) => g.id);
  const gamePlayers =
    gameIds.length > 0
      ? (db
          .prepare(
            `SELECT game_id, colonist_username, rank, points FROM game_players WHERE game_id IN (${gameIds.map(() => "?").join(",")}) ORDER BY rank ASC`
          )
          .all(...gameIds) as GamePlayerRow[])
      : [];

  const gamePlayersMap = new Map<string, GamePlayerRow[]>();
  for (const gp of gamePlayers) {
    if (!gamePlayersMap.has(gp.game_id)) gamePlayersMap.set(gp.game_id, []);
    gamePlayersMap.get(gp.game_id)!.push(gp);
  }

  const recentGamesWithPlayers = recentGames.map((g) => ({
    ...g,
    players: gamePlayersMap.get(g.id) ?? [],
  }));

  return NextResponse.json({ leaderboard, recentGames: recentGamesWithPlayers });
}

function getPlayerStats(
  db: ReturnType<typeof getDb>,
  username: string,
  from: string | null
) {
  const player = db
    .prepare("SELECT * FROM players WHERE LOWER(colonist_username) = LOWER(?)")
    .get(username) as PlayerRow | undefined;

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const fromIso = from ? new Date(from).toISOString() : null;
  const userLower = player.colonist_username.toLowerCase();

  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) as total_games,
      SUM(CASE WHEN gp.rank = 1 THEN 1 ELSE 0 END) as wins,
      ROUND(AVG(gp.points), 1) as avg_vp,
      ROUND(AVG(gp.rank), 2) as avg_rank
    FROM game_players gp
    JOIN games g ON g.id = gp.game_id
    WHERE LOWER(gp.colonist_username) = ?
      AND (? IS NULL OR g.start_time >= ?)
  `
    )
    .get(userLower, fromIso, fromIso) as StatsRow;

  // Head-to-head records
  const h2h = db
    .prepare(
      `
    SELECT
      MIN(opp.colonist_username) as opponent,
      COUNT(DISTINCT opp.game_id) as games,
      SUM(CASE WHEN me.rank < opp.rank THEN 1 ELSE 0 END) as wins
    FROM game_players me
    JOIN game_players opp ON me.game_id = opp.game_id AND LOWER(opp.colonist_username) != LOWER(me.colonist_username)
    JOIN games g ON g.id = me.game_id
    WHERE LOWER(me.colonist_username) = ?
      AND (? IS NULL OR g.start_time >= ?)
    GROUP BY LOWER(opp.colonist_username)
  `
    )
    .all(userLower, fromIso, fromIso) as HeadToHeadRow[];

  // Recent games
  const recentGames = db
    .prepare(
      `
    SELECT g.id, g.start_time, g.duration_ms, g.turn_count, g.vp_to_win, g.max_players
    FROM games g
    JOIN game_players gp ON gp.game_id = g.id
    WHERE LOWER(gp.colonist_username) = ?
      AND (? IS NULL OR g.start_time >= ?)
    ORDER BY g.start_time DESC
    LIMIT 20
  `
    )
    .all(userLower, fromIso, fromIso) as RecentGameRow[];

  const gameIds = recentGames.map((g) => g.id);
  const gamePlayers =
    gameIds.length > 0
      ? (db
          .prepare(
            `SELECT game_id, colonist_username, rank, points FROM game_players WHERE game_id IN (${gameIds.map(() => "?").join(",")}) ORDER BY rank ASC`
          )
          .all(...gameIds) as GamePlayerRow[])
      : [];

  const gamePlayersMap = new Map<string, GamePlayerRow[]>();
  for (const gp of gamePlayers) {
    if (!gamePlayersMap.has(gp.game_id)) gamePlayersMap.set(gp.game_id, []);
    gamePlayersMap.get(gp.game_id)!.push(gp);
  }

  return NextResponse.json({
    player: {
      username: player.colonist_username,
      displayName: player.display_name,
    },
    stats: {
      totalGames: stats.total_games,
      wins: stats.wins,
      winRate: stats.total_games > 0 ? Math.round((stats.wins / stats.total_games) * 100) : 0,
      avgVp: stats.avg_vp,
      avgRank: stats.avg_rank,
    },
    headToHead: h2h.map((r) => ({
      opponent: r.opponent,
      games: r.games,
      wins: r.wins,
      losses: r.games - r.wins,
      winRate: Math.round((r.wins / r.games) * 100),
    })),
    recentGames: recentGames.map((g) => ({
      ...g,
      players: gamePlayersMap.get(g.id) ?? [],
    })),
  });
}
