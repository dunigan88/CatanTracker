import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { fetchGameHistory, ColonistGame } from "@/lib/colonist";

export async function POST() {
  const db = getDb();

  const players = db
    .prepare("SELECT colonist_username FROM players")
    .all() as { colonist_username: string }[];

  if (players.length === 0) {
    return NextResponse.json({ error: "No players registered" }, { status: 400 });
  }

  const playerSet = new Set(players.map((p) => p.colonist_username.toLowerCase()));

  // Fetch history for all players
  const allGames = new Map<string, ColonistGame>();
  const errors: string[] = [];

  for (const player of players) {
    try {
      const games = await fetchGameHistory(player.colonist_username);
      for (const game of games) {
        if (!game.finished) continue;
        if (allGames.has(game.id)) continue;

        // Only include games where ALL human players are in our group
        const humanPlayers = game.players.filter((p) => p.isHuman);
        const allInGroup = humanPlayers.every((p) =>
          playerSet.has(p.username.toLowerCase())
        );

        if (allInGroup && humanPlayers.length >= 2) {
          allGames.set(game.id, game);
        }
      }
    } catch (e: unknown) {
      errors.push(
        `${player.colonist_username}: ${e instanceof Error ? e.message : "Unknown error"}`
      );
    }
  }

  // Upsert games into database
  const insertGame = db.prepare(`
    INSERT OR IGNORE INTO games (id, start_time, duration_ms, turn_count, vp_to_win, max_players, is_private, friendly_robber, map_setting)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertGamePlayer = db.prepare(`
    INSERT OR IGNORE INTO game_players (game_id, colonist_username, rank, points, finished, quit_with_penalty, player_color, play_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let newGames = 0;

  const insertAll = db.transaction(() => {
    for (const game of allGames.values()) {
      const result = insertGame.run(
        game.id,
        new Date(Number(game.startTime)).toISOString(),
        Number(game.duration),
        game.turnCount,
        game.setting.victoryPointsToWin,
        game.setting.maxPlayers,
        game.setting.privateGame ? 1 : 0,
        game.setting.friendlyRobber ? 1 : 0,
        game.setting.mapSetting
      );

      if (result.changes > 0) {
        newGames++;
        for (const p of game.players.filter((p) => p.isHuman)) {
          insertGamePlayer.run(
            game.id,
            p.username,
            p.rank,
            p.points,
            p.finished ? 1 : 0,
            p.quitWithPenalty ? 1 : 0,
            p.playerColor,
            p.playOrder
          );
        }
      }
    }
  });

  insertAll();

  return NextResponse.json({
    totalFound: allGames.size,
    newGames,
    errors: errors.length > 0 ? errors : undefined,
  });
}
