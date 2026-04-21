"use client";

import { useEffect, useState } from "react";

export interface PlayerTotals {
  username: string;
  games: number;
  dev_cards_bought: number;
  dev_cards_played: number;
  roads: number;
  settlements: number;
  cities: number;
  trades_proposed: number;
  trades_accepted: number;
  bank_trades: number;
  times_robbed_others: number;
  stolen_from: number;
  resources_blocked: number;
  cards_lost_to_7: number;
  resources_used: number;
  cards_from_rolls: number;
  expected_cards_from_rolls: number;
  luck_ratio: number | null;
  gained_lumber: number;
  gained_brick: number;
  gained_wool: number;
  gained_grain: number;
  gained_ore: number;
  cards_traded_away: number;
  cards_traded_for: number;
  longest_road_cards: number;
  largest_army_cards: number;
  trade_completion_rate: number | null;
  // Per-resource cards lost to robber (victim side)
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
  // Per-resource cards gained from Year of Plenty dev cards
  yop_lumber: number;
  yop_brick: number;
  yop_wool: number;
  yop_grain: number;
  yop_ore: number;
  // Monopoly — this player's GAINS (what they stole from others)
  mono_gain_lumber: number;
  mono_gain_brick: number;
  mono_gain_wool: number;
  mono_gain_grain: number;
  mono_gain_ore: number;
  // Monopoly — this player's LOSSES (what opponents' monopolies took)
  mono_loss_lumber: number;
  mono_loss_brick: number;
  mono_loss_wool: number;
  mono_loss_grain: number;
  mono_loss_ore: number;
  // Robber — this player's gains when they put the robber (thief side)
  robber_gain_lumber: number;
  robber_gain_brick: number;
  robber_gain_wool: number;
  robber_gain_grain: number;
  robber_gain_ore: number;
}

export interface GameMeta {
  game_id: string;
  start_time: string; // ISO
  duration_s: number;
  total_turns: number;
  n_players: number;
  winner_color: number | null;
  vp_to_win: number;
  is_discord: boolean;
  is_ranked: boolean;
}

export interface Roster {
  game_id: string;
  player_color: number;
  username: string;
  is_bot: boolean;
}

export interface Standing {
  game_id: string;
  player_color: number;
  rank: number;
  vp_total: number;
  won: boolean;
  vp_cards: number;
}

export interface VPPoint {
  game_id: string;
  player_color: number;
  username: string;
  turn: number;
  vp_total: number;
  is_final: boolean;
}

export interface ResourceCumPoint {
  game_id: string;
  player_color: number;
  username: string;
  turn: number;
  cards: number;
  cumulative: number;
}

export interface PerGamePlayer {
  game_id: string;
  player_color: number;
  username: string;
  cards_from_rolls: number;
  dev_cards_bought: number;
  n_steals_done: number;
  n_stolen_from: number;
  resources_blocked: number;
  cards_lost_to_7: number;
  longest_dry: number;
  won: boolean;
  vp_total: number;
}

export interface DiceHistRow {
  game_id: string;
  total: number;
  count: number;
}

export interface P2PPrice {
  game_id: string;
  event_idx: number;
  offerer_color: number;
  accepter_color: number;
  resource: string;
  price: number;
  n_given: number;
  n_received: number;
}

export interface SettlementTile {
  game_id: string;
  player_color: number;
  placement_order: number;
  is_initial: boolean;
  placement_turn?: number;
  corner_id: number;
  tile_id: number;
  tile_type: number;
  dice_number: number;
  resource: string;
  pips: number;
}

// Display-name overrides — replaces raw Colonist handles with the names we
// actually use in conversation. Applied centrally so every page/chart/tab
// picks it up automatically.
const USERNAME_MAP: Record<string, string> = {
  Pigeon1997: "TheRickLesley",
  Ryder9377: "Ben",
  mehentaiDluv: "hallahpeno",
  YoItsMatt: "selfish_and_profound",
  Chaing1737: "Jaya",
  Maris1632: "Jenna",
};

export function mapUsername(u: string): string {
  return USERNAME_MAP[u] ?? u;
}

// Display-name overrides for resources. Internal keys (lumber/wool/grain)
// stay intact so data lookups and JSON fields continue to work; these are
// the labels we actually show in the UI.
const RESOURCE_DISPLAY: Record<string, string> = {
  lumber: "wood",
  wool: "sheep",
  grain: "wheat",
};
export function resourceName(key: string, capitalize = false): string {
  const n = RESOURCE_DISPLAY[key] ?? key;
  return capitalize ? n.charAt(0).toUpperCase() + n.slice(1) : n;
}

function remapUsernames(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(remapUsernames);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.username === "string") {
      return { ...obj, username: mapUsername(obj.username) };
    }
  }
  return value;
}

function useJson<T>(path: string): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(path)
      .then((r) => {
        if (!r.ok) throw new Error(`Fetch failed (${r.status})`);
        return r.json();
      })
      .then((j) => {
        if (!cancelled) {
          setData(remapUsernames(j) as T);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return { data, loading, error };
}

export const usePlayerTotals = () => useJson<PlayerTotals[]>("/data/player_totals.json");
export const useGames = () => useJson<GameMeta[]>("/data/games.json");
export const useRosters = () => useJson<Roster[]>("/data/rosters.json");
export const useStandings = () => useJson<Standing[]>("/data/standings.json");
export const useVPTimeline = () => useJson<VPPoint[]>("/data/vp_timeline.json");
export const useResourceCum = () => useJson<ResourceCumPoint[]>("/data/resource_cum.json");
export const usePerGamePlayer = () => useJson<PerGamePlayer[]>("/data/per_game_player.json");
export const useDiceHist = () => useJson<DiceHistRow[]>("/data/dice_histogram.json");
export const useP2PPrices = () => useJson<P2PPrice[]>("/data/p2p_prices.json");
export const useSettlementTiles = () => useJson<SettlementTile[]>("/data/settlement_tiles.json");

export interface CityUpgrade {
  game_id: string;
  player_color: number;
  corner_id: number;
  upgrade_turn: number;
}
export const useCityUpgrades = () => useJson<CityUpgrade[]>("/data/city_upgrades.json");

export interface RobberMove {
  game_id: string;
  turn: number;
  tile_id: number;
}
export const useRobberMoves = () => useJson<RobberMove[]>("/data/robber_moves.json");

export interface SingleRollRecord {
  game_id: string;
  turn: number;
  player_color: number;
  username: string;
  n_cards: number;
}
export const useMostGainedSingleRoll = () =>
  useJson<SingleRollRecord[]>("/data/most_gained_single_roll.json");
export const useMostDiscardedSingleRoll = () =>
  useJson<SingleRollRecord[]>("/data/most_discarded_single_roll.json");

export interface GamePlayerRecord {
  game_id: string;
  player_color: number;
  username: string;
}
export type TradesCompletedRecord = GamePlayerRecord & { n_trades: number };
export type ResourcesTradedRecord = GamePlayerRecord & { n_cards_traded: number };
export type MonopolyHaulRecord = GamePlayerRecord & {
  turn: number;
  resource: string;
  n_cards: number;
};
export type ResourcesLostTurnRecord = GamePlayerRecord & {
  turn: number;
  n_cards: number;
};
export type ConsecutiveRollTurnsRecord = GamePlayerRecord & { n_turns: number };

export const useMostTradesCompletedGame = () =>
  useJson<TradesCompletedRecord[]>("/data/most_trades_completed_game.json");
export const useMostResourcesTradedGame = () =>
  useJson<ResourcesTradedRecord[]>("/data/most_resources_traded_game.json");
export const useMostMonopolyHaul = () =>
  useJson<MonopolyHaulRecord[]>("/data/most_monopoly_haul.json");
export const useMostResourcesLostTurn = () =>
  useJson<ResourcesLostTurnRecord[]>("/data/most_resources_lost_turn.json");
export const useMostConsecutiveRollTurns = () =>
  useJson<ConsecutiveRollTurnsRecord[]>("/data/most_consecutive_roll_turns.json");

export type GameLuckRecord = GamePlayerRecord & {
  cards_from_rolls: number;
  expected_cards_from_rolls: number;
  luck_ratio: number;
};
export const useLuckiestGame = () =>
  useJson<GameLuckRecord[]>("/data/luckiest_game.json");
export const useUnluckiestGame = () =>
  useJson<GameLuckRecord[]>("/data/unluckiest_game.json");

export type DevCardsTurnRecord = GamePlayerRecord & {
  turn: number;
  n_cards: number;
};
export const useMostDevCardsTurn = () =>
  useJson<DevCardsTurnRecord[]>("/data/most_dev_cards_turn.json");

export type LargestArmyRecord = GamePlayerRecord & { n_knights: number };
export type LongestRoadRecord = GamePlayerRecord & { n_roads: number };
export const useLargestArmyRecord = () =>
  useJson<LargestArmyRecord[]>("/data/largest_army_record.json");
export const useLongestRoadRecord = () =>
  useJson<LongestRoadRecord[]>("/data/longest_road_record.json");

export const RESOURCE_IMAGES: Record<string, string> = {
  lumber: "/images/lumber.png",
  brick: "/images/brick.png",
  wool: "/images/sheep.png",
  grain: "/images/wheat.png",
  ore: "/images/ore.png",
};

export const RESOURCE_ORDER = ["lumber", "brick", "wool", "grain", "ore"];

// Shared palette — matches the qmd conventions
export const RESOURCE_COLORS: Record<string, string> = {
  lumber: "#517d19",
  brick: "#9c4300",
  wool: "#F2EBD8",
  grain: "#f0ad00",
  ore: "#7b6f83",
  desert: "#cccccc",
};

export const COLONIST_COLORS: Record<number, string> = {
  1: "#d23b3b",
  2: "#3b6cb1",
  3: "#5aa86a",
  4: "#e07a3e",
};

export const NON_RESOURCE_COLOR = "#4fa6eb";

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
