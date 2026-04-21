"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  useGames,
  usePerGamePlayer,
  useMostGainedSingleRoll,
  useMostDiscardedSingleRoll,
  useMostTradesCompletedGame,
  useMostResourcesTradedGame,
  useMostMonopolyHaul,
  useMostResourcesLostTurn,
  useMostConsecutiveRollTurns,
  useLuckiestGame,
  useUnluckiestGame,
  useMostDevCardsTurn,
  useLargestArmyRecord,
  useLongestRoadRecord,
  formatDuration,
  resourceName,
  GameMeta,
  PerGamePlayer,
  SingleRollRecord,
  MonopolyHaulRecord,
  GameLuckRecord,
} from "@/lib/analysisData";

export default function RecordsPage() {
  const { data: games } = useGames();
  const { data: pgp } = usePerGamePlayer();
  const { data: gainedSingleRoll } = useMostGainedSingleRoll();
  const { data: discardedSingleRoll } = useMostDiscardedSingleRoll();
  const { data: tradesCompleted } = useMostTradesCompletedGame();
  const { data: resourcesTraded } = useMostResourcesTradedGame();
  const { data: monopolyHaul } = useMostMonopolyHaul();
  const { data: resourcesLostTurn } = useMostResourcesLostTurn();
  const { data: consecutiveRolls } = useMostConsecutiveRollTurns();
  const { data: luckiest } = useLuckiestGame();
  const { data: unluckiest } = useUnluckiestGame();
  const { data: devCardsTurn } = useMostDevCardsTurn();
  const { data: largestArmy } = useLargestArmyRecord();
  const { data: longestRoad } = useLongestRoadRecord();

  const gameLabel = (gid: string) => {
    const g = games?.find((x) => x.game_id === gid);
    if (!g) return gid;
    return new Date(g.start_time).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  };

  const gameRecords = useMemo(() => {
    if (!games) return null;
    return {
      longestDuration: [...games].sort((a, b) => b.duration_s - a.duration_s).slice(0, 10),
      mostTurns: [...games].sort((a, b) => b.total_turns - a.total_turns).slice(0, 10),
      shortestDuration: [...games].sort((a, b) => a.duration_s - b.duration_s).slice(0, 10),
      fewestTurns: [...games].sort((a, b) => a.total_turns - b.total_turns).slice(0, 10),
    };
  }, [games]);

  const playerRecords = useMemo(() => {
    if (!pgp) return null;
    const sortBy = (key: keyof PerGamePlayer) =>
      [...pgp]
        .sort((a, b) => (b[key] as number) - (a[key] as number))
        .slice(0, 10);
    return {
      mostCardsFromRolls: sortBy("cards_from_rolls"),
      mostDevCards: sortBy("dev_cards_bought"),
      mostSteals: sortBy("n_steals_done"),
      mostBlocked: sortBy("resources_blocked"),
      longestDry: sortBy("longest_dry"),
      mostStolenFrom: sortBy("n_stolen_from"),
      mostCardsLostTo7: sortBy("cards_lost_to_7"),
    };
  }, [pgp]);

  if (
    !games || !pgp || !gameRecords || !playerRecords ||
    !gainedSingleRoll || !discardedSingleRoll ||
    !tradesCompleted || !resourcesTraded || !monopolyHaul ||
    !resourcesLostTurn || !consecutiveRolls ||
    !luckiest || !unluckiest || !devCardsTurn ||
    !largestArmy || !longestRoad
  ) {
    return <div className="text-muted">Loading records…</div>;
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-center">
        <h1
          className="nav-pill text-3xl md:text-4xl px-8 py-3"
          style={
            {
              ["--pill-bg" as string]: "#f0ad00",
              ["--pill-hover" as string]: "#f0ad00",
            } as React.CSSProperties
          }
        >
          Record Book
        </h1>
      </div>

      <Section title="Longest Games (Minutes)">
        <GameTable
          rows={gameRecords.longestDuration}
          render={(g) => (
            <>
              <td className="px-3 py-3 font-extrabold text-accent-alt text-base">{formatDuration(g.duration_s)}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">{g.total_turns} turns · {g.n_players} players</td>
            </>
          )}
          headers={["Duration", "Details"]}
          note="Real-world wall-clock time between a game's first and last event."
        />
      </Section>

      <Section title="Longest Games (Turns)">
        <GameTable
          rows={gameRecords.mostTurns}
          render={(g) => (
            <>
              <td className="px-3 py-3 font-extrabold text-accent-alt text-base">{g.total_turns}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">{formatDuration(g.duration_s)} · {g.n_players} players</td>
            </>
          )}
          headers={["Turns", "Details"]}
          note="Number of turns completed before someone won."
        />
      </Section>

      <Section title="Shortest Games (Minutes)">
        <GameTable
          rows={gameRecords.shortestDuration}
          render={(g) => (
            <>
              <td className="px-3 py-3 font-extrabold text-accent-alt text-base">{formatDuration(g.duration_s)}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">{g.total_turns} turns · {g.n_players} players</td>
            </>
          )}
          headers={["Duration", "Details"]}
          note="Fastest games by wall-clock time."
        />
      </Section>

      <Section title="Shortest Games (Turns)">
        <GameTable
          rows={gameRecords.fewestTurns}
          render={(g) => (
            <>
              <td className="px-3 py-3 font-extrabold text-accent-alt text-base">{g.total_turns}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">{formatDuration(g.duration_s)} · {g.n_players} players</td>
            </>
          )}
          headers={["Turns", "Details"]}
          note="Fewest turns taken to settle a game."
        />
      </Section>

      <h2 className="text-3xl font-extrabold tracking-wide uppercase pt-6">Individual Records</h2>

      <Section title="Most Resource Cards Gained From Rolls (Single Game)">
        <PlayerTable
          rows={playerRecords.mostCardsFromRolls}
          valueKey="cards_from_rolls"
          gameLabel={gameLabel}
          note="Total resource cards this player received from dice rolls over a single game."
        />
      </Section>

      <Section title="Most Resources Collected (Single Roll)">
        <SingleRollTable
          rows={gainedSingleRoll}
          gameLabel={gameLabel}
          valueHeader="Cards"
          note="Cards this player gained from one specific dice roll — e.g. rolling 6/8 when multiple of their cities/settlements are adjacent to that tile."
        />
      </Section>

      <Section title="Most Development Cards Bought (Single Game)">
        <PlayerTable
          rows={playerRecords.mostDevCards}
          valueKey="dev_cards_bought"
          gameLabel={gameLabel}
          note="Dev cards this player purchased in one game."
        />
      </Section>

      <Section title="Most Development Cards Bought (Single Turn)">
        <SingleRollTable
          rows={devCardsTurn.map((r) => ({
            game_id: r.game_id,
            turn: r.turn,
            player_color: r.player_color,
            username: r.username,
            n_cards: r.n_cards,
          }))}
          gameLabel={gameLabel}
          valueHeader="Cards"
          note="Dev cards this player bought during one single turn — requires an ore + wheat + sheep for each purchase."
        />
      </Section>

      <Section title="Most Trades Completed (Single Game)">
        <SimpleRecordTable
          rows={tradesCompleted.map((r) => ({
            key: `${r.game_id}-${r.player_color}`,
            username: r.username,
            value: r.n_trades,
            game_id: r.game_id,
          }))}
          gameLabel={gameLabel}
          valueHeader="Trades"
          note="P2P trades this player was part of in one game (as either the offerer whose trade was accepted, or the accepter)."
        />
      </Section>

      <Section title="Most Resources Traded (Single Game)">
        <SimpleRecordTable
          rows={resourcesTraded.map((r) => ({
            key: `${r.game_id}-${r.player_color}`,
            username: r.username,
            value: r.n_cards_traded,
            game_id: r.game_id,
          }))}
          gameLabel={gameLabel}
          valueHeader="Cards"
          note="Total cards (given + received) across every P2P trade this player participated in during one game."
        />
      </Section>

      <Section title="Largest Army">
        <SimpleRecordTable
          rows={largestArmy.map((r) => ({
            key: `${r.game_id}-${r.player_color}`,
            username: r.username,
            value: r.n_knights,
            game_id: r.game_id,
          }))}
          gameLabel={gameLabel}
          valueHeader="Knights"
          note="Most Knight dev cards played by one player in a single game — 3 is the minimum to claim Largest Army."
        />
      </Section>

      <Section title="Longest Road">
        <SimpleRecordTable
          rows={longestRoad.map((r) => ({
            key: `${r.game_id}-${r.player_color}`,
            username: r.username,
            value: r.n_roads,
            game_id: r.game_id,
          }))}
          gameLabel={gameLabel}
          valueHeader="Road Length"
          note="Longest unbroken chain of roads ever controlled by one player in a single game — 5 is the minimum to claim Longest Road."
        />
      </Section>

      <Section title="Most Robber Steals (Single Game)">
        <PlayerTable
          rows={playerRecords.mostSteals}
          valueKey="n_steals_done"
          gameLabel={gameLabel}
          note="Times this player placed the robber and successfully stole a card from an opponent."
        />
      </Section>

      <Section title="Most Resources Blocked by Robber (Single Game)">
        <PlayerTable
          rows={playerRecords.mostBlocked}
          valueKey="resources_blocked"
          gameLabel={gameLabel}
          note="Cards this player's tiles would have produced but didn't because the robber was parked on the number that was rolled."
        />
      </Section>

      <Section title="Most Times Stolen From (Single Game)">
        <PlayerTable
          rows={playerRecords.mostStolenFrom}
          valueKey="n_stolen_from"
          gameLabel={gameLabel}
          note="Cards this player lost to opponents' robber placements over a single game."
        />
      </Section>

      <Section title="Most Cards Lost to a 7-Roll (Single Game)">
        <PlayerTable
          rows={playerRecords.mostCardsLostTo7}
          valueKey="cards_lost_to_7"
          gameLabel={gameLabel}
          note="Total cards this player had to discard across every 7-roll in one game."
        />
      </Section>

      <Section title="Most Cards Lost to a 7 (Single Roll)">
        <SingleRollTable
          rows={discardedSingleRoll}
          gameLabel={gameLabel}
          valueHeader="Cards Lost"
          note="Cards one player had to discard on one specific 7-roll — happens when they were holding 8 or more cards at the time."
        />
      </Section>

      <Section title="Most Resources Stolen With Monopoly Card (Single Turn)">
        <MonopolyHaulTable
          rows={monopolyHaul}
          gameLabel={gameLabel}
          note="Cards a player took from all opponents combined using a single Monopoly dev card play."
        />
      </Section>

      <Section title="Most Resources Lost (Single Turn)">
        <SingleRollTable
          rows={resourcesLostTurn.map((r) => ({
            game_id: r.game_id,
            turn: r.turn,
            player_color: r.player_color,
            username: r.username,
            n_cards: r.n_cards,
          }))}
          gameLabel={gameLabel}
          valueHeader="Cards Lost"
          note="Cards a player lost in a single turn across every channel — 7-roll discards, opponents' robber steals, and opponents' monopoly plays combined."
        />
      </Section>

      <Section title="Longest Dry Spell (Turns Without a Resource)">
        <PlayerTable
          rows={playerRecords.longestDry}
          valueKey="longest_dry"
          gameLabel={gameLabel}
          note="Consecutive turns this player gained zero cards, in a single game."
        />
      </Section>

      <Section title="Most Consecutive Turns Getting a Resource From Rolls (Single Game)">
        <SimpleRecordTable
          rows={consecutiveRolls.map((r) => ({
            key: `${r.game_id}-${r.player_color}`,
            username: r.username,
            value: r.n_turns,
            game_id: r.game_id,
          }))}
          gameLabel={gameLabel}
          valueHeader="Turns"
          note="Longest unbroken streak of turns in a single game where this player gained at least one card from a dice roll."
        />
      </Section>

      <Section title="Luckiest Game">
        <LuckTable
          rows={luckiest}
          gameLabel={gameLabel}
          note="Games where a player's Resources From Rolls most exceeded what their pips, city upgrades, and robber blocks would predict. Games with fewer than 20 expected cards are excluded to avoid tiny-sample outliers."
        />
      </Section>

      <Section title="Unluckiest Game">
        <LuckTable
          rows={unluckiest}
          gameLabel={gameLabel}
          note="Games where a player's Resources From Rolls fell short of what their pips, city upgrades, and robber blocks would predict. Games with fewer than 20 expected cards are excluded to avoid tiny-sample outliers."
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group bg-card border-[3px] border-black rounded-lg overflow-hidden">
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

function GameTable({
  rows,
  render,
  headers,
  note,
}: {
  rows: GameMeta[];
  render: (g: GameMeta) => React.ReactNode;
  headers: string[];
  note?: string;
}) {
  return (
    <div>
      <table className="w-full text-base">
        <thead className="bg-[#e5d4a3]">
          <tr>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">#</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Date</th>
            {headers.map((h) => (
              <th key={h} className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">{h}</th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((g, i) => (
            <tr key={g.game_id} className="border-t border-card-border hover:bg-[#faf5e4]">
              <td className="px-3 py-3 text-black font-bold">{i + 1}</td>
              <td className="px-3 py-2">
                {new Date(g.start_time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </td>
              {render(g)}
              <td className="px-3 py-2 text-right">
                <Link href={`/games/${g.game_id}`} className="text-accent hover:underline text-xs">View →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <p className="text-xs text-muted italic px-4 py-3 border-t border-card-border">
          {note}
        </p>
      )}
    </div>
  );
}

function PlayerTable({
  rows,
  valueKey,
  gameLabel,
  note,
}: {
  rows: PerGamePlayer[];
  valueKey: keyof PerGamePlayer;
  gameLabel: (gid: string) => string;
  note?: string;
}) {
  return (
    <div>
      <table className="w-full text-base">
        <thead className="bg-[#e5d4a3]">
          <tr>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">#</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Player</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Value</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Game</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.game_id}-${r.player_color}`} className="border-t border-card-border hover:bg-[#faf5e4]">
              <td className="px-3 py-3 text-black font-bold">{i + 1}</td>
              <td className="px-3 py-3 text-black font-extrabold">
                {r.username}
                {r.won && <span className="ml-2 text-xs font-extrabold" style={{ color: "#f0ad00" }}>W</span>}
              </td>
              <td className="px-3 py-3 font-extrabold text-accent-alt text-lg">{r[valueKey] as number}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">
                <Link href={`/games/${r.game_id}`} className="hover:text-accent">
                  {gameLabel(r.game_id)} →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <p className="text-xs text-muted italic px-4 py-3 border-t border-card-border">
          {note}
        </p>
      )}
    </div>
  );
}

function SimpleRecordTable({
  rows,
  gameLabel,
  valueHeader,
  note,
}: {
  rows: { key: string; username: string; value: number; game_id: string }[];
  gameLabel: (gid: string) => string;
  valueHeader: string;
  note?: string;
}) {
  return (
    <div>
      <table className="w-full text-base">
        <thead className="bg-[#e5d4a3]">
          <tr>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">#</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Player</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">{valueHeader}</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Game</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className="border-t border-card-border hover:bg-[#faf5e4]">
              <td className="px-3 py-3 text-black font-bold">{i + 1}</td>
              <td className="px-3 py-3 text-black font-extrabold">{r.username}</td>
              <td className="px-3 py-3 font-extrabold text-accent-alt text-lg">{r.value}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">
                <Link href={`/games/${r.game_id}`} className="hover:text-accent">
                  {gameLabel(r.game_id)} →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <p className="text-xs text-muted italic px-4 py-3 border-t border-card-border">
          {note}
        </p>
      )}
    </div>
  );
}

function LuckTable({
  rows,
  gameLabel,
  note,
}: {
  rows: GameLuckRecord[];
  gameLabel: (gid: string) => string;
  note?: string;
}) {
  return (
    <div>
      <table className="w-full text-base">
        <thead className="bg-[#e5d4a3]">
          <tr>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">#</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Player</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Luck</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Actual / Expected</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Game</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pct = Math.round((r.luck_ratio - 1) * 100);
            const positive = pct >= 0;
            return (
              <tr key={`${r.game_id}-${r.player_color}`} className="border-t border-card-border hover:bg-[#faf5e4]">
                <td className="px-3 py-3 text-black font-bold">{i + 1}</td>
                <td className="px-3 py-3 text-black font-extrabold">{r.username}</td>
                <td
                  className="px-3 py-3 font-extrabold text-lg"
                  style={{ color: positive ? "#517d19" : "#b04030" }}
                >
                  {positive ? "+" : ""}{pct}%
                </td>
                <td className="px-3 py-3 text-black font-mono text-sm">
                  {r.cards_from_rolls} / {r.expected_cards_from_rolls.toFixed(0)}
                </td>
                <td className="px-3 py-3 text-black text-sm font-semibold">
                  <Link href={`/games/${r.game_id}`} className="hover:text-accent">
                    {gameLabel(r.game_id)} →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {note && (
        <p className="text-xs text-muted italic px-4 py-3 border-t border-card-border">
          {note}
        </p>
      )}
    </div>
  );
}

function MonopolyHaulTable({
  rows,
  gameLabel,
  note,
}: {
  rows: MonopolyHaulRecord[];
  gameLabel: (gid: string) => string;
  note?: string;
}) {
  return (
    <div>
      <table className="w-full text-base">
        <thead className="bg-[#e5d4a3]">
          <tr>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">#</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Player</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Cards</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Resource</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Turn</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Game</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.game_id}-${r.turn}-${r.player_color}-${i}`} className="border-t border-card-border hover:bg-[#faf5e4]">
              <td className="px-3 py-3 text-black font-bold">{i + 1}</td>
              <td className="px-3 py-3 text-black font-extrabold">{r.username}</td>
              <td className="px-3 py-3 font-extrabold text-accent-alt text-lg">{r.n_cards}</td>
              <td className="px-3 py-3 text-black font-semibold">{resourceName(r.resource, true)}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">{r.turn}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">
                <Link href={`/games/${r.game_id}`} className="hover:text-accent">
                  {gameLabel(r.game_id)} →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <p className="text-xs text-muted italic px-4 py-3 border-t border-card-border">
          {note}
        </p>
      )}
    </div>
  );
}

function SingleRollTable({
  rows,
  gameLabel,
  valueHeader,
  note,
}: {
  rows: SingleRollRecord[];
  gameLabel: (gid: string) => string;
  valueHeader: string;
  note?: string;
}) {
  return (
    <div>
      <table className="w-full text-base">
        <thead className="bg-[#e5d4a3]">
          <tr>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">#</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Player</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">{valueHeader}</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Turn</th>
            <th className="px-3 py-3 text-left text-sm font-extrabold uppercase tracking-wide text-black">Game</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.game_id}-${r.player_color}-${r.turn}-${i}`} className="border-t border-card-border hover:bg-[#faf5e4]">
              <td className="px-3 py-3 text-black font-bold">{i + 1}</td>
              <td className="px-3 py-3 text-black font-extrabold">{r.username}</td>
              <td className="px-3 py-3 font-extrabold text-accent-alt text-lg">{r.n_cards}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">{r.turn}</td>
              <td className="px-3 py-3 text-black text-sm font-semibold">
                <Link href={`/games/${r.game_id}`} className="hover:text-accent">
                  {gameLabel(r.game_id)} →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <p className="text-xs text-muted italic px-4 py-3 border-t border-card-border">
          {note}
        </p>
      )}
    </div>
  );
}
