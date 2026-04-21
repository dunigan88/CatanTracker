export interface ColonistPlayer {
  userId: string;
  username: string;
  rank: number;
  points: number;
  finished: boolean;
  quitWithPenalty: boolean;
  isHuman: boolean;
  playerColor: number;
  deviceTypeId: number;
  playOrder: number;
}

export interface ColonistGame {
  id: string;
  setting: {
    id: string;
    gameType: number;
    privateGame: boolean;
    victoryPointsToWin: number;
    maxPlayers: number;
    gameSpeed: number;
    friendlyRobber: boolean;
    mapSetting: number;
    cardDiscardLimit: number;
    [key: string]: unknown;
  };
  finished: boolean;
  turnCount: number;
  startTime: string;
  duration: string;
  players: ColonistPlayer[];
  hasReplay: boolean;
}

export async function fetchGameHistory(
  username: string
): Promise<ColonistGame[]> {
  const res = await fetch(
    `https://colonist.io/api/profile/${encodeURIComponent(username)}/history`,
    { next: { revalidate: 0 } }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch history for ${username}: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();

  // The API returns { profileUserId, gameDatas: [...] }
  const games: ColonistGame[] = Array.isArray(data) ? data : data.gameDatas ?? data.games ?? [];
  return games;
}
