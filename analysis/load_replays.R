# Load all Colonist replay JSONs from ../replays/ into tidy data frames for analysis.
#
# To grab a replay JSON:
#   1. Open the replay on colonist.io while logged in
#   2. DevTools -> Network tab -> find the request to /api/replay/data-from-game-id
#   3. Right-click -> Copy -> Copy response
#   4. Save as replays/<gameId>.json (filename without extension is used as game_id)
#
# To use:
#   setwd("/path/to/colonist-tracker")
#   source("analysis/load_replays.R")
#   d <- load_all()
#   d$player_stats     # summary per (game, player)
#   d$events           # every event, long format, payload kept as list column
#   d$dice_rolls       # one row per roll
#   d$trade_offers, d$trades_accepted, d$bank_trades
#   d$builds, d$resource_gains, d$steals, d$dev_cards, d$achievements
#   d$games            # one row per game (metadata)
#
# All per-player columns use `player_color` (integer 1..N matching the Colonist
# API). To map to usernames, join against your existing players table (e.g.
# via the game_players table in colonist.db).

suppressPackageStartupMessages({
  for (pkg in c("jsonlite", "dplyr", "purrr", "tidyr", "tibble")) {
    if (!requireNamespace(pkg, quietly = TRUE)) {
      stop("Missing R package: ", pkg, ". Install with install.packages(\"", pkg, "\")")
    }
  }
  library(jsonlite)
  library(dplyr)
  library(purrr)
  library(tidyr)
  library(tibble)
})

REPLAY_DIR <- "replays"

# Colonist resource enums (1..5). Order verified by matching initial placement
# yields against tile colors in sample data. Update if you confirm different.
RESOURCE_NAMES <- c("1" = "lumber", "2" = "brick", "3" = "wool", "4" = "grain", "5" = "ore")

# Piece enums seen in stateChange.*.text.pieceEnum
PIECE_NAMES <- c("0" = "road", "2" = "settlement", "3" = "city")

# Known event type codes (text.type in gameLogState entries). Extend as needed.
EVENT <- c(
  dev_card_bought   = 1L,
  initial_place     = 4L,   # free initial settlement/road placement
  paid_build        = 5L,   # paid build (road/settlement/city)
  dice_roll         = 10L,
  robber_place      = 11L,
  steal_to_victim   = 14L,  # message sent to thief (has actual cardEnum)
  steal_to_thief    = 15L,  # message sent to victim (has actual cardEnum)
  steal_broadcast   = 16L,  # spectator view (cardBacks only)
  year_of_plenty    = 21L,  # YoP dev-card: player takes 2 cards from bank
  disconnect        = 24L,
  turn_boundary     = 44L,
  resource_gain     = 47L,
  tile_blocked      = 49L,
  discard_on_seven  = 55L,  # player discards cards when 7 is rolled
  seven_rolled      = 60L,
  achievement       = 66L,  # longest road / largest army
  monopoly          = 86L,  # monopoly dev-card: player takes all of a resource
  trade_accepted_pp = 115L, # player<->player trade accepted
  trade_bank        = 116L, # bank or port trade (4:1, 3:1, 2:1)
  trade_offered     = 118L
)

resource_name <- function(x) {
  if (length(x) == 0) return(character(0))
  unname(RESOURCE_NAMES[as.character(x)])
}
piece_name <- function(x) {
  if (length(x) == 0) return(character(0))
  unname(PIECE_NAMES[as.character(x)])
}

`%or%` <- function(a, b) if (is.null(a)) b else a

int_or_na <- function(x) {
  if (is.null(x)) NA_integer_ else as.integer(x)
}

# ---- Load files ----------------------------------------------------------

load_replay <- function(path) {
  gid <- tools::file_path_sans_ext(basename(path))
  replay <- fromJSON(path, simplifyVector = FALSE)
  list(game_id = gid, replay = replay, path = path)
}

list_replay_files <- function(dir = REPLAY_DIR) {
  list.files(dir, pattern = "\\.json$", full.names = TRUE)
}

# ---- Events table: one row per gameLogState entry ------------------------

extract_events <- function(bundle) {
  game_id <- bundle$game_id
  events <- bundle$replay$data$eventHistory$events %or% list()
  cum <- 0
  running_turn <- 0L
  running_turn_player <- NA_integer_
  rows <- list()
  for (i in seq_along(events)) {
    e <- events[[i]]
    delta <- e$input$deltaS
    if (is.null(delta)) delta <- NA_real_
    cum <- cum + (if (is.na(delta)) 0 else delta)
    sc <- e$stateChange %or% list()
    current <- sc$currentState %or% list()
    # stateChange only carries deltas; carry forward turn counter + active player
    tv <- current$completedTurns
    if (!is.null(tv)) running_turn <- as.integer(tv)
    tpv <- current$currentTurnPlayerColor
    if (!is.null(tpv)) running_turn_player <- as.integer(tpv)

    log_state <- sc$gameLogState %or% list()
    if (length(log_state) == 0) next

    for (lid in names(log_state)) {
      entry <- log_state[[lid]]
      txt <- entry$text %or% list()
      tp <- int_or_na(txt$type)
      rows[[length(rows) + 1]] <- tibble(
        game_id = game_id,
        event_idx = i,
        log_id = suppressWarnings(as.integer(lid)),
        delta_s = delta,
        cumulative_s = cum,
        turn = running_turn,
        turn_player_color = running_turn_player,
        from_color = int_or_na(entry$from),
        type = tp,
        type_label = names(EVENT)[match(tp, EVENT)],
        payload = list(txt)
      )
    }
  }
  if (length(rows) == 0) {
    return(tibble(
      game_id = character(), event_idx = integer(), log_id = integer(),
      delta_s = double(), cumulative_s = double(),
      turn = integer(), turn_player_color = integer(),
      from_color = integer(), type = integer(), type_label = character(),
      payload = list()
    ))
  }
  bind_rows(rows)
}

# ---- Game metadata -------------------------------------------------------

extract_game_meta <- function(bundle) {
  r <- bundle$replay
  events <- r$data$eventHistory$events %or% list()
  settings <- r$data$gameSettings %or% list()
  details <- r$data$gameDetails %or% list()
  end_state <- r$data$eventHistory$endGameState %or% list()
  raw_start <- r$data$eventHistory$startTime
  raw_val <- if (is.list(raw_start)) (raw_start[[1]] %or% NA) else raw_start
  start_time_ms <- if (is.null(raw_val) || (length(raw_val) == 1 && is.na(raw_val))) {
    NA_real_
  } else if (is.character(raw_val)) {
    # ISO 8601 string, e.g. "2026-04-18T05:05:00.197Z"
    as.numeric(as.POSIXct(raw_val, format = "%Y-%m-%dT%H:%M:%OS", tz = "UTC")) * 1000
  } else {
    suppressWarnings(as.numeric(raw_val))
  }

  total_delta <- 0
  total_turns <- 0L
  for (e in events) {
    delta <- e$input$deltaS
    if (!is.null(delta)) total_delta <- total_delta + delta
    ct <- e$stateChange$currentState$completedTurns
    if (!is.null(ct) && ct > total_turns) total_turns <- as.integer(ct)
  }

  winner <- NA_integer_
  winner_vp <- NA_integer_
  if (!is.null(end_state$players)) {
    for (pc in names(end_state$players)) {
      p <- end_state$players[[pc]]
      if (isTRUE(p$winningPlayer)) {
        winner <- as.integer(pc)
        winner_vp <- sum(unlist(p$victoryPoints %or% list()))
      }
    }
  }

  tibble(
    game_id = bundle$game_id,
    database_game_id = r$data$databaseGameId %or% NA_character_,
    setting_id = settings$id %or% NA_character_,
    start_time_ms = start_time_ms,
    start_time = if (length(start_time_ms) == 1 && !is.na(start_time_ms))
      as.POSIXct(start_time_ms / 1000, origin = "1970-01-01", tz = "UTC")
      else as.POSIXct(NA),
    duration_s = total_delta,
    total_turns = total_turns,
    n_players = length(r$data$playerUserStates %or% list()),
    winner_color = winner,
    winner_vp = winner_vp,
    vp_to_win = int_or_na(settings$victoryPointsToWin),
    max_players = int_or_na(settings$maxPlayers),
    game_type = int_or_na(settings$gameType),
    private_game = isTRUE(settings$privateGame),
    is_discord = isTRUE(details$isDiscord),
    is_ranked = isTRUE(details$isRanked),
    map_setting = int_or_na(settings$mapSetting),
    mode_setting = int_or_na(settings$modeSetting),
    scenario_setting = int_or_na(settings$scenarioSetting),
    friendly_robber = isTRUE(settings$friendlyRobber),
    card_discard_limit = int_or_na(settings$cardDiscardLimit)
  )
}

# ---- Roster: color -> username mapping per game -------------------------

extract_rosters <- function(bundle) {
  r <- bundle$replay
  users <- r$data$playerUserStates %or% list()
  play_order <- r$data$playOrder %or% list()
  play_order_lookup <- setNames(seq_along(play_order), unlist(play_order))

  rows <- list()
  for (u in users) {
    color <- u$selectedColor
    rows[[length(rows) + 1]] <- tibble(
      game_id = bundle$game_id,
      player_color = int_or_na(color),
      user_id = u$userId %or% NA_character_,
      username = u$username %or% NA_character_,
      is_bot = isTRUE(u$isBot),
      country_code = u$countryCode %or% NA_character_,
      device_type = int_or_na(u$deviceType),
      membership = int_or_na(u$membership),
      play_order = int_or_na(play_order_lookup[[as.character(color)]])
    )
  }
  if (length(rows) == 0) {
    return(tibble(game_id = character(), player_color = integer(),
                  user_id = character(), username = character(),
                  is_bot = logical(), country_code = character(),
                  device_type = integer(), membership = integer(),
                  play_order = integer()))
  }
  bind_rows(rows)
}

# ---- Final standings & activity stats (from endGameState) ---------------

extract_final_standings <- function(bundle) {
  r <- bundle$replay
  end_state <- r$data$eventHistory$endGameState %or% list()
  players <- end_state$players %or% list()
  if (length(players) == 0) {
    return(tibble(game_id = character(), player_color = integer(),
                  rank = integer(), vp_total = integer(),
                  vp_settlements = integer(), vp_cities = integer(),
                  vp_longest_road = integer(), vp_largest_army = integer(),
                  vp_dev_cards = integer(), won = logical()))
  }
  rows <- list()
  for (pc in names(players)) {
    p <- players[[pc]]
    vp <- p$victoryPoints %or% list()
    # VP breakdown keys observed: 0 = settlements+cities, 1 = city bonus (?),
    # 4 = longest road / largest army. Structure varies, so we keep the raw
    # map and also sum to a total.
    rows[[length(rows) + 1]] <- tibble(
      game_id = bundle$game_id,
      player_color = as.integer(pc),
      rank = int_or_na(p$rank),
      vp_total = vp_weighted_sum(vp),
      vp_breakdown = list(vp),
      won = isTRUE(p$winningPlayer)
    )
  }
  bind_rows(rows)
}

extract_activity_stats <- function(bundle) {
  r <- bundle$replay
  stats <- r$data$eventHistory$endGameState$activityStats %or% list()
  if (length(stats) == 0) {
    return(tibble(game_id = character(), player_color = integer(),
                  dev_cards_used = integer(), dev_cards_bought = integer(),
                  resources_used = integer(), proposed_trades = integer(),
                  successful_trades = integer(), resource_income_blocked = integer()))
  }
  rows <- list()
  for (pc in names(stats)) {
    s <- stats[[pc]]
    rows[[length(rows) + 1]] <- tibble(
      game_id = bundle$game_id,
      player_color = int_or_na(s$color),
      dev_cards_used = int_or_na(s$devCardsUsed),
      dev_cards_bought = int_or_na(s$devCardsBought),
      resources_used = int_or_na(s$resourcesUsed),
      proposed_trades = int_or_na(s$proposedTrades),
      successful_trades = int_or_na(s$successfulTrades),
      resource_income_blocked = int_or_na(s$resourceIncomeBlocked)
    )
  }
  bind_rows(rows)
}

extract_dice_histogram <- function(bundle) {
  r <- bundle$replay
  dice <- r$data$eventHistory$endGameState$diceStats %or% list()
  if (length(dice) == 0) {
    return(tibble(game_id = character(), total = integer(), count = integer()))
  }
  # diceStats is a positional list; position i corresponds to dice total (i + 1)
  # i.e. index 1 -> total 2, index 11 -> total 12.
  counts <- vapply(dice, function(x) int_or_na(x), integer(1))
  tibble(
    game_id = bundle$game_id,
    total = seq_along(counts) + 1L,
    count = counts
  )
}

# ---- Map layout (tiles + corners) ---------------------------------------

# Tile type -> resource (standard Catan map). Expand if you confirm expansion
# tile types.
TILE_TYPE_TO_RESOURCE <- c(
  "0" = "desert",
  "1" = "lumber",
  "2" = "brick",
  "3" = "wool",
  "4" = "grain",
  "5" = "ore"
)

# Dice pips (dots under each number token on the board).
DICE_PIPS <- c("2"=1L, "3"=2L, "4"=3L, "5"=4L, "6"=5L,
               "8"=5L, "9"=4L, "10"=3L, "11"=2L, "12"=1L)

tile_type_to_resource <- function(t) {
  if (length(t) == 0) return(character(0))
  res <- unname(TILE_TYPE_TO_RESOURCE[as.character(t)])
  res[is.na(res)] <- "unknown"
  res
}
dice_pips <- function(d) {
  if (length(d) == 0) return(integer(0))
  res <- unname(DICE_PIPS[as.character(d)])
  res[is.na(res)] <- 0L
  as.integer(res)
}

extract_tiles <- function(bundle) {
  tiles <- bundle$replay$data$eventHistory$initialState$mapState$tileHexStates %or% list()
  if (length(tiles) == 0) return(tibble())
  rows <- list()
  for (tid in names(tiles)) {
    t <- tiles[[tid]]
    rows[[length(rows) + 1]] <- tibble(
      game_id = bundle$game_id,
      tile_id = suppressWarnings(as.integer(tid)),
      tx = int_or_na(t$x),
      ty = int_or_na(t$y),
      tile_type = int_or_na(t$type),
      dice_number = int_or_na(t$diceNumber),
      resource = tile_type_to_resource(int_or_na(t$type)),
      pips = dice_pips(int_or_na(t$diceNumber))
    )
  }
  bind_rows(rows)
}

extract_corners <- function(bundle) {
  corners <- bundle$replay$data$eventHistory$initialState$mapState$tileCornerStates %or% list()
  if (length(corners) == 0) return(tibble())
  rows <- list()
  for (cid in names(corners)) {
    c <- corners[[cid]]
    rows[[length(rows) + 1]] <- tibble(
      game_id = bundle$game_id,
      corner_id = suppressWarnings(as.integer(cid)),
      cx = int_or_na(c$x),
      cy = int_or_na(c$y),
      cz = int_or_na(c$z)
    )
  }
  bind_rows(rows)
}

# Axial-hex adjacency: corners identify 3 neighbouring hex positions.
# Empirically verified against initial-distribution resource payouts.
# Corner (cx, cy, z=0) is the north vertex of hex (cx, cy):
#   touches hexes (cx, cy), (cx, cy-1), (cx+1, cy-1)
# Corner (cx, cy, z=1) is the south vertex of hex (cx, cy):
#   touches hexes (cx, cy), (cx, cy+1), (cx-1, cy+1)
corner_adj_hex_coords <- function(cx, cy, cz) {
  if (is.na(cx) || is.na(cy) || is.na(cz)) return(list())
  if (cz == 0L) {
    list(c(cx, cy), c(cx, cy - 1L), c(cx + 1L, cy - 1L))
  } else {
    list(c(cx, cy), c(cx, cy + 1L), c(cx - 1L, cy + 1L))
  }
}

# ---- Settlement placements (initial) ------------------------------------

extract_settlement_placements <- function(bundle) {
  game_id <- bundle$game_id
  events <- bundle$replay$data$eventHistory$events %or% list()
  rows <- list()
  running_turn <- 0L
  for (i in seq_along(events)) {
    e <- events[[i]]
    sc <- e$stateChange %or% list()
    tv <- sc$currentState$completedTurns
    if (!is.null(tv)) running_turn <- as.integer(tv)
    log_state <- sc$gameLogState %or% list()
    corner_states <- sc$mapState$tileCornerStates %or% list()
    for (lid in names(log_state)) {
      entry <- log_state[[lid]]
      txt <- entry$text %or% list()
      event_type <- int_or_na(txt$type)
      piece_enum <- int_or_na(txt$pieceEnum)
      # type 4 = initial placement, type 5 = paid build, both with pieceEnum 2 for settlement
      if (!is.na(event_type) && event_type %in% c(4L, 5L) && identical(piece_enum, 2L)) {
        pc <- int_or_na(txt$playerColor)
        is_initial <- event_type == 4L
        for (cid in names(corner_states)) {
          cs <- corner_states[[cid]]
          if (identical(int_or_na(cs$buildingType), 1L) &&
              identical(int_or_na(cs$owner), pc)) {
            rows[[length(rows) + 1]] <- tibble(
              game_id = game_id,
              event_idx = i,
              corner_id = suppressWarnings(as.integer(cid)),
              player_color = pc,
              is_initial = is_initial,
              placement_turn = running_turn
            )
          }
        }
      }
    }
  }
  if (length(rows) == 0) {
    return(tibble(game_id = character(), event_idx = integer(),
                  corner_id = integer(), player_color = integer(),
                  is_initial = logical(), placement_turn = integer(),
                  placement_order = integer()))
  }
  bind_rows(rows) |>
    group_by(game_id, player_color) |>
    arrange(event_idx, .by_group = TRUE) |>
    mutate(
      placement_order = row_number(),
      # Initial placements happen during setup, but completedTurns increments
      # once per placement action — so raw values spread 0..7 across the 8
      # initial placements. Collapse them to 0 so every initial settlement
      # gets credit for the whole game.
      placement_turn = if_else(is_initial, 0L, placement_turn)
    ) |>
    ungroup()
}

extract_robber_moves <- function(bundle) {
  game_id <- bundle$game_id
  events <- bundle$replay$data$eventHistory$events %or% list()
  rows <- list()
  running_turn <- 0L
  for (i in seq_along(events)) {
    e <- events[[i]]
    sc <- e$stateChange %or% list()
    tv <- sc$currentState$completedTurns
    if (!is.null(tv)) running_turn <- as.integer(tv)
    loc <- sc$mechanicRobberState$locationTileIndex
    if (!is.null(loc)) {
      rows[[length(rows) + 1]] <- tibble(
        game_id = game_id,
        event_idx = i,
        turn = running_turn,
        tile_id = as.integer(loc)
      )
    }
  }
  if (length(rows) == 0) {
    return(tibble(game_id = character(), event_idx = integer(),
                  turn = integer(), tile_id = integer()))
  }
  bind_rows(rows)
}

extract_longest_road <- function(bundle) {
  gid <- bundle$game_id
  events <- bundle$replay$data$eventHistory$events %or% list()
  out <- list()
  for (i in seq_along(events)) {
    lrs <- events[[i]]$stateChange$mechanicLongestRoadState
    if (is.null(lrs)) next
    for (pc in names(lrs)) {
      len <- lrs[[pc]]$longestRoad
      if (!is.null(len)) {
        out[[length(out) + 1]] <- tibble(
          game_id = gid,
          player_color = suppressWarnings(as.integer(pc)),
          road_len = as.integer(len)
        )
      }
    }
  }
  if (length(out) == 0) return(tibble(game_id = character(),
                                      player_color = integer(),
                                      road_len = integer()))
  bind_rows(out)
}

extract_city_upgrades <- function(bundle) {
  game_id <- bundle$game_id
  events <- bundle$replay$data$eventHistory$events %or% list()
  rows <- list()
  running_turn <- 0L
  for (i in seq_along(events)) {
    e <- events[[i]]
    sc <- e$stateChange %or% list()
    tv <- sc$currentState$completedTurns
    if (!is.null(tv)) running_turn <- as.integer(tv)
    log_state <- sc$gameLogState %or% list()
    corner_states <- sc$mapState$tileCornerStates %or% list()
    # Find any paid city-build log entry in this event — its player is the
    # upgrader. The state delta only carries the changed fields, so
    # `owner` is absent; we trust the log-entry's playerColor.
    city_builder <- NA_integer_
    for (lid in names(log_state)) {
      txt <- log_state[[lid]]$text %or% list()
      if (identical(int_or_na(txt$type), 5L) &&
          identical(int_or_na(txt$pieceEnum), 3L)) {
        city_builder <- int_or_na(txt$playerColor)
        break
      }
    }
    if (is.na(city_builder)) next
    for (cid in names(corner_states)) {
      cs <- corner_states[[cid]]
      if (identical(int_or_na(cs$buildingType), 2L)) {
        rows[[length(rows) + 1]] <- tibble(
          game_id = game_id,
          event_idx = i,
          corner_id = suppressWarnings(as.integer(cid)),
          player_color = city_builder,
          upgrade_turn = running_turn
        )
      }
    }
  }
  if (length(rows) == 0) {
    return(tibble(game_id = character(), event_idx = integer(),
                  corner_id = integer(), player_color = integer(),
                  upgrade_turn = integer()))
  }
  # Dedupe in case the same city appears in multiple snapshots; keep earliest.
  bind_rows(rows) |>
    group_by(game_id, player_color, corner_id) |>
    arrange(event_idx, .by_group = TRUE) |>
    slice(1) |>
    ungroup()
}

# Long-format adjacency: one row per (settlement, adjacent tile).
settlement_adjacencies <- function(placements, corners, tiles) {
  if (nrow(placements) == 0) {
    return(tibble(game_id = character(), event_idx = integer(),
                  corner_id = integer(), player_color = integer(),
                  placement_order = integer(), placement_turn = integer(),
                  tile_id = integer(), tile_type = integer(),
                  dice_number = integer(), resource = character(),
                  pips = integer()))
  }
  with_corners <- placements |>
    left_join(corners, by = c("game_id", "corner_id"))

  expanded <- with_corners |>
    rowwise() |>
    mutate(adj = list(corner_adj_hex_coords(cx, cy, cz))) |>
    ungroup() |>
    select(game_id, event_idx, corner_id, player_color, placement_order,
           any_of("is_initial"), any_of("placement_turn"), adj) |>
    tidyr::unnest_longer(adj) |>
    mutate(
      tx = map_int(adj, 1L),
      ty = map_int(adj, 2L)
    ) |>
    select(-adj)

  expanded |>
    left_join(
      tiles |> select(game_id, tx, ty, tile_id, tile_type, dice_number, resource, pips),
      by = c("game_id", "tx", "ty")
    ) |>
    filter(!is.na(tile_id))  # drop off-board positions
}

# ---- Per-category extractors --------------------------------------------
# Each takes the events table and returns a tidy frame for that event type.

dice_rolls <- function(events) {
  df <- events %>% filter(type == EVENT["dice_roll"])
  if (nrow(df) == 0) {
    return(tibble(game_id = character(), event_idx = integer(), turn = integer(),
                  player_color = integer(), first_die = integer(),
                  second_die = integer(), total = integer()))
  }
  df %>%
    mutate(
      first_die  = map_int(payload, ~ int_or_na(.x$firstDice)),
      second_die = map_int(payload, ~ int_or_na(.x$secondDice)),
      total = first_die + second_die,
      player_color = map_int(payload, ~ int_or_na(.x$playerColor))
    ) %>%
    select(game_id, event_idx, turn, player_color, first_die, second_die, total)
}

trade_offers <- function(events) {
  events %>%
    filter(type == EVENT["trade_offered"]) %>%
    mutate(
      offerer_color = map_int(payload, ~ int_or_na(.x$playerColor)),
      offered = map(payload, ~ as.integer(unlist(.x$offeredCardEnums %or% list()))),
      wanted  = map(payload, ~ as.integer(unlist(.x$wantedCardEnums  %or% list()))),
      offered_names = map(offered, resource_name),
      wanted_names  = map(wanted,  resource_name),
      n_offered = map_int(offered, length),
      n_wanted  = map_int(wanted,  length)
    ) %>%
    select(game_id, event_idx, turn, offerer_color,
           offered, wanted, offered_names, wanted_names, n_offered, n_wanted)
}

trades_accepted <- function(events) {
  events %>%
    filter(type == EVENT["trade_accepted_pp"]) %>%
    mutate(
      offerer_color  = map_int(payload, ~ int_or_na(.x$playerColor)),
      accepter_color = map_int(payload, ~ int_or_na(.x$acceptingPlayerColor)),
      given    = map(payload, ~ as.integer(unlist(.x$givenCardEnums    %or% list()))),
      received = map(payload, ~ as.integer(unlist(.x$receivedCardEnums %or% list()))),
      given_names    = map(given,    resource_name),
      received_names = map(received, resource_name)
    ) %>%
    select(game_id, event_idx, turn, offerer_color, accepter_color,
           given, received, given_names, received_names)
}

bank_trades <- function(events) {
  events %>%
    filter(type == EVENT["trade_bank"]) %>%
    mutate(
      player_color = map_int(payload, ~ int_or_na(.x$playerColor)),
      given    = map(payload, ~ as.integer(unlist(.x$givenCardEnums    %or% list()))),
      received = map(payload, ~ as.integer(unlist(.x$receivedCardEnums %or% list()))),
      ratio = map_int(given, length)  # 4 for 4:1, 3 for 3:1, 2 for 2:1 port
    ) %>%
    select(game_id, event_idx, turn, player_color, given, received, ratio)
}

builds <- function(events) {
  events %>%
    filter(type %in% c(EVENT["paid_build"], EVENT["initial_place"])) %>%
    mutate(
      player_color = map_int(payload, ~ int_or_na(.x$playerColor)),
      piece_enum = map_int(payload, ~ int_or_na(.x$pieceEnum)),
      piece = piece_name(piece_enum),
      is_vp = map_lgl(payload, ~ isTRUE(.x$isVp)),
      is_initial = type == EVENT["initial_place"]
    ) %>%
    select(game_id, event_idx, turn, player_color, piece, piece_enum, is_vp, is_initial)
}

resource_gains <- function(events) {
  df <- events %>% filter(type == EVENT["resource_gain"])
  if (nrow(df) == 0) {
    return(tibble(game_id = character(), event_idx = integer(), turn = integer(),
                  player_color = integer(), distribution_type = integer(),
                  card_enum = integer(), resource = character()))
  }
  df %>%
    mutate(
      player_color = map_int(payload, ~ int_or_na(.x$playerColor)),
      distribution_type = map_int(payload, ~ int_or_na(.x$distributionType)),
      cards = map(payload, ~ as.integer(unlist(.x$cardsToBroadcast %or% list())))
    ) %>%
    select(game_id, event_idx, turn, player_color, distribution_type, cards) %>%
    tidyr::unnest_longer(cards, values_to = "card_enum", indices_include = FALSE) %>%
    mutate(resource = resource_name(card_enum))
}

steals <- function(events) {
  # Use type 14 (sent to thief): from = thief, payload.playerColor = victim, cardEnums = cards stolen.
  events %>%
    filter(type == EVENT["steal_to_victim"]) %>%
    mutate(
      thief_color  = from_color,
      victim_color = map_int(payload, ~ int_or_na(.x$playerColor)),
      card_enums   = map(payload, ~ as.integer(unlist(.x$cardEnums %or% list()))),
      resources    = map(card_enums, resource_name),
      n_stolen     = map_int(card_enums, length)
    ) %>%
    select(game_id, event_idx, turn, thief_color, victim_color,
           card_enums, resources, n_stolen)
}

dev_cards_bought <- function(events) {
  events %>%
    filter(type == EVENT["dev_card_bought"]) %>%
    mutate(player_color = from_color) %>%
    select(game_id, event_idx, turn, player_color)
}

# Weights for Colonist victoryPointsState entries. Verified against 23
# winners' endGameState sums vs gameSettings.victoryPointsToWin, and
# against mechanicLongestRoadState / knight plays for the achievements:
#   0 = settlements        (1 VP each)
#   1 = cities             (2 VP each)
#   2 = VP dev cards       (1 VP each; hidden from other players in their replays)
#   3 = largest army       (2 VP total)
#   4 = longest road       (2 VP total)
VP_TYPE_WEIGHTS <- c("0" = 1L, "1" = 2L, "2" = 1L, "3" = 2L, "4" = 2L)

vp_weighted_sum <- function(vps) {
  if (is.null(vps) || length(vps) == 0) return(0L)
  vals <- unlist(vps)
  w <- VP_TYPE_WEIGHTS[names(vals)]
  w[is.na(w)] <- 1L  # unknown type -> weight 1
  as.integer(sum(vals * w, na.rm = TRUE))
}

# Public VP: same as weighted sum but excluding hidden VP dev cards (type 2).
# During a game, the server only reveals the replaying player's own type 2
# entries. Using this keeps the in-game timeline consistent across all
# players (shows what everyone could see).
vp_public_sum <- function(vps) {
  if (is.null(vps) || length(vps) == 0) return(0L)
  vals <- unlist(vps)
  vals <- vals[names(vals) != "2"]
  if (length(vals) == 0) return(0L)
  w <- VP_TYPE_WEIGHTS[names(vals)]
  w[is.na(w)] <- 1L
  as.integer(sum(vals * w, na.rm = TRUE))
}

# Victory-point timeline per (game, player, turn).
# Walks events and tracks running victoryPointsState — each player's total
# VP at the end of each completed turn. Includes hidden dev-card VPs as
# they appear in the state (Colonist tracks them in the running state even
# if not publicly displayed in game).
extract_vp_timeline <- function(bundle) {
  game_id <- bundle$game_id
  events <- bundle$replay$data$eventHistory$events %or% list()
  vp_state <- list()  # vp_state[[player_color_str]][[vp_type_str]] = value
  rows <- list()
  row_idx <- 0L
  last_turn <- -1L

  for (e in events) {
    ps <- e$stateChange$playerStates %or% list()
    for (pc_str in names(ps)) {
      vps <- ps[[pc_str]]$victoryPointsState
      if (!is.null(vps)) {
        if (is.null(vp_state[[pc_str]])) vp_state[[pc_str]] <- list()
        for (vp_type in names(vps)) {
          val <- vps[[vp_type]]
          vp_state[[pc_str]][[vp_type]] <-
            if (is.null(val)) 0L else as.integer(val)
        }
      }
    }
    ct <- e$stateChange$currentState$completedTurns
    if (!is.null(ct)) {
      cti <- as.integer(ct)
      if (cti > last_turn) {
        last_turn <- cti
        for (pc_str in names(vp_state)) {
          total <- vp_public_sum(vp_state[[pc_str]])
          row_idx <- row_idx + 1L
          rows[[row_idx]] <- tibble(
            game_id = game_id,
            player_color = as.integer(pc_str),
            turn = cti,
            vp_total = as.integer(total)
          )
        }
      }
    }
  }

  # Append one row per player with their FINAL VP from endGameState.
  # This reveals any hidden VP-dev-card points that weren't visible mid-stream
  # (from the replaying player's perspective). Tag with is_final = TRUE so
  # callers can render the reveal specially if desired.
  end_state <- bundle$replay$data$eventHistory$endGameState$players %or% list()
  final_turn <- max(last_turn + 1L, 1L)
  for (pc_str in names(end_state)) {
    fvp <- vp_weighted_sum(end_state[[pc_str]]$victoryPoints)
    row_idx <- row_idx + 1L
    rows[[row_idx]] <- tibble(
      game_id = game_id,
      player_color = as.integer(pc_str),
      turn = final_turn,
      vp_total = fvp
    )
  }

  if (length(rows) == 0) {
    return(tibble(game_id = character(), player_color = integer(),
                  turn = integer(), vp_total = integer()))
  }
  out <- bind_rows(rows)
  out$is_final <- out$turn == final_turn
  out
}

# Cards discarded when a 7 is rolled (type 55). Per-event row, with the
# list of discarded card enums.
# Year-of-Plenty plays. Each row = one play with the two cards taken.
extract_yop <- function(bundle) {
  game_id <- bundle$game_id
  events <- bundle$replay$data$eventHistory$events %or% list()
  rows <- list()
  for (i in seq_along(events)) {
    e <- events[[i]]
    ls <- e$stateChange$gameLogState %or% list()
    for (lid in names(ls)) {
      txt <- ls[[lid]]$text %or% list()
      if (!identical(int_or_na(txt$type), 21L)) next
      cards <- as.integer(unlist(txt$cardEnums %or% list()))
      rows[[length(rows) + 1]] <- tibble(
        game_id = game_id,
        event_idx = i,
        player_color = int_or_na(txt$playerColor),
        card_enums = list(cards),
        resources = list(vapply(cards, resource_name, character(1))),
        n_cards = length(cards)
      )
    }
  }
  if (length(rows) == 0) {
    return(tibble(game_id = character(), event_idx = integer(),
                  player_color = integer(), card_enums = list(),
                  resources = list(), n_cards = integer()))
  }
  bind_rows(rows)
}

# Monopoly plays. For each play we extract:
#   - monopolizer's total take (per resource)
#   - per-victim losses (per resource)
# Per-victim losses are derived by tracking each player's running hand
# and diffing before/after the monopoly event.
extract_monopoly <- function(bundle) {
  game_id <- bundle$game_id
  events <- bundle$replay$data$eventHistory$events %or% list()
  hands <- list()   # pc_str -> integer vector of card enums
  plays <- list()
  for (i in seq_along(events)) {
    e <- events[[i]]
    ps <- e$stateChange$playerStates %or% list()
    # Capture BEFORE state for players whose hand will change this event
    before <- list()
    for (pc in names(ps)) {
      cards <- ps[[pc]]$resourceCards$cards
      if (!is.null(cards)) {
        before[[pc]] <- if (is.null(hands[[pc]])) integer() else hands[[pc]]
        hands[[pc]] <- as.integer(unlist(cards))
      }
    }
    # Look for monopoly log entries
    ls <- e$stateChange$gameLogState %or% list()
    for (lid in names(ls)) {
      txt <- ls[[lid]]$text %or% list()
      if (!identical(int_or_na(txt$type), 86L)) next
      mono_color <- int_or_na(txt$playerColor)
      res_enum <- int_or_na(txt$cardEnum)
      amt <- int_or_na(txt$amountStolen)
      # Per-victim losses
      victims <- list()
      for (pc in names(before)) {
        if (as.integer(pc) == mono_color) next
        n_before <- sum(before[[pc]] == res_enum)
        n_after  <- sum((hands[[pc]] %or% integer()) == res_enum)
        lost <- n_before - n_after
        if (lost > 0) {
          victims[[length(victims) + 1]] <- list(
            player_color = as.integer(pc),
            lost = as.integer(lost)
          )
        }
      }
      plays[[length(plays) + 1]] <- tibble(
        game_id = game_id,
        event_idx = i,
        player_color = mono_color,
        card_enum = res_enum,
        resource = resource_name(res_enum),
        amount_stolen = amt,
        victims = list(victims)
      )
    }
  }
  if (length(plays) == 0) {
    return(tibble(game_id = character(), event_idx = integer(),
                  player_color = integer(), card_enum = integer(),
                  resource = character(), amount_stolen = integer(),
                  victims = list()))
  }
  bind_rows(plays)
}

seven_discards <- function(events) {
  events %>%
    filter(type == EVENT["discard_on_seven"]) %>%
    mutate(
      player_color = map_int(payload, ~ int_or_na(.x$playerColor)),
      cards = map(payload, ~ as.integer(unlist(.x$cardEnums %or% list()))),
      n_cards = map_int(cards, length)
    ) %>%
    select(game_id, event_idx, turn, player_color, cards, n_cards)
}

achievements <- function(events) {
  events %>%
    filter(type == EVENT["achievement"]) %>%
    mutate(
      player_color = map_int(payload, ~ int_or_na(.x$playerColor)),
      achievement_enum = map_int(payload, ~ int_or_na(.x$achievementEnum))
    ) %>%
    select(game_id, event_idx, turn, player_color, achievement_enum)
}

# ---- Player-per-game summary --------------------------------------------

player_stats <- function(events, dice, offers, accepts, banks, builds_df,
                         gains, steals_df, devs, ach, games_df) {
  # Player colors that appear anywhere in events, per game
  player_grid <- events %>%
    filter(!is.na(from_color)) %>%
    distinct(game_id, from_color) %>%
    rename(player_color = from_color)

  agg_dice <- dice %>%
    group_by(game_id, player_color) %>%
    summarise(n_rolls = n(), mean_roll = mean(total, na.rm = TRUE), .groups = "drop")

  agg_offers <- offers %>%
    count(game_id, offerer_color, name = "n_trade_offers_made") %>%
    rename(player_color = offerer_color)

  agg_accepts_offerer <- accepts %>%
    count(game_id, offerer_color, name = "n_trades_completed_as_offerer") %>%
    rename(player_color = offerer_color)

  agg_accepts_accepter <- accepts %>%
    count(game_id, accepter_color, name = "n_trades_completed_as_accepter") %>%
    rename(player_color = accepter_color)

  agg_banks <- banks %>%
    count(game_id, player_color, name = "n_bank_trades")

  # Count every settlement/road/city build event (including initial placements).
  # Cities are separate events (pieceEnum=3) so upgrading a settlement does
  # NOT decrement the settlement count.
  agg_builds <- builds_df %>%
    count(game_id, player_color, piece, name = "n") %>%
    pivot_wider(names_from = piece, values_from = n,
                names_prefix = "built_", values_fill = 0)

  agg_gains_wide <- gains %>%
    count(game_id, player_color, resource, name = "n") %>%
    pivot_wider(names_from = resource, values_from = n,
                names_prefix = "gained_", values_fill = 0)

  # Strictly dice-roll gains (distribution_type == 1). Excludes initial
  # 2nd-settlement production (dist 0) and YoP/Monopoly takes (dist 2).
  # Robber steals are in steals_df, not gains, and are already excluded.
  # Downstream this becomes `cards_from_rolls`, which is also what feeds
  # the luck-ratio calculation.
  agg_gains_total <- gains %>%
    filter(distribution_type == 1) %>%
    count(game_id, player_color, name = "gained_total")

  agg_victim <- steals_df %>%
    count(game_id, victim_color, name = "n_stolen_from") %>%
    rename(player_color = victim_color)

  agg_thief <- steals_df %>%
    count(game_id, thief_color, name = "n_steals_done") %>%
    rename(player_color = thief_color)

  agg_devs <- devs %>%
    count(game_id, player_color, name = "n_dev_cards_bought")

  agg_ach <- ach %>%
    count(game_id, player_color, name = "n_achievements")

  result <- player_grid %>%
    left_join(agg_dice, by = c("game_id", "player_color")) %>%
    left_join(agg_offers, by = c("game_id", "player_color")) %>%
    left_join(agg_accepts_offerer, by = c("game_id", "player_color")) %>%
    left_join(agg_accepts_accepter, by = c("game_id", "player_color")) %>%
    left_join(agg_banks, by = c("game_id", "player_color")) %>%
    left_join(agg_builds, by = c("game_id", "player_color")) %>%
    left_join(agg_gains_wide, by = c("game_id", "player_color")) %>%
    left_join(agg_gains_total, by = c("game_id", "player_color")) %>%
    left_join(agg_victim, by = c("game_id", "player_color")) %>%
    left_join(agg_thief, by = c("game_id", "player_color")) %>%
    left_join(agg_devs, by = c("game_id", "player_color")) %>%
    left_join(agg_ach, by = c("game_id", "player_color")) %>%
    left_join(games_df %>% select(game_id, winner_color), by = "game_id") %>%
    mutate(
      won = !is.na(winner_color) & player_color == winner_color,
      across(where(is.numeric), ~ ifelse(is.na(.x), 0, .x))
    )

  result
}

# ---- Top-level entry -----------------------------------------------------

load_all <- function(dir = REPLAY_DIR) {
  files <- list_replay_files(dir)
  if (length(files) == 0) {
    message("No .json files in ", dir, "/ — save replays there first.")
    return(invisible(list()))
  }
  message("Loading ", length(files), " replay file(s) from ", dir, "/ ...")
  bundles <- map(files, load_replay)

  games <- bind_rows(map(bundles, extract_game_meta)) |>
    arrange(start_time) |>
    mutate(game_order = row_number())
  events <- bind_rows(map(bundles, extract_events))
  rosters <- bind_rows(map(bundles, extract_rosters))
  standings <- bind_rows(map(bundles, extract_final_standings))
  activity <- bind_rows(map(bundles, extract_activity_stats))
  dice_hist <- bind_rows(map(bundles, extract_dice_histogram))
  tiles <- bind_rows(map(bundles, extract_tiles))
  corners <- bind_rows(map(bundles, extract_corners))
  placements <- bind_rows(map(bundles, extract_settlement_placements))
  settlement_tiles <- settlement_adjacencies(placements, corners, tiles)
  city_upgrades <- bind_rows(map(bundles, extract_city_upgrades))
  robber_moves <- bind_rows(map(bundles, extract_robber_moves))
  longest_road_states <- bind_rows(map(bundles, extract_longest_road))

  dice <- dice_rolls(events)
  offers <- trade_offers(events)
  accepts <- trades_accepted(events)
  banks <- bank_trades(events)
  builds_df <- builds(events)
  gains <- resource_gains(events)
  steals_df <- steals(events)
  devs <- dev_cards_bought(events)
  ach <- achievements(events)
  seven_disc <- seven_discards(events)
  yop <- bind_rows(map(bundles, extract_yop))
  monopoly <- bind_rows(map(bundles, extract_monopoly))
  vp_timeline <- bind_rows(map(bundles, extract_vp_timeline))
  reconstructed <- player_stats(events, dice, offers, accepts, banks, builds_df,
                                gains, steals_df, devs, ach, games)

  # Canonical per-(game, player) frame: roster + final standings +
  # official activity stats + reconstructed event aggregates.
  stats <- rosters %>%
    left_join(standings, by = c("game_id", "player_color")) %>%
    left_join(activity, by = c("game_id", "player_color")) %>%
    left_join(reconstructed %>% select(-winner_color, -won),
              by = c("game_id", "player_color"))

  message("Loaded ", nrow(games), " game(s), ", nrow(events), " events, ",
          nrow(rosters), " player slots.")

  list(
    games = games,
    rosters = rosters,
    standings = standings,
    activity_stats = activity,
    dice_histogram = dice_hist,
    events = events,
    dice_rolls = dice,
    trade_offers = offers,
    trades_accepted = accepts,
    bank_trades = banks,
    builds = builds_df,
    resource_gains = gains,
    steals = steals_df,
    dev_cards = devs,
    seven_discards = seven_disc,
    year_of_plenty = yop,
    monopoly = monopoly,
    vp_timeline = vp_timeline,
    achievements = ach,
    tiles = tiles,
    corners = corners,
    settlement_placements = placements,
    settlement_tiles = settlement_tiles,
    city_upgrades = city_upgrades,
    robber_moves = robber_moves,
    longest_road_states = longest_road_states,
    player_stats = stats
  )
}

# If run directly (Rscript analysis/load_replays.R), print a quick summary.
if (!interactive() && identical(sys.nframe(), 0L)) {
  d <- load_all()
  if (length(d) > 0) {
    cat("\n=== games ===\n"); print(d$games)
    cat("\n=== player_stats ===\n"); print(d$player_stats)
  }
}
