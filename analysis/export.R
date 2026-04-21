# Export computed analyses to public/data/*.json for the Next.js UI.
# Run after adding new replays:
#   Rscript analysis/export.R

suppressPackageStartupMessages({
  library(dplyr)
  library(tidyr)
  library(purrr)
  library(jsonlite)
})

setwd(here::here())
source("analysis/load_replays.R")

d <- load_all()

out_dir <- "public/data"
if (!dir.exists(out_dir)) dir.create(out_dir, recursive = TRUE)

write_j <- function(x, name) {
  jsonlite::write_json(x, file.path(out_dir, paste0(name, ".json")),
                       auto_unbox = TRUE, null = "null", na = "null",
                       pretty = FALSE)
}

# ---- Player totals + per-game -------------------------------------------

# Seven-discard cards per player per game
seven_losses <- d$seven_discards |>
  group_by(game_id, player_color) |>
  summarise(cards_lost_to_7 = sum(n_cards, na.rm = TRUE), .groups = "drop")

player_per_game <- d$player_stats |>
  left_join(seven_losses, by = c("game_id", "player_color")) |>
  mutate(cards_lost_to_7 = coalesce(cards_lost_to_7, 0L))

# Cards given / received per player from accepted P2P trades (both sides)
p2p_given_by_player <- d$trades_accepted |>
  mutate(n = map_int(given, length)) |>
  group_by(game_id, player_color = offerer_color) |>
  summarise(p2p_given = sum(n), .groups = "drop")
p2p_received_by_player <- d$trades_accepted |>
  mutate(n = map_int(received, length)) |>
  group_by(game_id, player_color = offerer_color) |>
  summarise(p2p_received_offerer = sum(n), .groups = "drop")
# Accepter side: they gave "received" cards and received "given" cards
p2p_given_by_accepter <- d$trades_accepted |>
  mutate(n = map_int(received, length)) |>
  group_by(game_id, player_color = accepter_color) |>
  summarise(p2p_given_acc = sum(n), .groups = "drop")
p2p_received_by_accepter <- d$trades_accepted |>
  mutate(n = map_int(given, length)) |>
  group_by(game_id, player_color = accepter_color) |>
  summarise(p2p_received_acc = sum(n), .groups = "drop")

bank_given <- d$bank_trades |>
  mutate(n = map_int(given, length)) |>
  group_by(game_id, player_color) |>
  summarise(bank_given = sum(n), .groups = "drop")
bank_received <- d$bank_trades |>
  mutate(n = map_int(received, length)) |>
  group_by(game_id, player_color) |>
  summarise(bank_received = sum(n), .groups = "drop")

trades_per_game <- d$player_stats |>
  select(game_id, player_color) |>
  left_join(p2p_given_by_player, by = c("game_id", "player_color")) |>
  left_join(p2p_given_by_accepter, by = c("game_id", "player_color")) |>
  left_join(p2p_received_by_player, by = c("game_id", "player_color")) |>
  left_join(p2p_received_by_accepter, by = c("game_id", "player_color")) |>
  left_join(bank_given, by = c("game_id", "player_color")) |>
  left_join(bank_received, by = c("game_id", "player_color")) |>
  mutate(across(c(p2p_given, p2p_given_acc, p2p_received_offerer,
                  p2p_received_acc, bank_given, bank_received),
                ~ coalesce(.x, 0L))) |>
  transmute(
    game_id, player_color,
    cards_traded_away = p2p_given + p2p_given_acc + bank_given,
    cards_traded_for  = p2p_received_offerer + p2p_received_acc + bank_received
  )

# Per-player per-resource cards GIVEN in trades (P2P both sides + bank)
# Offerer of accepted P2P trade gives their `given` list
p2p_away_offerer <- d$trades_accepted |>
  select(game_id, player_color = offerer_color, given) |>
  tidyr::unnest_longer(given, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n")
# Accepter of accepted P2P trade gives their `received` list (from their POV)
p2p_away_accepter <- d$trades_accepted |>
  select(game_id, player_color = accepter_color, received) |>
  tidyr::unnest_longer(received, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n")
bank_away <- d$bank_trades |>
  select(game_id, player_color, given) |>
  tidyr::unnest_longer(given, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n")

traded_away_by_res <- bind_rows(p2p_away_offerer, p2p_away_accepter, bank_away) |>
  group_by(game_id, player_color, resource) |>
  summarise(n = sum(n), .groups = "drop") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(username, resource) |>
  summarise(n = sum(n), .groups = "drop") |>
  mutate(resource = paste0("traded_away_", resource)) |>
  tidyr::pivot_wider(names_from = resource, values_from = n, values_fill = 0L)

# Per-player per-resource cards RECEIVED from trades
p2p_for_offerer <- d$trades_accepted |>
  select(game_id, player_color = offerer_color, received) |>
  tidyr::unnest_longer(received, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n")
p2p_for_accepter <- d$trades_accepted |>
  select(game_id, player_color = accepter_color, given) |>
  tidyr::unnest_longer(given, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n")
bank_for <- d$bank_trades |>
  select(game_id, player_color, received) |>
  tidyr::unnest_longer(received, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n")

traded_for_by_res <- bind_rows(p2p_for_offerer, p2p_for_accepter, bank_for) |>
  group_by(game_id, player_color, resource) |>
  summarise(n = sum(n), .groups = "drop") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(username, resource) |>
  summarise(n = sum(n), .groups = "drop") |>
  mutate(resource = paste0("traded_for_", resource)) |>
  tidyr::pivot_wider(names_from = resource, values_from = n, values_fill = 0L)

# ---- YEAR OF PLENTY per resource ---------------------------------------
yop_by_res <- d$year_of_plenty |>
  select(game_id, player_color, card_enums) |>
  tidyr::unnest_longer(card_enums, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(username, resource) |>
  summarise(n = sum(n), .groups = "drop") |>
  mutate(resource = paste0("yop_", resource)) |>
  tidyr::pivot_wider(names_from = resource, values_from = n, values_fill = 0L)

# ---- MONOPOLY gains for the player who played it -----------------------
mono_gain_by_res <- d$monopoly |>
  select(game_id, player_color, resource, amount_stolen) |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(username, resource) |>
  summarise(n = sum(amount_stolen, na.rm = TRUE), .groups = "drop") |>
  mutate(resource = paste0("mono_gain_", resource)) |>
  tidyr::pivot_wider(names_from = resource, values_from = n, values_fill = 0L)

# ---- MONOPOLY losses per victim per resource ---------------------------
mono_loss_by_res <- d$monopoly |>
  # victims is a list-column of {player_color, lost}
  mutate(row_id = row_number()) |>
  tidyr::unnest_longer(victims) |>
  mutate(
    victim_color = purrr::map_int(victims, ~ as.integer(.x$player_color %or% NA_integer_)),
    lost = purrr::map_int(victims, ~ as.integer(.x$lost %or% 0L))
  ) |>
  select(game_id, player_color = victim_color, resource, lost) |>
  filter(!is.na(player_color)) |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(username, resource) |>
  summarise(n = sum(lost, na.rm = TRUE), .groups = "drop") |>
  mutate(resource = paste0("mono_loss_", resource)) |>
  tidyr::pivot_wider(names_from = resource, values_from = n, values_fill = 0L)

# ---- ROBBER steals: thief side (what this player took from others) -----
robber_gain_by_res <- d$steals |>
  select(game_id, player_color = thief_color, card_enums) |>
  tidyr::unnest_longer(card_enums, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(username, resource) |>
  summarise(n = sum(n), .groups = "drop") |>
  mutate(resource = paste0("robber_gain_", resource)) |>
  tidyr::pivot_wider(names_from = resource, values_from = n, values_fill = 0L)

# Per-player per-resource cards LOST to robber (victim side)
robber_loss_by_res <- d$steals |>
  select(game_id, player_color = victim_color, card_enums) |>
  tidyr::unnest_longer(card_enums, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(username, resource) |>
  summarise(n = sum(n), .groups = "drop") |>
  mutate(resource = paste0("stolen_", resource)) |>
  tidyr::pivot_wider(names_from = resource, values_from = n, values_fill = 0L)

# Per-player per-resource cards LOST to 7-rolls (own discards)
seven_loss_by_res <- d$seven_discards |>
  select(game_id, player_color, cards) |>
  tidyr::unnest_longer(cards, values_to = "card_enum") |>
  mutate(resource = resource_name(card_enum)) |>
  count(game_id, player_color, resource, name = "n") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(username, resource) |>
  summarise(n = sum(n), .groups = "drop") |>
  mutate(resource = paste0("lost7_", resource)) |>
  tidyr::pivot_wider(names_from = resource, values_from = n, values_fill = 0L)

compute_expected_cards <- function(tiles, cities, robbers, games_df) {
  result <- list()
  for (gid in unique(tiles$game_id)) {
    g_tiles <- tiles[tiles$game_id == gid, ]
    if (nrow(g_tiles) == 0) next
    tt <- games_df$total_turns[games_df$game_id == gid][1]
    if (is.na(tt)) next
    g_robbers <- robbers[robbers$game_id == gid, ]
    g_robbers <- g_robbers[order(g_robbers$turn), ]
    if (nrow(g_robbers) == 0) {
      r_tile <- integer(0); r_start <- integer(0); r_end <- integer(0)
    } else {
      r_tile  <- g_robbers$tile_id
      r_start <- g_robbers$turn
      r_end   <- c(r_start[-1] - 1L, as.integer(tt))
    }
    g_cities <- cities[cities$game_id == gid, ]
    city_map <- setNames(
      as.integer(g_cities$upgrade_turn),
      paste(g_cities$player_color, g_cities$corner_id, sep = "-")
    )
    upgrade <- city_map[paste(g_tiles$player_color, g_tiles$corner_id, sep = "-")]
    placed  <- as.integer(g_tiles$placement_turn)
    sStart  <- placed + 1L
    sEnd    <- ifelse(is.na(upgrade), as.integer(tt), as.integer(upgrade))
    cStart  <- ifelse(is.na(upgrade), as.integer(tt) + 1L, as.integer(upgrade) + 1L)
    cEnd    <- rep(as.integer(tt), nrow(g_tiles))
    sTurns  <- pmax(0L, sEnd - sStart + 1L)
    cTurns  <- pmax(0L, cEnd - cStart + 1L)
    sBlocked <- integer(nrow(g_tiles)); cBlocked <- integer(nrow(g_tiles))
    tile_ids <- g_tiles$tile_id
    for (i in seq_len(nrow(g_tiles))) {
      m <- which(r_tile == tile_ids[i])
      if (length(m) == 0) next
      sBlocked[i] <- sum(pmax(0L,
        pmin(r_end[m], sEnd[i]) - pmax(r_start[m], sStart[i]) + 1L))
      cBlocked[i] <- sum(pmax(0L,
        pmin(r_end[m], cEnd[i]) - pmax(r_start[m], cStart[i]) + 1L))
    }
    expected <- g_tiles$pips * (sTurns - sBlocked) / 36 +
                g_tiles$pips * 2 * (cTurns - cBlocked) / 36
    agg <- data.frame(
      game_id = gid,
      player_color = g_tiles$player_color,
      expected = expected
    )
    agg <- aggregate(expected ~ game_id + player_color, data = agg, sum)
    result[[gid]] <- agg
  }
  dplyr::bind_rows(result) |>
    dplyr::rename(expected_cards_from_rolls = expected)
}

expected_per_game <- compute_expected_cards(
  d$settlement_tiles, d$city_upgrades, d$robber_moves, d$games
)

player_per_game <- player_per_game |>
  left_join(expected_per_game, by = c("game_id", "player_color")) |>
  mutate(expected_cards_from_rolls = coalesce(expected_cards_from_rolls, 0))

# Whether each player held Longest Road / Largest Army at game end.
# vp_breakdown is keyed by VP type; 3 = longest road, 4 = largest army.
vp_flag <- function(vps, key) {
  if (is.null(vps) || length(vps) == 0) return(0L)
  v <- vps[[as.character(key)]]
  if (is.null(v) || is.na(v) || v == 0) 0L else 1L
}
achievement_flags <- d$standings |>
  mutate(
    had_longest_road = map_int(vp_breakdown, ~ vp_flag(.x, 3)),
    had_largest_army = map_int(vp_breakdown, ~ vp_flag(.x, 4))
  ) |>
  select(game_id, player_color, had_longest_road, had_largest_army)

player_per_game <- player_per_game |>
  left_join(achievement_flags, by = c("game_id", "player_color")) |>
  mutate(
    had_longest_road = coalesce(had_longest_road, 0L),
    had_largest_army = coalesce(had_largest_army, 0L)
  )

player_totals <- player_per_game |>
  left_join(trades_per_game, by = c("game_id", "player_color")) |>
  mutate(across(c(cards_traded_away, cards_traded_for), ~ coalesce(.x, 0L))) |>
  group_by(username) |>
  summarise(
    games                = n(),
    dev_cards_bought     = sum(dev_cards_bought),
    dev_cards_played     = sum(dev_cards_used),
    roads                = sum(built_road),
    settlements          = sum(built_settlement, na.rm = TRUE),
    cities               = sum(built_city, na.rm = TRUE),
    trades_proposed      = sum(proposed_trades),
    trades_accepted      = sum(successful_trades),
    bank_trades          = sum(n_bank_trades),
    times_robbed_others  = sum(n_steals_done),
    stolen_from          = sum(n_stolen_from),
    resources_blocked    = sum(resource_income_blocked),
    cards_lost_to_7      = sum(cards_lost_to_7),
    resources_used       = sum(resources_used),
    cards_from_rolls     = sum(gained_total),
    expected_cards_from_rolls = sum(expected_cards_from_rolls, na.rm = TRUE),
    gained_lumber        = sum(gained_lumber, na.rm = TRUE),
    gained_brick         = sum(gained_brick, na.rm = TRUE),
    gained_wool          = sum(gained_wool, na.rm = TRUE),
    gained_grain         = sum(gained_grain, na.rm = TRUE),
    gained_ore           = sum(gained_ore, na.rm = TRUE),
    cards_traded_away    = sum(cards_traded_away),
    cards_traded_for     = sum(cards_traded_for),
    longest_road_cards   = sum(had_longest_road, na.rm = TRUE),
    largest_army_cards   = sum(had_largest_army, na.rm = TRUE),
    .groups = "drop"
  ) |>
  mutate(
    trade_completion_rate = ifelse(trades_proposed > 0,
                                   trades_accepted / trades_proposed,
                                   NA_real_),
    luck_ratio = ifelse(expected_cards_from_rolls > 0,
                        cards_from_rolls / expected_cards_from_rolls,
                        NA_real_)
  ) |>
  left_join(robber_loss_by_res,  by = "username") |>
  left_join(seven_loss_by_res,   by = "username") |>
  left_join(traded_away_by_res,  by = "username") |>
  left_join(traded_for_by_res,   by = "username") |>
  left_join(yop_by_res,          by = "username") |>
  left_join(mono_gain_by_res,    by = "username") |>
  left_join(mono_loss_by_res,    by = "username") |>
  left_join(robber_gain_by_res,  by = "username") |>
  mutate(across(starts_with("stolen_"),       ~ coalesce(.x, 0L)),
         across(starts_with("lost7_"),        ~ coalesce(.x, 0L)),
         across(starts_with("traded_away_"),  ~ coalesce(.x, 0L)),
         across(starts_with("traded_for_"),   ~ coalesce(.x, 0L)),
         across(starts_with("yop_"),          ~ coalesce(.x, 0L)),
         across(starts_with("mono_gain_"),    ~ coalesce(.x, 0L)),
         across(starts_with("mono_loss_"),    ~ coalesce(.x, 0L)),
         across(starts_with("robber_gain_"),  ~ coalesce(.x, 0L)))

write_j(player_totals, "player_totals")

# ---- Games metadata (for calendar + game picker) ------------------------

games_out <- d$games |>
  select(game_id, start_time, duration_s, total_turns, n_players,
         winner_color, vp_to_win, is_discord, is_ranked) |>
  mutate(start_time = format(start_time, "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"))

# Attach roster with usernames
rosters_out <- d$rosters |>
  select(game_id, player_color, username, is_bot)

standings_out <- d$standings |>
  mutate(vp_cards = map_int(vp_breakdown, function(vp) {
    v <- vp[["2"]]; if (is.null(v)) 0L else as.integer(v)
  })) |>
  select(game_id, player_color, rank, vp_total, won, vp_cards)

write_j(games_out, "games")
write_j(rosters_out, "rosters")
write_j(standings_out, "standings")

# ---- VP timelines per game ----------------------------------------------
# One big JSON with all games; UI filters by game_id

vp_out <- d$vp_timeline |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color"))

write_j(vp_out, "vp_timeline")

# ---- Resource timelines per game ----------------------------------------

# Dice-roll gains only so the game-level "Resources From Rolls" total and
# the dice-luck comparison are apples-to-apples with expected production.
resource_cum <- d$resource_gains |>
  filter(distribution_type == 1) |>
  count(game_id, player_color, turn, name = "cards") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  group_by(game_id, player_color, username) |>
  arrange(turn) |>
  mutate(cumulative = cumsum(cards)) |>
  ungroup()

write_j(resource_cum, "resource_cum")

# ---- Settlement tiles / adjacencies -------------------------------------

settlement_out <- d$settlement_tiles |>
  select(game_id, player_color, placement_order, is_initial,
         any_of("placement_turn"), corner_id,
         tile_id, tile_type, dice_number, resource, pips)

write_j(settlement_out, "settlement_tiles")

city_out <- d$city_upgrades |>
  select(game_id, player_color, corner_id, upgrade_turn)

write_j(city_out, "city_upgrades")

robber_out <- d$robber_moves |>
  select(game_id, turn, tile_id) |>
  arrange(game_id, turn)

write_j(robber_out, "robber_moves")

# ---- Dice histogram -----------------------------------------------------

write_j(d$dice_histogram, "dice_histogram")

# ---- Trade offers / bank trades / trades accepted -----------------------

write_j(d$trade_offers |>
          mutate(offered_names = sapply(offered_names, paste, collapse = ","),
                 wanted_names = sapply(wanted_names, paste, collapse = ",")) |>
          select(game_id, event_idx, turn, offerer_color,
                 offered_names, wanted_names, n_offered, n_wanted),
        "trade_offers")

# Capture a price data point for every trade where at least ONE side is a
# single resource. If the received side is uniform, price = cards given per
# card received (cost of receiving one of that resource). If the given side
# is uniform, flip the perspective: price = cards received per card given
# (what one of that resource "bought"). A trade with both sides uniform
# contributes one point per resource.
rx_uniform <- d$trades_accepted |>
  mutate(
    n_given = lengths(given),
    n_received = lengths(received),
    uniform = map_chr(received_names, ~ {
      if (length(.x) == 0 || length(unique(.x)) > 1) NA_character_ else .x[1]
    }),
    price = n_given / n_received
  ) |>
  filter(!is.na(uniform), price > 0) |>
  select(game_id, event_idx, offerer_color, accepter_color,
         resource = uniform, price, n_given, n_received)

gx_uniform <- d$trades_accepted |>
  mutate(
    n_given = lengths(given),
    n_received = lengths(received),
    uniform = map_chr(given_names, ~ {
      if (length(.x) == 0 || length(unique(.x)) > 1) NA_character_ else .x[1]
    }),
    # Flipped: swap offerer/accepter roles and compute price from the
    # "giver" resource's perspective so semantics stay "cards paid per
    # card of this resource".
    price = n_received / n_given,
    offerer_color_new = accepter_color,
    accepter_color_new = offerer_color
  ) |>
  filter(!is.na(uniform), price > 0) |>
  transmute(
    game_id,
    event_idx,
    offerer_color = offerer_color_new,
    accepter_color = accepter_color_new,
    resource = uniform,
    price,
    n_given = n_received,
    n_received = n_given
  )

p2p_prices <- bind_rows(rx_uniform, gx_uniform)

write_j(p2p_prices, "p2p_prices")

# ---- Records (for Record Book page) -------------------------------------

# Per-player per-game resource gained totals (already in player_per_game)
# Per-player per-game: robber placements, steals, blocked, dev cards, cards_from_rolls

# Compute longest dry streak (turns in a row with 0 resource cards gained)
# For each (game, player), walk every turn 1..max_turn and mark 0 vs >0.
dry_streaks <- d$resource_gains |>
  distinct(game_id, player_color, turn) |>
  # Use d$games$total_turns as the max turn bound per game
  full_join(d$games |> select(game_id, total_turns),
            by = "game_id", relationship = "many-to-one") |>
  group_by(game_id) |>
  summarise(
    resource_turns = list(unique(turn)),
    total_turns = first(total_turns),
    .groups = "drop"
  )

compute_longest_dry <- function(gid, pc, tt) {
  if (is.na(tt) || tt < 1) return(0L)
  got <- d$resource_gains |>
    filter(game_id == gid, player_color == pc) |>
    pull(turn) |>
    unique()
  got <- as.integer(got)
  got <- got[!is.na(got) & got >= 1L & got <= tt]
  v <- rep(0L, tt)
  if (length(got) > 0) v[got] <- 1L
  runs <- rle(v == 0)
  if (!any(runs$values)) {
    0L
  } else {
    as.integer(max(runs$lengths[runs$values]))
  }
}

longest_dry_per_player <- d$player_stats |>
  select(game_id, player_color) |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  left_join(d$games |> select(game_id, total_turns), by = "game_id") |>
  mutate(longest_dry = pmap_int(
    list(game_id, player_color, total_turns),
    compute_longest_dry
  )) |>
  select(game_id, player_color, username, longest_dry)

write_j(longest_dry_per_player, "longest_dry")

# Merge everything useful per (game, player) for record lookups.
# player_stats already has username, so no need to join rosters.
per_game_player <- d$player_stats |>
  left_join(seven_losses, by = c("game_id", "player_color")) |>
  left_join(longest_dry_per_player |> select(game_id, player_color, longest_dry),
            by = c("game_id", "player_color")) |>
  mutate(cards_lost_to_7 = coalesce(cards_lost_to_7, 0L),
         longest_dry = coalesce(longest_dry, 0L)) |>
  select(game_id, player_color, username,
         cards_from_rolls = gained_total,
         dev_cards_bought,
         n_steals_done,
         n_stolen_from,
         resources_blocked = resource_income_blocked,
         cards_lost_to_7,
         longest_dry,
         won,
         vp_total)

write_j(per_game_player, "per_game_player")

# ---- Single-roll records ------------------------------------------------

# Most resources from one dice roll (distribution_type == 1 == roll gains).
# Group by (game, turn, player) — one roll per turn.
most_gained_single_roll <- d$resource_gains |>
  filter(distribution_type == 1) |>
  count(game_id, turn, player_color, name = "n_cards") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  arrange(desc(n_cards)) |>
  slice_head(n = 10) |>
  select(game_id, turn, player_color, username, n_cards)

write_j(most_gained_single_roll, "most_gained_single_roll")

# Most cards lost to a single 7-roll. Each seven_discards event = one
# player being forced to discard on one specific 7.
most_discarded_single_roll <- d$seven_discards |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  arrange(desc(n_cards)) |>
  slice_head(n = 10) |>
  select(game_id, turn, player_color, username, n_cards)

write_j(most_discarded_single_roll, "most_discarded_single_roll")

# ---- Per-player-per-game trade volume records --------------------------

# Each P2P trade contributes a row per participant: offerer + accepter. For
# each (game, player) aggregate the trade count and the total cards touched
# (n_given + n_received summed).
trade_rows <- d$trades_accepted |>
  mutate(
    n_given = lengths(given),
    n_received = lengths(received)
  ) |>
  select(game_id, event_idx, offerer_color, accepter_color, n_given, n_received)

trade_participations <- bind_rows(
  trade_rows |>
    transmute(game_id, player_color = offerer_color,
              cards = n_given + n_received),
  trade_rows |>
    transmute(game_id, player_color = accepter_color,
              cards = n_given + n_received)
)

per_player_trade_totals <- trade_participations |>
  group_by(game_id, player_color) |>
  summarise(n_trades = n(),
            n_cards_traded = sum(cards),
            .groups = "drop") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color"))

most_trades_completed_game <- per_player_trade_totals |>
  arrange(desc(n_trades)) |>
  slice_head(n = 10) |>
  select(game_id, player_color, username, n_trades)

write_j(most_trades_completed_game, "most_trades_completed_game")

most_resources_traded_game <- per_player_trade_totals |>
  arrange(desc(n_cards_traded)) |>
  slice_head(n = 10) |>
  select(game_id, player_color, username, n_cards_traded)

write_j(most_resources_traded_game, "most_resources_traded_game")

# ---- Biggest monopoly haul (single turn) -------------------------------
# Each monopoly play row = one turn-scoped event. amount_stolen already
# sums the take across all victims for that play.
event_turn_lookup <- d$events |>
  distinct(game_id, event_idx, turn)

most_monopoly_haul <- d$monopoly |>
  left_join(event_turn_lookup, by = c("game_id", "event_idx")) |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  arrange(desc(amount_stolen)) |>
  slice_head(n = 10) |>
  select(game_id, turn, player_color, username, resource, n_cards = amount_stolen)

write_j(most_monopoly_haul, "most_monopoly_haul")

# ---- Most resources lost in one turn -----------------------------------
# Combines: cards stolen by an opponent's robber + cards lost to an
# opponent's monopoly + cards discarded on a 7-roll.
loss_robber <- d$steals |>
  count(game_id, turn, victim_color, name = "n") |>
  rename(player_color = victim_color)

loss_seven <- d$seven_discards |>
  group_by(game_id, turn, player_color) |>
  summarise(n = sum(n_cards), .groups = "drop")

loss_mono <- d$monopoly |>
  left_join(event_turn_lookup, by = c("game_id", "event_idx")) |>
  tidyr::unnest(victims) |>
  mutate(
    player_color = map_int(victims, ~ .x$player_color),
    n = map_int(victims, ~ .x$lost)
  ) |>
  group_by(game_id, turn, player_color) |>
  summarise(n = sum(n), .groups = "drop")

resources_lost_per_turn <- bind_rows(loss_robber, loss_seven, loss_mono) |>
  group_by(game_id, turn, player_color) |>
  summarise(n_cards = sum(n), .groups = "drop") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color"))

most_resources_lost_turn <- resources_lost_per_turn |>
  arrange(desc(n_cards)) |>
  slice_head(n = 10) |>
  select(game_id, turn, player_color, username, n_cards)

write_j(most_resources_lost_turn, "most_resources_lost_turn")

# ---- Longest consecutive-producing streak (single game) ---------------
# For each (game, player), walk turns 1..total_turns and find the longest
# run of consecutive turns where they gained ≥1 card from a roll
# (distribution_type == 1).
roll_turns <- d$resource_gains |>
  filter(distribution_type == 1) |>
  distinct(game_id, player_color, turn)

compute_longest_produce <- function(gid, pc, tt) {
  if (is.na(tt) || tt < 1) return(0L)
  got <- roll_turns |>
    filter(game_id == gid, player_color == pc) |>
    pull(turn) |>
    unique() |>
    as.integer()
  got <- got[!is.na(got) & got >= 1L & got <= tt]
  v <- rep(0L, tt)
  if (length(got) > 0) v[got] <- 1L
  runs <- rle(v == 1)
  if (!any(runs$values)) {
    0L
  } else {
    as.integer(max(runs$lengths[runs$values]))
  }
}

longest_produce_per_player <- d$player_stats |>
  select(game_id, player_color) |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  left_join(d$games |> select(game_id, total_turns), by = "game_id") |>
  mutate(longest_produce = pmap_int(
    list(game_id, player_color, total_turns),
    compute_longest_produce
  )) |>
  select(game_id, player_color, username, longest_produce)

most_consecutive_roll_turns <- longest_produce_per_player |>
  arrange(desc(longest_produce)) |>
  slice_head(n = 10) |>
  select(game_id, player_color, username, n_turns = longest_produce)

write_j(most_consecutive_roll_turns, "most_consecutive_roll_turns")

# ---- Luckiest / unluckiest games ---------------------------------------
# Same formula as the per-player luck ratio but scoped to a single game.
# Require a reasonable floor on expected so tiny-sample outliers don't
# dominate the list.
per_game_luck <- player_per_game |>
  filter(expected_cards_from_rolls >= 20) |>
  mutate(
    cards_from_rolls = gained_total,
    luck_ratio = gained_total / expected_cards_from_rolls
  ) |>
  select(game_id, player_color, username,
         cards_from_rolls, expected_cards_from_rolls, luck_ratio)

luckiest_game <- per_game_luck |>
  arrange(desc(luck_ratio)) |>
  slice_head(n = 10)

unluckiest_game <- per_game_luck |>
  arrange(luck_ratio) |>
  slice_head(n = 10)

write_j(luckiest_game, "luckiest_game")
write_j(unluckiest_game, "unluckiest_game")

# ---- Most dev cards bought in one turn ---------------------------------
most_dev_cards_turn <- d$dev_cards |>
  count(game_id, turn, player_color, name = "n_cards") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  arrange(desc(n_cards)) |>
  slice_head(n = 10) |>
  select(game_id, turn, player_color, username, n_cards)

write_j(most_dev_cards_turn, "most_dev_cards_turn")

# ---- Largest Army (most knights played, single game) -------------------
# Type 20 log entry = dev card played; cardEnum 11 = Knight (empirically
# the most-played type and matches hasLargestArmy transitions).
knight_plays <- d$events |>
  filter(type == 20) |>
  mutate(
    card_enum = map_int(payload, ~ int_or_na(.x$cardEnum)),
    pc = map_int(payload, ~ int_or_na(.x$playerColor))
  ) |>
  filter(card_enum == 11) |>
  count(game_id, pc, name = "knights") |>
  rename(player_color = pc)

largest_army_record <- knight_plays |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  arrange(desc(knights)) |>
  slice_head(n = 10) |>
  select(game_id, player_color, username, n_knights = knights)

write_j(largest_army_record, "largest_army_record")

# ---- Longest Road (max road length ever held, single game) ------------
# Peak `longestRoad` ever recorded per (game, player) from the replay's
# mechanicLongestRoadState snapshots.
longest_road_record <- d$longest_road_states |>
  group_by(game_id, player_color) |>
  summarise(road_len = max(road_len, na.rm = TRUE), .groups = "drop") |>
  left_join(d$rosters |> select(game_id, player_color, username),
            by = c("game_id", "player_color")) |>
  arrange(desc(road_len)) |>
  slice_head(n = 10) |>
  select(game_id, player_color, username, n_roads = road_len)

write_j(longest_road_record, "longest_road_record")

cat("\nExported to", out_dir, "\n")
cat("Files:\n")
cat(paste0("  ", list.files(out_dir)), sep = "\n")
