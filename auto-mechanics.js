// ================================================
// auto-mechanics.js   v5.0   【最终超强提示版】
// 基于你原本代码 + 完整 Schema v1.1 + 最严格提示
// ================================================

const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

// ==================== 配置区 ====================
const FORCE_REGENERATE = false;     // true = 全部重新生成
const SLEEP_MS = 1500;             // 1.5秒间隔

// Round 11A official-compliance guardrails:
// - Security setup and draws both use the top of deck (engine convention: deck.pop()).
// - ACE Overflow is a rule-layer property. Do not emit it as a normal action, and do not
//   encode stack-wide recursive overflow. Each ACE card leaving battle area/source applies once.
// - On Deletion should be triggered once after a deletion is confirmed and before the card is moved to trash.
// Round 11C security-accuracy guardrails:
// - Engine convention: security.push(card) places on top; security.pop() checks/removes top.
// - Option Security effects checked by an attacker with A Delicate Plan-style suppression do not activate, but the checked Option still goes to trash.
// - Digimon played by a Security effect must trigger On Play after entering the battle area.
// - If the attacker is deleted by a Security Digimon battle, remaining security checks stop.
// Round 11D breeding/raising guardrails:
// - Cards in breeding only activate effects explicitly marked [Breeding].
// - Digivolving in breeding draws 1 but does not activate normal When Digivolving/DIGIVOLVED listeners.
// - Moving from breeding to battle is not playing, clears playedThisTurn, and triggers When Moving after reaching battle.
// - Normal battle-area effects should not target or affect breeding-area cards unless text explicitly says breeding.



































































// Round 22DV attack pending-target deadlock guardrails:
// - [When Attacking] effects that open target/reveal/choice windows must fully resolve before `shift_to_counter` opens Counter timing; System counter handoffs must be de-duplicated and deferred behind real player windows.
// - A pendingTarget created during attack timing must always have a real playerId, legal candidates or an immediate fizzle, and a null-target/FIZZLE submission must clear the window and resume the attack flow.
// - If every [When Attacking] window clears and no System handoff remains, the runtime must still advance WHEN_ATTACKING -> COUNTER instead of leaving counterTiming stuck.
// - The front end must close stale SERVER_TARGET UI when a subsequent pending target belongs to the other player and must hide “waiting for opponent” whenever the active pending window belongs to the local player.

// Round 22DT Tamer auto-trigger animation guardrails:
// - Automatic Tamer triggers such as [Start of Your Turn] memory setters and [Start of Your Main Phase] memory gain must remain rule-automatic, but the UI must show a visible animation/telemetry event so players can see the Tamer activated.
// - Tamer suspend costs paid by effects must emit a public visual-only event and animate the Tamer card; this must not reveal hidden zones or alter gameplay state.
// - The visual event stream must be bounded and rollback-safe when costs fail, so failed optional/atomic costs do not leave ghost animations.
// - Front-end animation consumers must process visual events once and keep a state-diff fallback for Tamer suspended changes.

// Round 22DS self-only cost-reduction scope guardrails:
// - Printed “When this card would be played/from the hand” or “When you would play/use this card” is self-only: it reduces only the exact card currently being played/used.
// - Do not let a copy already in the battle area/source stack become a continuous reducer for unrelated future cards such as Tamers, rookies, or level 7s.
// - Similar self-only reducers with “reduce this card’s/its play/use/memory cost” must remain bound to the played card; field reducers need explicit target text such as “any card with [trait] would be played.”
// - Runtime cost preprocessors must keep legitimate field/Tamer reducers working when they have an explicit target, while blocking self-only field-copy leakage.

// Round 22DQ reduced play-cost effect-play guardrails:
// - Printed “play ... with the play cost reduced by N” is not “without paying the cost.” Encode the PLAY_FROM_* action with free:false, payCost:true, and costReduction:N.
// - Do not leave a standalone REDUCE_COST action immediately before a PLAY_FROM_* action; the runtime only charges memory from the PLAY_FROM_* action itself.
// - Dynamic clauses such as “reduced by 1 for each card this effect placed” should use costReduction sourced from PLACED_BY_THIS_EFFECT so failed placements do not create free or over-reduced plays.
// - Name lists that mix Digimon and Tamers, such as [Gabumon]/[Nokia Shiramine], must not be filtered as cardType:"digimon" only.

// Round 22DP hand special digivolve permission guardrails:
// - Printed “Your [X] can digivolve into this card in your hand for a memory cost of N” is a base-restricted hand digivolution rule. Encode it as specialDigivolutionConditions / runtime parser support, not as an activated MAIN or WHEN_DIGIVOLVING WARP_EVOLVE/PAY_MEMORY mechanic.
// - Trash-count gates such as BT2-111 Beelzemon’s “while you have 10 or more cards in trash” must stay attached to the special digivolution permission.
// - Hybrid/Tamer text “digivolve this card from your hand onto one of your [color/name] Tamers as if the Tamer is level 3 ... for a memory cost of N” must remain a normal hand digivolve permission, not DNA_DIGIVOLVE and not a field [Main] effect.
// - Inherited source effects like ST7-03 Guilmon’s opponent-Digimon-deleted Draw 1 must be OPPONENT_DIGIMON_DELETED with isInherited:true, never this card’s ON_DELETION.

// Round 22DO effect-digivolve fixed-cost guardrails:
// - Printed “This Digimon can/may digivolve into X in your hand for a memory cost of N” must encode WARP_EVOLVE with target/base = this/source Digimon and evolveTo = the hand-card filter.
// - The memory cost must be paid by payCost:true + fixedCost:N after a legal evolution target is chosen; do not encode it as target.minCost/maxCost or as action/mechanic PAY_MEMORY pre-cost.
// - Follow-up text like “If it does, delete this Digimon at the end of the turn” must be gated by DIGIVOLVED_BY_THIS_EFFECT.
// - Exact Option memory cost clauses such as Gundramon’s cost-7 Option must use exactCost:7, not minCost/maxCost range encoding.

// Round 22DN cost selector semantic guardrails:
// - Printed "play cost X or lower/less" must use maxCost:X, never minCost:X.
// - Printed "Option card with a memory cost of 7" means exactCost:7, not minCost:7 / 7 or more.
// - Dynamic maximum play-cost clauses like Vespamon's "2 or less; for each face-up security, add 2" are target.maxCost dynamic caps, not REDUCE_COST actions.
// - "Digimon or Tamer" delete clauses should be one OR target window when the printed text says delete 1 total target, not two independent delete actions.

// Round 22BK remaining source-placement cost payoff guardrails:
// - Clauses like “By placing 1 [Doomsday Clock] from your hand or trash as this Digimon’s bottom digivolution card, you may play 2 Tokens” are PLACE_SOURCE costs, not normal PLACE_SOURCE actions.
// - Hand/trash source-placement payments that gate Draw/Token/protection payoffs must be mechanic.cost.type PLACE_SOURCE, unless the printed text has an earlier independent effect before “Then, by...”.
// - For “Then, by placing...” clauses such as Breaclaw, keep the earlier effect as a normal action and attach the PLACE_SOURCE payment to only the payoff action.
// - Source effects converted this way must keep isInherited:true; never move inherited When Attacking text onto the top Digimon as a non-inherited mechanic.




















// Round 22DC official BT25 card-pool guardrails:
// - Bandai official BT25 cardlist contains the following currently-missing card numbers: BT25-036 Craftmon, BT25-039 Sirenmon, BT25-060 Rebootmon, BT25-076 Ghoulmon, BT25-088 Kyo Sawashiro, and BT25-090 Tomoro Tenma.
// - Do not let third-party feed refreshes delete these official overlay cards or reduce the BT25 unique-card baseline below 104.
// - Rebootmon/Sirenmon/Kyo/Tomoro are important BT25 environment cards; keep their text, traits, and core mechanics present even if upstream metadata lags.

// Round 22DD official BT25 overlay image guardrails:
// - The six official BT25 overlay cards must keep img paths in /img/<cardId>.jpg and fetch-cards.js must offer a runner-friendly image-only pull path.
// - Do not rely on the third-party card loop to download overlay-card images; if upstream omits the cards, the normal loop never sees their image URLs.
// - Preserve `node fetch-cards.js --official-bt25-images-only` / `--overlay-images-only` so users can pull only missing overlay images without refreshing the full card database.

// Round 22DF npm test entrypoint guardrails:
// - package.json `npm test` / `npm run test:all` must resolve to a real root test-all.js entrypoint.
// - The root test-all.js must run syntax checks, audit-mechanics.js, and meta-match-sim.js so regression proof does not depend on stale/missing legacy matrix files.
// - Legacy `test report/*.js` files may still be called through `node test-all.js --legacy <file>` with compatibility shims, but package scripts must not directly point at missing root test files.








// Round 22EG BT25-057 official errata guardrails:
// - Official May 15, 2026 errata changes Final Judgment from “until your opponent's turn ends” to “for the turn”.
// - Encode BT25-057 / Final Judgment Rush, Security A. +1, and +5000 DP with END_OF_TURN duration only.
// - Do not regenerate OPPONENTS_END_OF_TURN / END_OF_OPPONENTS_TURN for BT25-057 Final Judgment, even if an upstream feed still has the pre-errata wording.

// Round 22EH ST10-06 Mastemon official errata guardrails:
// - Official Aug. 1, 2025 errata says the DNA branch searches the security stack, may play 1 level 5 or lower Digimon among it without paying its cost, then shuffles security.
// - Encode the first When Digivolving clause as PLACE_SECURITY_FROM_TRASH from trash to top face-down security; never PLACE_SOURCE zone:security.
// - Encode the DNA-only branch with DIGIVOLVE_CONTEXT dna:true, REVEAL_AND_SELECT from security, PLAY_FROM_* from revealed, and RETURN_REVEALED_REST_TO_SECURITY_SHUFFLE.
// - Do not regenerate the old “you may search your security stack for 1 level 5 or lower...” wording or hand/trash play linkage for ST10-06.


// Round 22EK hand dock/memory center guardrails:
// - Keep --hand-h centralized at clamp(112px, 13vh, 132px) so the absolute hand dock and battlefield safe-space stay in sync.
// - .player-area.self must reserve calc(var(--hand-h) + gutter), not only var(--hand-peek); otherwise the hand dock overlaps the lower playmat/cards.
// - .hand-area must remain an absolute bottom overlay with height/min-height var(--hand-h) and the YGO-style peek transform.

// Round 22EJ BT4-105 Tactical Retreat / SEND_TO_SECURITY guardrails:
// - Tactical Retreat! moves 1 of your battle-area Digimon to the top of your security stack face down; encode it as SEND_TO_SECURITY, never PLACE_SOURCE zone:security.
// - Moving that Digimon to security trashes its digivolution cards and does not trigger On Deletion.
// - Official BT4-105 Q&A: a Token chosen for this move is removed from the game/token pile instead of being added to security, and a Digi-Egg such as Mother D-Reaper goes to the bottom of the Digi-Egg deck instead.
// - Token/Digi-Egg replacement moves must not satisfy security-added triggers or PLACED_BY_THIS_EFFECT checks.

// Round 22EI effect-created attack during existing attack guardrails:
// - Official BT25-086 Dan Yuki Q&A says a new attack declaration cannot be made while an attack is already in progress, even if another End-of-Turn effect can still activate before Counter timing.
// - Encode “that Digimon may attack” / REQUEST_ATTACK_* as a normal effect-created attack opportunity, but the runtime must fizzle only the attack request if counterTiming.pendingAttack is already active.
// - Do not open ATTACK_* pendingChoice windows, replace counterTiming.pendingAttack, or start startAttackWithoutSuspending during an existing attack. Prior paid costs and earlier actions may resolve, but the new attack itself must be skipped.

// Round 22EF suspend-cost Tamer targeting guardrails:
// - Printed “By suspending 1 of your yellow/red Tamers” on a Digimon trigger is an optional processing cost; the player must be asked before payment.
// - SUSPEND costs with an explicit target must select an eligible Tamer/Digimon from the field and must not default to the sourceCard unless the printed text says this Digimon/this Tamer/self.
// - BT17-029 Agumon, BT17-033 GeoGreymon, BT17-037 RizeGreymon, and BT21-045 ShineGreymon must suspend eligible yellow/red Tamers for their attack/digivolve payoff, never the attacking source Digimon.

// Round 22EE Violet Inboots timing guardrails:
// - EX11-068 Violet Inboots has three separate official branches: [Start of Your Turn] MEMORY_COUNT <= 2 -> SET_MEMORY 3, [Your Turn]/attack trigger for Ghost attackers, and [Security] PLAY_FROM_SECURITY.
// - Never encode its Ghost-attack Draw 1 / trash 1 hand branch as START_OF_TURN or SECURITY; doing so causes false upkeep loot and prevents the Security card from being played.
// - The Ghost-attack branch must bind to EVENT_CONTEXT.attacker with [Ghost] trait and ask before paying the Tamer SUSPEND cost, because printed “by suspending this Tamer” is optional processing.
// - Leave the Execute-specific digivolve follow-up for a dedicated Execute context implementation; do not fake it as an unconditional digivolve on all attacks.

// Round 22ED optional Start-of-Turn processing guardrails:
// - Printed "By X, Y" Start-of-Turn clauses are optional processing conditions: trigger timing happens, but the player must choose ACTIVATE/SKIP before paying the cost.
// - For BT11-012 Shoutmon X3, START_OF_TURN must be optional/optionalProcessing with DELETE_OWN_DIGIMON_COST self:true then GAIN_MEMORY 1; the On Play reveal/search must stay only on ON_PLAY.
// - Confirmed optional structured effects must remain STRUCTURED_ACTION so their structured cost and actions resolve; do not convert them to System_Exec.
// - A Start-of-Turn optional window must pause Unsuspend/Draw/Breeding until the choice and all follow-up effects finish, preserving official phase order.

// Round 22EC legacy memory Tamer start/on-play split guardrails:
// - For classic memory Tamers such as BT3-093 Davis Motomiya, BT7-090 Kota Domoto, and BT1-087 T.K. Takaishi, keep [Start of Your Turn] as only the printed memory setter: MEMORY_COUNT <= 2 -> SET_MEMORY 3.
// - Do not copy [On Play] reveal/search/recovery actions into START_OF_TURN; those effects must fire only when the Tamer is actually played.
// - [Security] Play this card without paying the cost must use PLAY_FROM_SECURITY so the Tamer enters the battle area and then its ON_PLAY mechanic resolves normally.
// - Conditional security-search recovery such as T.K. Takaishi must recover only if the chosen/revealed security card is yellow; never encode the start-of-turn branch as RECOVERY_DECK.

// Round 22EB complete named official Token asset coverage guardrails:
// - The official Rule page exposes named Token assets for TOKEN, TOKEN-03, TOKEN-04, TOKEN-05, TOKEN-06, TOKEN-07, BT22-TOKEN, TOKEN-09, ST22-TOKEN01, TOKEN-11, TOKEN-12, TOKEN-13, ST22-TOKEN02, BT23-TOKEN, BT24-TOKEN, and TOKEN-17.
// - Keep every named official Token as a searchable cards.json token record with isToken/cardKind token and deterministic /img/<id>.jpg paths; these assets remain illegal in main decks and Digi-Egg decks.
// - fetch-cards.js must preserve OFFICIAL_TOKEN_CARD_PATCHES and OFFICIAL_TOKEN_IMAGE_PDF_SOURCES for token_02.pdf through token_17.pdf named Token PDFs, even when upstream card feeds omit older Token assets.
// - Runtime PLAY_TOKEN specs may still create temporary token instances from effect text, but the local asset/card pool must remain complete for search, preview, and image pulling.

// Round 22EA official Angel/Mastemon support color metadata guardrails:
// - ST10-04 Gatomon is officially Yellow/Purple, not Yellow-only; otherwise it cannot satisfy purple color references or normal digivolve color legality from purple bases.
// - BT11-094 Mirei Mikagura and EX6-074 Mirei Mikagura are officially Purple/Yellow Tamers, not Purple-only; otherwise yellow Option/color requirements and public color checks can be wrong.
// - Preserve these older-product official colors through fetch refreshes even though the default latest-category official sync does not touch ST10/BT11/EX6.
// - Add audit/meta guards so future card refreshes cannot collapse these Angel/Mastemon support cards back to one color.

// Round 22DJ official AD-01 color metadata guardrails:
// - Bandai official AD-01 cardlist publishes multi-color fields as whitespace-separated colors, e.g. AD1-004 Red/Black, AD1-019 Blue/Yellow, AD1-020 Blue/Red/Green, AD1-023 Black/Yellow/Purple, AD1-025 Red/White/Blue.
// - Do not collapse AD-01 multi-color cards to only their first color. `color` may remain the legacy first color, but `colors` must carry every official color.
// - Runtime color checks must split official whitespace color strings such as "Red Black" without splitting multi-word traits like "Royal Knight".
// - Fetch refreshes must preserve OFFICIAL_COLOR_METADATA_PATCHES so future card-pool refreshes do not regress AD-01 colors.

// Round 22DI official Token image guardrails:
// - Official Token cardlist records must keep deterministic /img/<TokenId>.jpg runtime image paths.
// - fetch-cards.js must expose --official-token-images-only / --token-images-only and the official Token PDF source map for TOKEN, BT22-TOKEN, BT23-TOKEN, BT24-TOKEN, ST22-TOKEN01, and ST22-TOKEN02.
// - The repair package should include cropped jpg files for those six Tokens because Bandai publishes official Token sheets as PDFs.
// - Deck legality remains unchanged: Token images/cards are searchable assets, not legal deck or Digi-Egg deck material.

// Round 22DH official Token cardlist guardrails:
// - Bandai official cardlist includes these Token records and they must remain in cards.json: TOKEN Diaboromon, BT22-TOKEN Familiar, BT23-TOKEN Atho, René & Por, BT24-TOKEN Petrification, ST22-TOKEN01 Pipe Fox, ST22-TOKEN02 Uka no Mitama.
// - Token records are searchable/card-pool records only; mark them isToken/cardKind token and never allow them in main decks or Digi-Egg decks.
// - fetch-cards.js refreshes must preserve OFFICIAL_TOKEN_CARD_PATCHES, and deck/server/report validators must reject Token card records while runtime PLAY_TOKEN specs may still create temporary Token instances.

// Round 22DE Discord dotenv guardrails:
// - server.js must load local .env before reading DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET, COOKIE_SECURE, or ALLOWED_ORIGINS.
// - Keep dotenv optional for stripped Codex/CI folders, but Discord health checks must expose whether dotenv was attempted/loaded.
// - Do not move Discord env reads above the dotenv load block; otherwise `.env` keys exist on disk but `/healthz` still reports discordConfigured:false and Discord login returns 503.

// Round 22DB BT25-083 Three Musketeers Option-source cost guardrails:
// - BT25-083 LadyDevimon's [When Digivolving]/[When Attacking] [Once Per Turn] says "By trashing 1 Option card from any of your Digimon's digivolution cards, you may use 1 [Three Musketeers] trait Option card from your trash with the cost reduced by 3."
// - Encode this as USE_OPTION_CARD from:"trash" with free:false, costReduction:3, target own Option trait [Three Musketeers], gated by action.cost.type TRASH_SOURCE amount 1 targeting own Option cards in any own Digimon source.
// - Never encode this clause as REDUCE_COST alone and never use TRASH_SECURITY_STACK; if the source Option trash cost cannot be paid, the Option-use payoff must not resolve.

// Round 22CR Glowing Dawn inherited End-of-Attack Tamer-source cost guardrails:
// - ST23-08 Monarchlizamon, ST23-04 Murasamemon, and BT25-041 Murasamemon lower/source text says "[End of Attack] [Once Per Turn] By trashing the bottom face-down card from under any of your Tamers, this [Glowing Dawn] trait Digimon unsuspends."
// - Encode this as trigger END_OF_ATTACK with isInherited:true and isOncePerTurn:true; never as END_OF_TURN and never as a top-level Monarchlizamon/Murasamemon body effect.
// - The Tamer under-card trash is the real structured cost. Use TRASH_BOTTOM_TAMER_SOURCE_COST (or equivalent atomic cost) targeting own Tamers and requiring the bottom card to be face-down; do not encode it as TRASH_BOTTOM_EVO on the source host or as a normal action before UNSUSPEND.
// - The unsuspend payoff targets the source host / this Digimon with target.self:true and must be gated to a host with the [Glowing Dawn] trait. If no bottom face-down Tamer under-card exists, the host must not unsuspend.

// Round 22CQ EX9-064 Megadramon inherited End-of-Attack unsuspend-cost guardrails:
// - EX9-064 Megadramon's lower/source text says "[End of Attack] [Once Per Turn] By unsuspending this Digimon, delete 1 of your Digimon with the lowest level."
// - Encode this as trigger END_OF_ATTACK with isInherited:true and isOncePerTurn:true; never as END_OF_TURN and never as a top-level Megadramon effect.
// - The "By unsuspending this Digimon" clause is a real structured cost paid by the source host/this Digimon. Use UNSUSPEND_THIS_DIGIMON_COST or an equivalent atomic cost; do not encode UNSUSPEND as a payoff action before deletion.
// - If this Digimon is not suspended or cannot unsuspend, the lowest-level deletion payoff must not resolve. The payoff targets 1 own Digimon with selection:"lowest_level" and may include the host because the text does not say "other."

// Round 22CP BT19-025 MetalGreymon inherited End-of-Attack Tamer-source play guardrails:
// - BT19-025 MetalGreymon's lower/source text says "[End of Attack] [Once Per Turn] You may play 1 level 4 or lower Digimon card with the [Blue Flare] trait from under any of your Tamers without paying the cost."
// - Encode this as trigger END_OF_ATTACK with isInherited:true and isOncePerTurn:true; never as END_OF_TURN and never as a top-level MetalGreymon effect.
// - The card must be played from source/under-card zone, specifically under one of your Tamers; use PLAY_FROM_SOURCE with sourceHostTarget/hostTarget owner:own cardType:tamer.
// - Do not broaden the source zone to hand/trash or generic own sources, and keep the played card restricted to own Digimon, maxLevel:4, trait [Blue Flare].

// Round 22CO BT17-067 DexDoruGreymon inherited End-of-Attack chosen-level guardrails:
// - BT17-067 DexDoruGreymon lower/source text says "[End of Attack] [Once Per Turn] You may choose 1 of your Digimon. Delete 1 of your chosen Digimon and 1 of your opponent's Digimon with a level equal to or lower than that Digimon."
// - Encode this as trigger END_OF_ATTACK with isInherited:true and isOncePerTurn:true; never as END_OF_TURN and never as a top-level DexDoruGreymon effect.
// - The chosen own Digimon deletion must bind the opponent target cap to that exact deleted card's level; use DELETE_OWN_DIGIMON_COST with allowSource:true and a follow-up DELETE_DIGIMON target.maxLevel:"deleted_cost_level" or equivalent same-effect context binding.
// - Do not treat the opponent deletion as a fixed maxLevel, stale global deleted level, or unrelated board-state level check; failed/absent own deletion means no opponent deletion.

// Round 22CN BT17/EX6 Antylamon inherited End-of-Attack other-suspended cost guardrails:
// - BT17-049 Antylamon lower/source text says "[End of Attack] [Once Per Turn] By deleting 1 of your other suspended Digimon, you may play 1 level 3 Digimon card with the [Beast] trait from your trash without paying the cost."
// - EX6-034 Antylamon lower/source text says "[End of Attack] [Once Per Turn] By returning 1 of your other suspended Digimon to the hand, you may play 1 level 3 card with the [Beast] trait from your hand without paying the cost."
// - Encode both as trigger END_OF_ATTACK with isInherited:true and isOncePerTurn:true; never as END_OF_TURN and never as top-level Antylamon mechanics.
// - The "By deleting/returning 1 of your other suspended Digimon" clause is the structured cost/payment. Use DELETE_OWN_DIGIMON_COST or RETURN_TO_HAND_COST with target.isSuspended:true; do not encode it as a normal DELETE_DIGIMON/BOUNCE action.
// - "Other" must exclude the source host / this Digimon. Keep runtime/source-card cost exclusion intact so the attacking host cannot pay by deleting/returning itself.
// - The payoff is PLAY_FROM_TRASH or PLAY_FROM_HAND for exactly 1 own level 3 [Beast] trait Digimon card, and only resolves after the cost succeeds.

// Round 22CM EX4 Alliance inherited End-of-Attack “another suspended Digimon” guardrails:
// - EX4-025 Turuiemon and EX4-029 Antylamon lower/source text says “[End of Attack] [Once Per Turn] If you have another suspended Digimon, 1 of your opponent's Digimon gets -2000 DP for the turn.”
// - EX4-054 Wendigomon and EX4-057 Antylamon lower/source text says “[End of Attack] [Once Per Turn] If you have another suspended Digimon, return 1 green Digimon card from your trash to your hand.”
// - Encode these as trigger END_OF_ATTACK with isInherited:true and isOncePerTurn:true; never as END_OF_TURN, never as MAIN, and never as a top-level Digimon effect.
// - “Another suspended Digimon” must not count the source host / this Digimon; use IS_SUSPENDED with excludeSelf:true (or equivalent otherThanSource binding), not HAS_TAMER/HAS_TRAIT or a generic suspended-card placeholder.
// - EX4-029 also has a top-level “[End of Attack] If you have 3 or fewer security cards, Recovery +1 (Deck)” and that Recovery timing must be END_OF_ATTACK, not END_OF_TURN.

// Round 22CL BT16-071 MadLeomon inherited End-of-Attack self-delete guardrails:
// - BT16-071 MadLeomon's lower/source text says "[End of Attack] By deleting this Digimon, you may play 1 level 4 or lower Digimon card from your trash without paying the cost."
// - Encode this as trigger END_OF_ATTACK with isInherited:true; never as END_OF_TURN and never as a top-level MadLeomon effect.
// - "By deleting this Digimon" is the cost/payment and must be cost.type DELETE_OWN_DIGIMON_COST with self:true so it deletes the source host / this Digimon, not any arbitrary own Digimon.
// - The payoff is PLAY_FROM_TRASH targeting exactly 1 own Digimon card with maxLevel:4; it must only resolve after the self-delete cost succeeds.

// Round 22CK ST22-04 Taomon inherited End-of-Attack security-cost guardrails:
// - ST22-04 Taomon's lower/source text says "[End of Attack] [Once Per Turn] By trashing your top security card, 1 of your Digimon with [Sakuyamon] in its name unsuspends."
// - Encode this as trigger END_OF_ATTACK with isInherited:true and isOncePerTurn:true; never as END_OF_TURN and never as a top-level Taomon effect.
// - The top-security trash is the cost/payment (mechanic.cost.type TRASH_SECURITY_STACK amount 1 position top). If the cost cannot be paid, the Sakuyamon-name Digimon must not unsuspend.
// - The payoff targets exactly 1 own Digimon with nameContains:"Sakuyamon"; do not accidentally force target.self:true because the English text says 1 of your Digimon.

// Round 22CJ Alphamon-name inherited End-of-Attack source-effect guardrails:
// - BT9-064 Grademon's inherited text says "[End of Attack] If this Digimon has [Alphamon] in its name, delete 1 of your opponent's Digimon with a play cost 5 or less" and must be trigger END_OF_ATTACK with isInherited:true.
// - BT8-069 Ouryumon's inherited text says "[End of Attack] [Once Per Turn] If this Digimon has [Alphamon] in its name, unsuspend it" and must be trigger END_OF_ATTACK with isInherited:true and isOncePerTurn:true.
// - The Alphamon-name condition must bind to the source host / this Digimon (for example SELF_NAME_CONTAINS or scope:self), not to any board-wide Alphamon.
// - The payoff must not be encoded as END_OF_TURN or as a top-level effect on Grademon/Ouryumon; Ouryumon must unsuspend the host with target.self:true.

// Round 22CI BT1-081 HerculesKabuterimon End-of-Attack twice-per-turn guardrails:
// - BT1-081 prints "[End of Attack][Twice Per Turn] You can decrease your memory by 3 to unsuspend this Digimon" and must be trigger END_OF_ATTACK, not END_OF_TURN.
// - This is a self-unsuspend payoff gated by PAY_MEMORY amount 3; if the cost cannot be paid, the Digimon must not unsuspend.
// - Because the card is [Twice Per Turn], encode perTurnLimit:2 and do not use isOncePerTurn:true or an unlimited trigger.
// - Target the source Digimon with target.self:true; never target all same-name HerculesKabuterimon cards.

// Round 22CH remaining simple inherited End-of-Attack gain-memory guardrails:
// - Source/lower text saying "[End of Attack] [Once Per Turn] Gain 1 memory" must be trigger END_OF_ATTACK with isInherited:true, not END_OF_TURN and not a top-level mechanic.
// - BT15-071 Loogamon and BT15-075 Loogarmon also require condition.owner:"opponent" for "If your opponent has 1 or more memory"; own positive memory must not satisfy the gate.
// - BT19-017 Sangomon, BT19-019 Shellmon, BT21-031 Sangomon, and EX11-013 Sangomon are inherited/source effects only and must not trigger when the card itself is the active top Digimon.

// Round 22CG EX4-036 BlackRapidmon End-of-Attack De-Digivolve guardrails:
// - EX4-036 BlackRapidmon's upper text says "[End of Attack] <De-Digivolve 1> 1 of your opponent's Digimon" and must be encoded as trigger END_OF_ATTACK, not END_OF_TURN or omitted mechanics.
// - The action must be DE_DIGIVOLVE amount 1 targeting exactly 1 opponent Digimon; do not encode De-Digivolve reminder text as TRASH_SECURITY_STACK or DELETE.
// - This is BlackRapidmon's own upper-text effect, so isInherited must be false; inherited/source text on the card should not be merged into this mechanic.

// Round 22CF Pulsemon-line inherited End-of-Attack guardrails:
// - Source/inherited text saying "[End of Attack] [Once Per Turn] If this Digimon has [Pulsemon] in its text, by trashing the top card of your security stack, unsuspend this Digimon" must be trigger END_OF_ATTACK with isInherited:true.
// - The top-security trash must be mechanic.cost.type TRASH_SECURITY_STACK amount 1 position top; the unsuspend payoff must not happen if that cost cannot be paid.
// - The Pulsemon-text condition must scope to this/source host Digimon (scope:self), and the UNSUSPEND target must use self:true so it unsuspends the host, not any same-name or arbitrary own Digimon.
// - Never encode these source effects as END_OF_TURN or non-inherited top-level mechanics.

// Round 22CE inherited End-of-Attack source-effect guardrails:
// - Source/inherited text that prints [End of Attack] must use trigger END_OF_ATTACK with isInherited:true, never END_OF_TURN on the top-level card.
// - Raptordramon-style inherited checks such as "If this Digimon has [Alphamon] in its name" must scope to the source host (scope:self), not a board-wide HAS_SPECIFIC_CARD scan.
// - Thetismon/Soloogarmon-style inherited unsuspend effects must target the source host with self:true and keep their printed cost/condition gates.
// - Opponent-memory clauses such as Soloogarmon must set condition.owner:"opponent" so own memory does not satisfy the gate.

// Round 22CD self-leave End-of-Attack guardrails:
// - Printed [End of Attack] self-leave effects must use trigger END_OF_ATTACK, never END_OF_TURN.
// - EX1-062 SkullGreymon's printed Security A.+1 is keyword text; do not encode it as fake ON_PLAY/SET_MEMORY. Its End of Attack self-delete must target self:true.
// - RB1-029 GulusGammamon's “By deleting this Digimon” is a DELETE_OWN_DIGIMON_COST at END_OF_ATTACK; the follow-up DELETE_DIGIMON maxDp must bind to deleted_cost_dp from the actual cost card.
// - LM-007 Publimon places this Digimon on top of security at END_OF_ATTACK using SEND_TO_SECURITY target.self:true.
// - EX2-028 Parasitemon places this Digimon under 1 other own Digimon at END_OF_ATTACK using PLACE_SOURCE from battle_area, target.self:true, and attachToTarget.excludeSelf:true.

// Round 22CC simple End-of-Attack timing guardrails:
// - Printed [End of Attack] [Once Per Turn] Gain 1 memory / Draw 1 effects must use trigger END_OF_ATTACK, not END_OF_TURN.
// - BT21-031 Sangomon, EX11-013 Sangomon, BT19-019 Shellmon, and BT20-050 HoverEspimon previously had their End-of-Attack payoff misencoded as end-of-turn; do not regress them.
// - End-of-Attack effects should only fire after an attack finishes, never during the normal end phase without an attack.

// Round 22CB TeslaJellymon End-of-Attack guardrails:
// - BT9-025 TeslaJellymon's [End of Attack] [Once Per Turn] "You may trash 2 cards in your hand to unsuspend this Digimon" must not be left as empty mechanics or printed-keyword text only.
// - Encode it as trigger END_OF_ATTACK, isOncePerTurn:true, cost.type TRASH_HAND amount 2, then action UNSUSPEND targeting self.
// - The unsuspend payoff must be gated by the actual hand-trash cost; if 2 cards are not trashed from hand, TeslaJellymon must remain suspended.
// Round 22CA LM Amphimon under-card trash guardrails:
// - LM-005 Amphimon's [On Play]/[When Digivolving] "You may trash up to 4 blue cards in your hand. For each one, trash any 1 card under your opponent's Digimon or Tamers" must bind TRASH_SOURCE amount to the actual blue cards trashed by this effect.
// - Encode the up-to-4 blue hand trash as TRASH_HAND upTo cost with color Blue, then use amount.source:"TRASHED_BY_THIS_EFFECT" for TRASH_SOURCE.
// - Its follow-up returns 1 opponent Digimon or Tamer with no cards under it to hand; do not restrict this to only Digimon and do not send it to deck bottom.
// - Its [When Attacking] Security A.+1 requires returning exactly 3 cards with [Jellymon] in their texts from trash to deck bottom as a RETURN_TO_DECK cost.
// Round 22BZ RB1 Amphimon under-card trash guardrails:
// - RB1-016 Amphimon's [When Digivolving]/[When Attacking] "You may trash up to 2 blue cards in your hand. For each one, trash any 1 card under your opponent's Digimon or Tamers" must bind TRASH_SOURCE amount to the actual blue cards trashed by this effect.
// - Encode the up-to-2 blue hand trash as a TRASH_HAND upTo cost or equivalent context-recording payment, then use amount.source:"TRASHED_BY_THIS_EFFECT" for TRASH_SOURCE.
// - The under-card trash host selector must allow opponent Digimon or Tamers with sources; do not use generic cardType:"card" or a fixed amount:2 that can over-trash when fewer blue cards were paid.
// - RB1-016's deletion-prevention cost returns cards with [Jellymon] in their texts from trash; use textContains:"Jellymon", not nameContains.

// Round 22BY remaining dynamic level-maximum guardrails:
// - Printed clauses like Arresterdramon: Superior Mode's “For each Tamer you have in play with a different color” are dynamic target-selection caps: encode maxLevelBase plus bonusPerOwnTamerTotalColor.
// - Printed clauses like ST21 MetalGarurumon's “For every 2 colors your Tamers have” are grouped dynamic caps: encode maxLevelBase plus bonusPerOwnTamerColorGroup:2 and bonusLevelAmount:1.
// - Printed clauses like EX9 Devimon's “For every 2 of this Digimon's face-down digivolution cards” are source-host dynamic caps: encode maxLevelBase plus bonusPerFaceDownSourceGroup:2.
// - Do not approximate these bonuses with DP_MOD, REDUCE_COST, fixed maxLevel, or a fake buff action after the main effect.

// Round 22BX dynamic level-maximum guardrails:
// - Printed clauses such as "For each of your other Digimon, add 1 to this effect's level maximum" are target-selection caps, not DP_MOD/REDUCE_COST buffs.
// - Encode these as maxLevelBase plus explicit bonus metadata, e.g. bonusPerOtherOwnDigimon or bonusIfOwnTamerTotalColorsAtLeast, and let runtime compute the legal target cap.
// - Do not leave AncientMermaimon / WereGarurumon-style effects as fixed maxLevel:4 when their printed text can legally reach Lv.5+.

// Round 22BW dynamic total play-cost source bonus guardrails:
// - Printed clauses like P-094 Destromon’s “Delete your opponent's Digimon and Tamers with a total play cost of 3. For every [Vemmon] in this Digimon's digivolution cards, increase the maximum play cost you can choose by this effect by 1” require a dynamic total-play-cost limit.
// - Preserve target.totalPlayCostBase:3 plus target.bonusPerSourceName:"Vemmon" (or equivalent source-trait metadata) instead of flattening the cap to a fixed totalPlayCost.
// - Runtime must compute the target-choice limit from this effect's source host stack at resolution time: base + matching source count × increment.
// - Do not approximate this with per-card maxCost, fixed totalPlayCost, count, or a stale board-wide Vemmon count.

// Round 22BV DP_CHECK owner/target scope guardrails:
// - DP_CHECK conditions for clauses like "your opponent has a Digimon with 10000 DP or more" must respect condition.owner, condition.target.owner, color/trait/cardType filters, and legacy trait strings such as "opponent's Digimon".
// - Do not let an own high-DP Digimon satisfy an opponent-DP gate. Do not ignore condition.target filters on DP_CHECK action conditions.
// - For self checks such as "this Digimon has 12000 DP or more", preserve scope:"self" / scope:"source" so the runtime compares the source/host only.

// Round 22BU AeroVeedramon Zero cost/trash guardrails:
// - P-047 AeroVeedramon Zero's [When Digivolving] must include the mandatory "Trash the top 3 cards of your deck" before its Tamer-gated self +3000 DP payoff.
// - Its inherited [When Attacking] text "By returning 3 non Digi-Egg cards from your trash to the bottom of your deck" is a RETURN_TO_DECK cost, not omitted reminder text.
// - The inherited cost must exclude Digi-Egg cards with a real non-Digi-Egg filter, and the +2000 DP payoff should target this Digimon only after the cost is paid.

// Round 22BT not-deleted follow-up guardrails:
// - Printed clauses like “If this effect didn't delete”, “If no Digimon was deleted by this effect”, or “If an opponent's Digimon wasn't deleted by this effect” must bind to same-effect deletion results using NOT_DELETED_BY_THIS_EFFECT / NOT_DELETED_OPPONENT_BY_THIS_EFFECT.
// - Never approximate failed-delete branches with DP_CHECK, MEMORY_COUNT, source DP, or board-state placeholders. The branch checks whether the current DELETE_DIGIMON action actually deleted something.
// - Do not replace deletion with fake DP_MOD -999999. Highest/lowest DP or level deletion effects must use DELETE_DIGIMON with selection metadata, then gate follow-ups on NOT_DELETED_BY_THIS_EFFECT.
// - If the printed failed-delete branch trashes the opponent's deck, use TRASH_DECK_TOP, not TRASH_SECURITY_STACK. If it says opponent hand, use TRASH_HAND target.owner:"opponent".
// - Same-target failed-delete branches such as “suspend 1... that Digimon doesn't unsuspend” must use sameAsPreviousTarget on the CANT_UNSUSPEND follow-up.

// Round 22BS same-level-as-deleted hand-cost guardrails:
// - Clauses like Fake Agumon Expert's “When an opponent's Digimon is deleted, by trashing 1 card from your hand with the same level as the deleted Digimon, Draw 2” must bind the hand-trash cost to the deleted Digimon from the current trigger context.
// - Do not encode “opponent's Digimon is deleted” as HAS_TRAIT or leave “same level as the deleted Digimon” as a free-form position string.
// - The mechanic should trigger on OPPONENT_DIGIMON_DELETED, be gated by TURN_PLAYER owner:own, use cost.type TRASH_HAND with sameLevelAsDeletedCard:true, and draw only after the cost is successfully paid.
// - Runtime must reject Options/no-level cards and mismatched-level Digimon cards in hand for this cost.

// Round 22BR PLAY_FROM_SOURCE host/source selector guardrails:
// - Clauses like EX3-026 Aegisdramon's “play 1 blue level 3 Digimon card or 1 Digimon card with [Seadramon] in its name or [Aqua]/[Sea Animal] in its traits from 1 of your blue Digimon's digivolution cards” require two selectors.
// - The playable source card must be encoded as blue Lv.3 OR Seadramon-name OR Aqua/Sea Animal-trait Digimon; never leave PLAY_FROM_SOURCE as target:{cardType:"digimon",count:1}.
// - The source host must carry sourceHostTarget:{cardType:"digimon",color:"Blue"}; sourceHostSelf:true is only for “this Digimon's digivolution cards,” not “1 of your blue Digimon's”.
// - Runtime/audit must prevent illegal source cards from non-blue hosts or generic non-Aqua/non-Seadramon sources from being offered in the PLAY_FROM_SOURCE choice window.

// Round 22BQ placed-card level cost-binding guardrails:
// - Clauses like “By placing 1 Digimon card from this Digimon's digivolution cards as your bottom security card, delete all opponent Digimon with the same level as the placed card” are PLACE_SOURCE_TO_SECURITY costs, not TRASH_BOTTOM_EVO or normal PLACE_SOURCE actions.
// - Same-level-as-placed-card payoffs must bind to the card placed by the current cost via selection:"same_level_as_placed_cost" and count:"all" when the printed text says all.
// - EX6-066 Sea of Destruction must place an [Aqua]/[Sea Animal] Digimon from hand under 1 blue Digimon as a PLACE_SOURCE cost, then bounce all opponent Digimon matching that placed card's level.
// - BT18-042 MagnaGarurumon has both WHEN_DIGIVOLVING and END_OF_OPPONENTS_TURN timings sharing the same once-per-turn source-to-security same-level effect.

// Round 22BP self-source color static condition guardrails:
// - Static clauses like “While this Digimon's digivolution cards include a Digimon card with [Hybrid] or a red/blue Tamer card” must enforce the printed source color and card type.
// - Do not let any-color Tamer sources satisfy red/blue Tamer alternatives; regex word-boundaries in JS RegExp strings must be escaped as \\b.
// - Aldamon requires a [Hybrid] Digimon source or a red Tamer source for +4000 DP; Beowolfmon requires a [Hybrid] Digimon source or a blue Tamer source for can't-be-attacked.

// Round 22BO same-level source-return payoff guardrails:
// - Printed clauses like MagnaGarurumon’s “You may return 1 card with the [Hybrid] trait from this Digimon's digivolution cards to your hand to return 1 opponent Digimon with the same level as the returned card” are RETURN_SOURCE_TO_HAND costs.
// - The returned source filter must preserve trait:"Hybrid" and sourceHostSelf:true; do not encode the source return as a normal first action.
// - BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE may only appear when the same mechanic has a RETURN_SOURCE_TO_HAND cost, so failed payment cannot use a stale returned-source level.
// - Runtime must bind the payoff to the source returned by the current cost/effect, not counterTiming state left over from an earlier effect.

// Round 22BM security-to-hand cost guardrails:
// - Printed clauses such as “By adding your top security card to the hand” and “By adding the top or bottom card of your security stack to the hand” are ADD_SECURITY_TO_HAND costs, not REVEAL_AND_SELECT or ADD_TO_HAND actions.
// - If the required security card cannot be added to hand, the follow-up DP_MOD / PLACE_SECURITY_FROM_HAND / UNSUSPEND payoff must not resolve.
// - For “top or bottom” security costs, preserve position:"top_or_bottom" metadata; do not approximate it as reveal/searching security.
// - Payoffs that place a Digimon card from hand into security should use PLACE_SECURITY_FROM_HAND with position:"bottom", not SEND_TO_SECURITY targeting battle area cards.

// Round 22BL source-return-to-hand cost guardrails:
// - Printed clauses such as “By returning 1 card from this Digimon's digivolution cards to its owner's hand, [effect]” are RETURN_SOURCE_TO_HAND costs, not normal RETURN_TO_DECK/BOUNCE actions.
// - If the required source card cannot be returned, the payoff must not resolve. Do not leave RETURN_SOURCE_TO_HAND or RETURN_TO_DECK as a normal first action before DELETE/GRANT_KEYWORD/UNSUSPEND.
// - Bind the cost to this Digimon/source host with sourceHostSelf:true and preserve printed filters such as level:6, nameContains:"Justimon", and exceptName.
// - Omnimon Zwart's payoff deletes 1 opponent unsuspended Digimon with play cost 12 or less; never approximate it as BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE.

// Round 22BJ source-placement cost atomicity guardrails:
// - Printed clauses such as “By placing 1 card ... as this Digimon's bottom/top digivolution card, [effect]” are PLACE_SOURCE costs, not normal PLACE_SOURCE actions.
// - If the required card cannot be placed, the follow-up effect must not resolve. Do not leave PLACE_SOURCE as the first action before DE_DIGIVOLVE/DELETE/DRAW/RECOVERY/DP_MOD.
// - Preserve the printed source zone (hand/trash/hand_or_trash), attachment position (bottom/top), and default host binding to this Digimon unless the text names another host.
// - For source-placement costs that grant a buff to “this Digimon,” keep the payoff as a separate self-targeted action after the cost is paid.
// Round 22BI Lui Ohwada / fixed breeding play-cost guardrails:
// - BT16-090 Lui Ohwada's [Main] cost is composite: delete 1 of your [Ukkomon] AND trash 1 of your Digimon in the breeding area. Encode this as COMPOSITE/AND cost, not as a single delete or normal action.
// - The breeding-area trash leg is TRASH_BREEDING_DIGIMON_COST. It trashes the breeding-area stack and does not count as deleting that Digimon.
// - The follow-up plays [BigUkkomon] from hand to an empty breeding area for a fixed play cost of 3. Use playCostOverride:3, destination:"breedingArea", requireEmptyBreeding:true, free:false.
// - Do not approximate “for a play cost of 3” as REDUCE_COST 3; BigUkkomon's printed play cost is not simply reduced by 3.

// Round 22BH battle-area Option cost guardrails:
// - Printed clauses such as “By trashing 1 Option card in the battle area” are costs, not normal actions; encode them as mechanic.cost or action.cost with type TRASH_OPTION_IN_BATTLE_AREA.
// - If that cost cannot be paid, the follow-up effect must not resolve. Do not approximate it as TRASH_SECURITY_STACK position:battle_area or TRASH_REVEALED_REST.
// - TRASH_OPTION_IN_BATTLE_AREA must use target-filtered battle-area Option candidates, preserving owner/name/trait filters and Delay self-card names.
// - A DUAL card that is already stacked on the field through Arts Digivolve is a Digimon and must not be consumed as an Option card for this cost/action.

// Round 22BG owner-any condition guardrails:
// - condition.owner:"any" is an aggregate/both-players scope, not a synonym for the resolving player.
// - HAS_DIGIMON/HAS_TAMER/IS_SUSPENDED style conditions with owner:"any" must scan both players' public areas and compare the combined count.
// - SECURITY_COUNT with owner:"any" represents the total cards in both players' security stacks, such as Kentaurosmon's printed total-security clause.
// - Do not encode total/any-player clauses as owner:"own" or owner:"opponent" unless the printed text explicitly says your/opponent's side only.

// Round 22BD Option ignore-color guardrails:
// - Printed pre-[Main] clauses such as “While you have X, you can ignore this card's color requirements” are Option-use legality bypasses only.
// - Do not encode those clauses as condition on the [Main] mechanic; canUseOptionCard()/option color requirement helpers handle whether the Option may be used.
// - The [Main] effect must still resolve if the player satisfies the normal printed color requirement even when the ignore-color clause is false.
// - Real “If ...” clauses inside the [Main] effect may remain action/effect conditions, but they must be separate from the pre-[Main] ignore-color sentence.

// Round 22BC attack timing simultaneous-priority guardrails:
// - Treat attack declaration timing as one simultaneous trigger window: opponent-attack listeners, Raid/Alliance/Collision timing, granted attack triggers, and [When Attacking] effects must be collected before anything resolves.
// - The turn player's attack-timing effects must resolve before the non-turn player's opponent-attack listener can open a target/choice window.
// - Normal declared attacks and effect-created attacks must both use withTriggerBatch(..., {resolve:false}) around attack-timing producers, then queue shift_to_counter and resume resolveEffect.
// - Do not let OPPONENT_ATTACKED DELETE/BOUNCE/END_ATTACK effects pause the game while a turn-player WHEN_ATTACKING effect from the same timing is still queued.
// Round 22BB field/breeding Overflow guardrails:
// - Follow official rule revision: the field includes both battle area and breeding area.
// - ACE <Overflow> must trigger when an ACE card moves from breeding area/field to a non-field/non-under-card area such as trash, hand, deck, or security.
// - ACE <Overflow> must not trigger when a card moves within the field/under-card family, such as breeding area -> battle area, battle area -> breeding area, or battle area -> source under another card.
// - isOverflowMovement/processOverflow must recognize breedingArea/raisingArea in the same field-family list as battleArea and source/under-card zones.
// Round 22BA Token ownership/controller guardrails:
// - Follow official Token Q&A such as EX11-012 Medusamon: if an effect plays the activating player's Token as an opponent's Digimon, the Token enters the opponent's battle area but still belongs to the activating player's token pile.
// - PLAY_TOKEN must track tokenOwnerId/ownerPlayerId separately from tokenControllerId/controllerId. On Play/On Deletion and "your Digimon" text use the controller whose battle area the Token is in; return/outside-game cleanup uses tokenOwnerId.
// - When a Token leaves any zone, remove the token instance from both players' visible zones/source stacks and return it only to tokenOwnerId.removedFromGame.
// - Play-by-effect locks are checked from the player whose effect is playing the Token, not from the battle-area controller the Token will enter; a lock on the opponent's play-by-effect actions must not stop your effect from playing your Token as an opponent's Digimon.
// Round 22AZ DUAL Arts Digivolve guardrails:
// - Follow official CRM 4.0 DUAL rules: when a DUAL card is used as an Option, resolve its lower Option-side [Main] effect first, then choose whether to perform Arts Digivolve instead of trashing it.
// - Manual DUAL Option use must pay the lower Option-side cost (dualOptionCost), not the missing Digimon-side play cost.
// - Never encode Arts Digivolve as generic PLAY_FROM_HAND/PLAY_FROM_TRASH or normal DUAL play. The card is stacked only through the Arts Digivolve procedure.
// - If Arts Digivolve is performed, place the used DUAL card on top of a legal field card, preserve the stack instance, perform the digivolution bonus draw 1, run rule check, then trigger [When Digivolving] simultaneously with any other triggers from that processing.
// - If Arts Digivolve is skipped or impossible, trash the DUAL card as a normal Option after the [Main] effect resolves. Directly activating a DUAL Option-side [Main] effect by another effect is not the same as using it as an Option and must not open Arts Digivolve.
// Round 22AY official Token rule guardrails:
// - Follow the official Basic Rules of Token Cards dated 2026-05-08. Tokens are played from outside the game and return outside the game instead of entering hand/deck/security/trash/source zones.
// - If a Token is deleted, its [On Deletion] effects are still pending as though from trash, and the deletion still counts for “when one of your Digimon is deleted” listeners. The Token card itself returns outside the game.
// - Effects or costs that return a Token to hand may choose the Token and satisfy “returned by this effect/cost”, but the Token card must not be added to hand and must not trigger “card added to hand” listeners.
// - Effects that place a Token as a digivolution card/source may choose the Token, but it must return outside the game instead of becoming an actual source. Never encode Tokens as normal deck/hand/trash cards.
// Round 22AX <Save> guardrails:
// - Printed <Save> is not deletion prevention. Never encode it as PREVENT_LEAVE_PLAY, STUN, or a broad PLACE_SOURCE target.
// - Use SAVE_SELF_TO_TAMER on the card's [On Deletion] mechanic. It places the deleted card itself under one of your Tamers and the card is still considered deleted.
// - If the text says "Then, place 1 Digimon card with <Save> in its text...", keep that as a separate PLACE_SOURCE action; do not confuse it with the <Save> self-placement.
// - Former digivolution cards of a saved Digimon still leave the stack normally; <Save> moves only the deleted card itself under the Tamer.
// Round 22AW source-effect copy guardrails:
// - Printed “This Digimon gains all effects of cards in this Digimon's digivolution cards” is not a keyword and must never be emitted as GRANT_KEYWORD.
// - Use COPY_SOURCE_EFFECTS with precise sourceTarget metadata such as nameContains:Gammamon, trait:Flame, nameAny:[Machinedramon,Chaosdramon], or level/trait filters.
// - “all [Main] effects” should copy only MAIN mechanics; “all [All Turns] effects” should copy only ALL_TURNS mechanics; plain “all effects” may copy all non-inherited source-card mechanics.
// - Copied effects bind “this Digimon” to the host stack, not to the source card under it; inherited/source effects should not double-trigger.
// Round 22AV PREVENT_LEAVE_PLAY printed-keyword/name-digivolve guardrails:
// - Printed keywords/reminders such as <Piercing>, <Blocker>, <Security A. +1>, <Raid>, or <Retaliation> must never emit PREVENT_LEAVE_PLAY; keyword runtime handles them.
// - Printed “players can’t ignore digivolution requirements” must use CANT_IGNORE_DIGIVOLUTION_REQUIREMENTS, not PREVENT_LEAVE_PLAY or CANT_DIGIVOLVE.
// - Printed “This Digimon can only digivolve into [Name] / cards with [Name] in their name” must use CANT_DIGIVOLVE with allowedName/allowedNameContains metadata. It must not prevent the Digimon from leaving play.
// - Printed “When this card is trashed from the security stack, activate its [Security] effects” should use SECURITY_REMOVED plus SECURITY_REMOVED_BY_EFFECT, not WHEN_MOVING or PREVENT_LEAVE_PLAY.
// Round 22AU breeding/battle movement guardrails:
// - Never encode printed breeding-area movement or hatch clauses as generic MOVE; MOVE remains a manual placeholder and does not execute gameplay.
// - Printed "move from breeding area to battle area" or "this Digimon may move" while in breeding must use MOVE_BREEDING_TO_BATTLE and must trigger [When Moving] after the card reaches battle area.
// - Printed "move to the empty space in your breeding area" must use MOVE_BATTLE_TO_BREEDING with requireEmptyBreeding:true, preserving the stack and not treating the card as newly played.
// - Printed "hatch 1 Digi-Egg card to an empty space in your breeding area" must use HATCH_TO_BREEDING/HATCH_EGG_TO_BREEDING, not REVEAL_AND_SELECT or MOVE.
// - Printed "hatch ... or move ..." choices such as Mimi Tachikawa must use MODAL_CHOICE so only one branch resolves.
// Round 22AT digivolve-only-color guardrails:
// - Printed text like “This Digimon can only digivolve into white Digimon” is a digivolution legality restriction, not PREVENT_LEAVE_PLAY.
// - Encode it as CANT_DIGIVOLVE on this Digimon with allowedColor/evolveToColorOnly set to the printed color, so matching colors remain legal and other colors are blocked.
// - Do not use color-targeted PREVENT_LEAVE_PLAY, STUN, WARP_EVOLVE, or broad CANT_DIGIVOLVE without allowed-color metadata for this wording.
// Round 22AS PREVENT_LEAVE_PLAY semantic guardrails:
// - PREVENT_LEAVE_PLAY is only for real leave-play replacement/prevention such as Barrier/Partition/Decode-style would-leave effects; never use it for generic locks.
// - Printed “can’t/cannot be unsuspended” must use CANT_UNSUSPEND and must be enforced during the unsuspend phase, Reboot, and UNSUSPEND effects.
// - Printed “attack target can’t be switched/changed” must use CANT_CHANGE_ATTACK_TARGET or CANT_SWITCH_ATTACK_TARGET, never PREVENT_LEAVE_PLAY.
// - Printed “cannot be deleted in battle” must use CANT_BE_DELETED with byBattle:true; opponent-effect deletion protection should use CANT_BE_DELETED with byEffect/opponentEffectsOnly.
// - Printed checked-security suppression must use CANT_ACTIVATE_EFFECT with securityCheckScope/affectsSecurityCardTypes metadata; On Play activation locks must use CANT_ACTIVATE_EFFECT timing ON_PLAY.
// - Printed DP-reduction immunity plus hand/deck return protection should be split into DP_REDUCTION_IMMUNITY and CANT_BE_RETURNED.
// Round 22AR fake GRANT_KEYWORD semantic guardrails:
// - Never encode non-keyword rule text as GRANT_KEYWORD. Text like WHEN_SUSPENDED, WHEN_DIGIVOLVING, De-Digivolve 1/2, WARP_EVOLVE, STUN, or “cannot be deleted in battle” must become the exact rule-layer action.
// - Granted “when this Digimon becomes suspended, lose memory” text must use GRANT_TRIGGER_EFFECT with trigger DIGIMON_SUSPENDED and LOSE_MEMORY.
// - Printed “activate the [When Digivolving] effects of the Digimon this effect played” must use ACTIVATE_TRIGGER_EFFECT with target.playedByThisEffect, not a fake WHEN_DIGIVOLVING keyword.
// - Printed De-Digivolve text must use DE_DIGIVOLVE; battle-only deletion immunity must use CANT_BE_DELETED with byBattle:true; cannot-suspend text must use CANT_SUSPEND.
// - If a card plays from hand or this Digimon’s digivolution cards, use PLAY_FROM_HAND_OR_SOURCE with sourceHostSelf:true instead of broad hand/trash/source zones.
// Round 22AQ effect-created attack guardrails:
// - Printed clauses such as “1 of your Digimon may attack”, “that Digimon attacks”, “may attack a player”, “may attack an opponent's Digimon”, or <Execute> are real attack requests and must never be encoded as MOVE.
// - Use REQUEST_ATTACK for unrestricted effect-created attack choices, REQUEST_ATTACK_PLAYER for player-only attacks, and REQUEST_ATTACK_DIGIMON for opponent-Digimon-only attacks.
// - Follow-up “that Digimon attacks” after a buff should use target.sameAsPreviousTarget so the exact chosen Digimon attacks.
// - <Execute> should request an optional attack with allowUnsuspendedDigimonTarget:true and attach/schedule the printed End-of-Attack self-delete; do not delete immediately after the attack request.
// - Printed attack-target switching remains CHANGE_ATTACK_TARGET, not MOVE.
// Round 22AP STUN cleanup guardrails:
// - Never encode official restriction text with generic STUN. Split it into the exact rule layer: CANT_ATTACK, CANT_ATTACK_PLAYER, CANT_DIGIVOLVE, CANT_SUSPEND, CANT_UNSUSPEND, CANT_BE_DELETED, etc.
// - “None of ... can attack” = CANT_ATTACK; “can’t attack players” = CANT_ATTACK_PLAYER; “can’t suspend/unsuspend” = CANT_SUSPEND/CANT_UNSUSPEND; “can’t digivolve” = CANT_DIGIVOLVE.
// - Delay Options placed in the battle area should use PLACE_IN_DELAY_AREA plus a DELAY trigger, not PLACE_SOURCE or fake STUN on an attacking Digimon.
// - Exact filters such as Lv.3, play cost 5 or less, 0 DP, non-white, no sources, and all-except-highest-play-cost must be preserved in target/condition metadata.
// Round 22AO attack-target-change guardrails:
// - Printed clauses such as “change the attack target”, “switch the target of attack”, or “switch the attack target” are real attack-flow redirections and must be encoded as CHANGE_ATTACK_TARGET, never MOVE.
// - “to this Digimon” should use target:{owner:"own", cardType:"digimon", self:true}; “to 1 of your suspended Digimon” should include isSuspended:true and the printed trait/name filters.
// - Clauses that allow redirecting “to this Digimon or the player” or “another Digimon or the player” should use CHANGE_ATTACK_TARGET with allowPlayerTarget:true.
// - Printed <Raid> reminder text should not emit MOVE/CHANGE_ATTACK_TARGET mechanics; Raid is handled by keyword runtime during attack timing.
// - Printed “that Digimon may attack / attacks a player” after granting Raid/Rush should use REQUEST_ATTACK_PLAYER, not MOVE.
// Round 22AN end-the-attack guardrails:
// - Printed clauses such as “end the attack”, “end that attack”, or “end this attack” are real combat-flow effects and must be encoded as END_ATTACK, never MANUAL_REQUIRED.
// - END_ATTACK must cancel pending Counter/Blocker/battle/security handoff commands so the attack cannot continue into Blast Digivolve, battle, or security checks.
// - Costs such as “by returning 3 cards with [Jellymon] in their text from your trash to the bottom of your deck” remain the cost; END_ATTACK is the follow-up action after the cost is paid.
// - Do not approximate END_ATTACK with CANT_ATTACK, STUN, CHANGE_ATTACK_TARGET, or attack-target locks; it ends only the current pending attack.
// Round 22AM unblockable / CANT_BE_BLOCKED guardrails:
// - Printed clauses using “unblockable”, “can’t be blocked”, or “cannot be blocked” are blocker-legality restrictions and must be encoded as CANT_BE_BLOCKED, never GRANT_KEYWORD("unblockable").
// - “This Digimon is unblockable” should target self; text that says “this Digimon and all of your [name] Digimon” needs a self CANT_BE_BLOCKED action plus the named all-scope CANT_BE_BLOCKED action.
// - Costs such as “by returning one of its level 6 digivolution cards to your hand” are RETURN_SOURCE_TO_HAND source costs on the attacking host, not BOUNCE/RETURN_TO_HAND of a battle-area Digimon.
// - CANT_BE_BLOCKED must remain distinct from CANT_ATTACK/CANT_BLOCK: it only affects legal blocker selection during blocker timing.
// Round 22AL Digimon option-target guardrails:
// - Printed effects that say “all of your [Royal Base] trait Digimon gain/get ...” target Digimon, even when the effect source is a face-up security card; never encode those buffs as cardType:"option".
// - Printed source text such as “This Digimon gets +1000 DP” should bind to the host/this Digimon with isInherited/self scope, not to same-name cards or Option cards.
// - “1 of your [Royal Base] trait Digimon gains <Collision>/<Piercing> ... and attacks” should grant keywords to a Digimon and use REQUEST_ATTACK_PLAYER/forced attack flow, not MOVE to an attacking zone.
// - Inherited “while this Digimon has [X Antibody], it gains <Blocker>” targets the host Digimon with self/source trait scope, never an Option target.
// Round 22AK effect-attack request guardrails:
// - Printed clauses such as “1 of your Digimon may attack”, “it may attack”, or “may attack a player” are real effect-created attack requests, not GRANT_KEYWORD attack/can_attack placeholders.
// - Encode player/security attack requests as REQUEST_ATTACK_PLAYER with optional:true and the printed target filters.
// - Encode “may attack your opponent's Digimon” as REQUEST_ATTACK_DIGIMON so the player chooses a legal opponent Digimon target and normal attack/counter/battle timing still occurs.
// - Encode “may attack without suspending” with withoutSuspending:true; encode “may battle 1 of your opponent's Digimon” as BATTLE_DIGIMON, not an attack request.
// - Follow-up “it/that Digimon may attack” should bind to sameAsPreviousTarget where the previous action selected that Digimon.
// Round 22AJ Option color requirement guardrails:
// - Printed "ignore this card's color requirements" clauses are conditional unless the card explicitly says unconditional; do not treat any text containing "ignore/color requirement" as a blanket bypass.
// - Common conditions such as "while you have a Tamer", specific traits/names/text, "no face-up security cards", and <Use Req. (...)> must be preserved as runtime legality checks.
// - Normal Option color requirements are met only by Digimon/Tamers on the field, never by Option cards sitting in the battle area.
// - Multicolor Option cards must meet every printed color requirement unless a valid printed/effect bypass applies.
// Round 22AI Tamer-as-Digimon guardrails:
// - Printed text such as “this/that Tamer is also treated as a 3000/6000/12000 DP Digimon” is real Digimon status, not plain DP_MOD and not MOVE.
// - Encode these effects as TREAT_AS_DIGIMON with the printed fixed DP and duration, so cardType:digimon targeting, attack/block legality, and DP-zero rule checks can see the Tamer as a Digimon.
// - Follow-up clauses like “that Digimon gains <Rush>/<Blocker>/<Alliance>” or “can’t digivolve” should bind with sameAsPreviousTarget to the Tamer just treated as a Digimon.
// - “Tamer played with this effect” must target playedByThisEffect, not any same-name Tamer already in play.
// Round 22AH color-change guardrails:
// - Printed text such as “This Digimon is also treated as red/blue/etc.” or “change ... into a color” is real color identity, not GRANT_KEYWORD and not DP_MOD amount:0.
// - Encode these effects as COLOR_CHANGE so option color requirements, digivolution color matching, and target.color filters can see the changed colors.
// - Use addColor:true for “also treated as / also having” color clauses; use replaceColors:true or colorOtherThan for “change into a color other than ...” clauses.
// - Never leave residual DP_MOD value/amount 0 placeholder actions; remove them or replace them with the real rule-layer action.
// Round 22AG forced-opponent-attack guardrails:
// - Printed text such as “Your opponent attacks with the chosen Digimon” is a player-affecting forced attack declaration, not STUN, MOVE, REVEAL_AND_SELECT, or a keyword placeholder.
// - Encode [End of Opponent's Turn] versions as END_OF_OPPONENTS_TURN so they fire when the other player is ending their turn, not at the controller's own end step.
// - Use REQUEST_ATTACK_PLAYER with target:{owner:"opponent", cardType:"digimon", count:1}, forcedAttack:true and chooseAttacker:true; the chosen Digimon's controller performs the attack if it can.
// - This effect can choose Digimon unaffected by effects because the attack instruction affects the player, not the Digimon.
// Round 22AF zero-DP placeholder cleanup guardrails:
// - Never encode printed keyword/reminder text such as <Piercing>, <Iceclad>, <Raid>, or granted <Blitz> as DP_MOD amount:0.
// - If a card simply has a printed keyword, rely on runtime keyword parsing or GRANT_KEYWORD when the text explicitly grants that keyword.
// - Source-trash text like “trash the top digivolution card” should be TRASH_BOTTOM_EVO with position:"top" or TRASH_SOURCE, never TRASH_SECURITY_STACK.
// - Low-security branches that say “gains <Blocker> and <Reboot>” must emit real GRANT_KEYWORD actions on the same chosen Digimon.
// - Text that says opponent [Security] effects can’t activate should use CANT_ACTIVATE_EFFECT with timing:"SECURITY", not count:0 placeholder actions.
// Round 22AE self can't-attack-opponent-Digimon guardrails:
// - Printed clauses such as “This Digimon can't attack your opponent's Digimon” are CANT_ATTACK_DIGIMON on that Digimon, not an omitted mechanic or GRANT_KEYWORD placeholder.
// - Keep this distinct from CANT_ATTACK_PLAYER: the Digimon may still attack players/security unless another effect forbids it.
// - Preserve printed conditions such as “while you don't have a [Myotismon] in play” using NOT/HAS_SPECIFIC_CARD, and keep keyword text such as Retaliation as GRANT_KEYWORD.
// - Dynamic DP clauses like “for each Cyborg/Machine card in your trash” should use filtered TRASH_COUNT scaling, not an unfiltered trash count.
// Round 22AD De-Digivolve reminder no-security-trash guardrails:
// - The <De-Digivolve N> reminder text “Trash the top card. You can't trash past level 3 cards.” refers to digivolution cards only, never security cards.
// - Do not emit TRASH_SECURITY_STACK for De-Digivolve reminder text unless the printed card text separately says to trash security.
// - Keep follow-up clauses separate: “Then, delete...” is DELETE_DIGIMON after DE_DIGIVOLVE; “Then, return...” is RETURN_TO_DECK after DE_DIGIVOLVE.
// - Unsuspended-Digimon attack permission should use CAN_ATTACK_UNSUSPENDED, not GRANT_KEYWORD attackActive placeholder text.
// Round 22AC can-only-attack-suspended guardrails:
// - Printed clauses such as “all of your opponent's Digimon can only attack suspended Digimon” are attack target restrictions, not STUN or generic CANT_ATTACK.
// - Encode them as CAN_ONLY_ATTACK_SUSPENDED_DIGIMON on the affected Digimon/player scope; the Digimon may still attack legal suspended Digimon.
// - This restriction blocks player/security attacks and attacks into unsuspended Digimon, but must not block attacks into suspended Digimon.
// Round 22AB unsuspended-attack permission guardrails:
// - Printed clauses such as “can also attack your opponent's unsuspended Digimon with no digivolution cards” are attack permissions with target restrictions, not broad keyword text.
// - Encode them as CAN_ATTACK_UNSUSPENDED with targetRestriction:{maxSourceCount:0}; do not use GRANT_KEYWORD attackActive if the text has a no-source restriction.
// - Printed clauses such as “can attack your opponent's unsuspended level 4 or lower Digimon” require CAN_ATTACK_UNSUSPENDED with targetRestriction:{maxLevel:4}.
// - Do not encode “may attack your opponent's Digimon / unsuspended Digimon can also be attacked” as MOVE targeting opponent Digimon; it changes attack legality only.
// Round 22Z De-Digivolve reminder guardrails:
// - Printed <De-Digivolve N> must always be encoded as DE_DIGIVOLVE/DEDIGIVOLVE, never as TRASH_SECURITY_STACK or security-trash actions.
// - The reminder text “Trash the top card. You can't trash past level 3 cards.” describes De-Digivolve mechanics, not security removal.
// - Keep follow-up effects separate: “Then, delete...” is DELETE_DIGIMON after DE_DIGIVOLVE; “by returning ... from trash” should be an action cost, not a battlefield RETURN_TO_DECK target.
// - If an effect plays multiple cards and says it can't play cards of the same level, mark the play action/target with noSameLevelByThisEffect:true.
// Round 22Y cannot-attack restriction guardrails:
// - Printed clauses such as “can't attack players” are CANT_ATTACK_PLAYER, not DP_MOD, DRAW, GAIN_MEMORY, or empty mechanics.
// - Printed clauses such as “can't attack until their turn ends / for the turn” are CANT_ATTACK, not GRANT_KEYWORD placeholder text or unrelated source trash/bounce actions.
// - Keep CANT_ATTACK_PLAYER distinct from CANT_ATTACK: player-only restrictions still allow attacks on legal Digimon.
// - For cards with separate Main and Security texts, do not add CANT_BLOCK to a Security effect unless the Security text itself says “can't block”.
// Round 22V activation-lock guardrails:
// - Printed clauses such as “can't activate [When Digivolving] effects” are CANT_ACTIVATE_EFFECT locks on the affected card, not GRANT_KEYWORD placeholder text such as NO_WHEN_DIGIVOLVING.
// - Preserve the locked timing labels in text/timing, especially [When Digivolving] and [When Attacking].
// - If the lock follows a DP/security-minus action that says “that/it Digimon”, bind it with sameAsPreviousTarget.
// - Played-card activation locks should use OWN_CARD_PLAYED with EVENT_CONTEXT.playedCard; source-placement locks should use SOURCE_PLACED with EVENT_CONTEXT.sourceCard/hostCard.
// Round 22U suppress-On-Play-by-this-effect guardrails:
// - Printed clauses such as “Any [On Play] effects on Digimon played with/by this effect don't activate” belong on the play action itself.
// - Encode the relevant PLAY_FROM_* action with suppressOnPlay:true / noOnPlay:true; do not create a later generic CANT_ACTIVATE_EFFECT for the played card.
// - If the effect says the opponent plays a Digimon from trash suspended, use PLAY_FROM_TRASH targeting owner:"opponent", playSuspended:true, and suppressOnPlay:true.
// - Static clauses like “all of your opponent's Tamers [On Play] effects don't activate” are CANT_ACTIVATE_EFFECT with timing:"ON_PLAY" targeting opponent Tamers, not repeated DRAW placeholders.
// Round 22T effects-can't-delete guardrails:
// - Printed clauses such as “your opponent's effects can't delete this Digimon” or “their effects can't delete it” are scoped deletion protections.
// - Encode them as CANT_BE_DELETED with byEffect:true and opponentEffectsOnly:true, preserving the printed duration/condition.
// - If the same clause also says can't return it to hand/deck, add a separate CANT_BE_RETURNED action; do not use broad PREVENT_LEAVE_PLAY.
// - Printed Reboot remains a keyword handled by keyword runtime; never encode Reboot as UNSUSPEND or CANT_UNSUSPEND.
// Round 22S suspend/unsuspend restriction guardrails:
// - Printed clauses such as “can't be suspended” or “can't suspend” are CANT_SUSPEND restrictions, not GRANT_KEYWORD placeholder text and not CANT_UNSUSPEND.
// - Printed clauses such as “can't unsuspend” are CANT_UNSUSPEND restrictions, not GRANT_KEYWORD placeholder text.
// - Preserve follow-up gates such as “Then, if you have 1 or less memory” as action.condition on the CANT_SUSPEND action.
// - If the text says none/all of their Digimon can't unsuspend, use count:"all" and preserve DNA/other printed conditions.
// Round 22R can't-have-DP-reduced guardrails:
// - Printed clauses such as “can't have its DP reduced” are DP-reduction immunity, not DP_MOD amount:0 and not placeholder keyword text.
// - Encode them as DP_REDUCTION_IMMUNITY on the protected Digimon, preserving whether only opponent/card effects are blocked.
// - If the same chosen Digimon also gains Reboot / return protection / Option immunity, bind the follow-up protection actions with sameAsPreviousTarget.
// - If the text says “the Digimon that digivolved with this effect”, bind the immunity with digivolvedByThisEffect / same-effect context.
// Round 22Q source-scoped opponent-effect immunity guardrails:
// - Printed clauses such as “isn't affected by your opponent's Digimon's effects” are source-scoped immunity, not a broad immunity keyword.
// - Encode them as UNAFFECTED_BY_OPPONENT_EFFECTS and preserve sourceEffectType:"digimon" or exact text mentioning opponent Digimon effects.
// - Runtime must only block effects whose actual source card is an opponent Digimon; opponent Option/Tamer effects remain legal unless the card says opponent effects generally.
// - Do not approximate these clauses with GRANT_KEYWORD placeholder text such as "immune to opponent's digimon effects".
// Round 22P can't-be-returned guardrails:
// - Printed clauses such as “can't be returned to hand/deck” or “your opponent's effects can't return it to hands or decks” are return-move restrictions, not broad leave-play replacements.
// - Encode them as CANT_BE_RETURNED with toHand:true/toDeck:true and the printed duration.
// - If the text says opponent/their effects, include opponentEffectsOnly:true; do not block the card owner's own effects unless printed.
// - Do not approximate can't-be-returned text with PREVENT_LEAVE_PLAY, STUN, or placeholder GRANT_KEYWORD text.
// Round 22O cannot-be-deleted guardrails:
// - Printed simple status clauses such as “can't be deleted in battle” or “can't be deleted by your opponent's effects” are not broad leave-play replacement effects.
// - Encode them as CANT_BE_DELETED with byBattle:true or byEffect:true/opponentEffectsOnly:true, preserving the printed duration.
// - Do not use PREVENT_LEAVE_PLAY unless the text is an actual would-be-deleted / would-leave replacement window, especially if it has a cost such as Barrier, Scapegoat, Material Save, Armor Purge, Partition, or “it isn't deleted”.
// - Printed “gains Jamming” should remain GRANT_KEYWORD keyword:"Jamming"; do not expand its reminder text into PREVENT_LEAVE_PLAY.
// Round 22N can't-be-blocked guardrails:
// - Printed clauses such as “this Digimon can't be blocked” or “your Digimon can't be blocked” are not keywords and not STUN/PREVENT_LEAVE_PLAY/CANT_UNSUSPEND.
// - Encode them as CANT_BE_BLOCKED on the attacking Digimon, preserving the printed duration.
// - If the text says “can't be blocked by Digimon with no digivolution cards”, include blockerRestriction:{maxSourceCount:0}.
// - If the text grants Jamming and can't-be-blocked to the same chosen Digimon, bind CANT_BE_BLOCKED with sameAsPreviousTarget.
// Round 22M DP-reduction immunity guardrails:
// - Printed clauses such as “your opponent's effects can't reduce this Digimon's DP” are not DP_MOD placeholders and not STUN.
// - Encode them as DP_REDUCTION_IMMUNITY on the protected Digimon, with the printed duration and condition.
// - If the text says “the Digimon this effect digivolved”, bind the immunity target with digivolvedByThisEffect / same-effect context.
// - This immunity only blocks opponent DP-reduction effects; it must not block own buffs, battle, deletion, or normal return effects unless separately printed.
// Round 22L can't-digivolve guardrails:
// - Printed clauses such as “this Digimon can't digivolve”, “1 of your opponent's Digimon can't digivolve”, or “Digimon played by this effect can't digivolve” are digivolution legality restrictions.
// - Encode them as CANT_DIGIVOLVE on the affected Digimon; do not approximate them with STUN, PREVENT_LEAVE_PLAY, DP_MOD, or GRANT_KEYWORD keyword:"cannot digivolve".
// - If the text says “played by this effect”, bind CANT_DIGIVOLVE to playedByThisEffect / same-effect context.
// - If the text says “can't digivolve to level 7”, keep that as CANT_DIGIVOLVE with evolveToLevel:7 instead of blocking all digivolution.
// Round 22K cannot-move lock guardrails:
// - Printed clauses such as “can't play or move Digimon with 6000 DP or less” contain two separate restrictions.
// - Encode the play part as CANT_PLAY and the movement part as CANT_MOVE using the same target/duration.
// - CANT_MOVE stops official movement from breeding area to battle area; CANT_PLAY alone does not stop raising/moving.
// - Do not approximate cannot-move text with STUN, SUSPEND_OPPONENT, or MOVE; those do not create a player-level movement restriction.
// Round 22J cannot-play lock guardrails:
// - Printed clauses such as “can't play Digimon with 6000 DP or less” are player-level play restrictions.
// - Encode normal play restrictions as CANT_PLAY with target.owner matching the affected player and printed DP/card-type limits.
// - Printed clauses such as “effects can't play Digimon or Tamers from the trash” remain CANT_PLAY_BY_EFFECT with from:"trash" and cardType:"digimon_or_tamer".
// - Do not approximate cannot-play text with STUN, SUSPEND_OPPONENT, or PREVENT_LEAVE_PLAY; those affect board objects or movement, not the legality of playing cards.
// Round 22I cost-reduction lock guardrails:
// - Printed clauses such as “Players can't reduce play costs” and “Your opponent can't reduce digivolution costs” are player-level cost-reduction restrictions.
// - Encode them as CANT_REDUCE_COST with target.owner matching the affected player and mode:"play" or mode:"digivolution".
// - Do not approximate them with REDUCE_COST amount:0; that records no real lock and later reductions will still apply.
// - The lock must apply to normal cost preprocessors and explicit reduced-cost play/digivolve effects.
// Round 22H memory-gain lock guardrails:
// - Printed clauses such as “your opponent can't gain memory other than by Tamer effects” are player-level memory-gain restrictions.
// - Encode them as CANT_GAIN_MEMORY with target.owner matching the affected player and exceptSourceType:"tamer".
// - Do not approximate them with SET_MEMORY, STUN, SUSPEND_OPPONENT, or PREVENT_LEAVE_PLAY; those affect unrelated game objects/rules.
// - Tamer effects that gain memory remain legal under these clauses.
// Round 22G can't-use-Option guardrails:
// - Printed clauses such as “your opponent can't use Option cards” are player-level Option-use restrictions, not STUN and not SUSPEND_OPPONENT.
// - Encode them as CANT_USE_OPTION with target.owner matching the affected player and the printed duration.
// - Continuous clauses such as Shivamon's “while all of your Digimon are suspended” need an ALL_DIGIMON_SUSPENDED condition and must remain active only while that board state is true.
// - Do not target cardType:"option" with SUSPEND_OPPONENT; Option cards in hand/trash/battle area are not Digimon that can be suspended.
// Round 22F can't-attack-or-block guardrails:
// - Printed clauses such as “can't attack or block” require two separate restrictions: CANT_ATTACK and CANT_BLOCK.
// - CANT_ATTACK prevents attack declarations, but it does not remove a Digimon from Blocker timing.
// - Do not approximate “can't block” with CANT_UNSUSPEND; the Digimon may still be able to unsuspend by other rules, it just cannot block.
// - If the same target receives both restrictions, keep target/duration/condition identical on CANT_ATTACK and CANT_BLOCK.
// Round 22E activate-this-Digimon trigger-effect guardrails:
// - Printed clauses such as “activate 1 of this Digimon's [When Digivolving] effects” or “activate 1 of that Digimon's [When Digivolving] effects” are not copied action blocks and not keywords.
// - Encode them as ACTIVATE_TRIGGER_EFFECT with triggerName:"WHEN_DIGIVOLVING" and bind the target to self, sameAsPreviousTarget, or the event card required by the printed text.
// - Event listeners such as “when Tamer cards are placed in this Digimon's digivolution cards” should listen to SOURCE_PLACED and inspect EVENT_CONTEXT.sourceCard/hostCard.
// - Do not emit GRANT_KEYWORD buff.keyword:"When Digivolving" or duplicate the old When Digivolving actions under the later event trigger.
// Round 22C may-attack request guardrails:
// - Printed clauses such as “1 of your Digimon may attack”, “this Digimon may attack”, or “it may attack a player” are not keywords.
// - Encode immediate player-attack clauses as REQUEST_ATTACK_PLAYER with optional:true and the printed attacker target.
// - If the text says “that Digimon / it may attack” after an UNSUSPEND or other choice, bind the request to sameAsPreviousTarget where possible.
// - Do not emit GRANT_KEYWORD buff.keyword:"may attack" or "may attack a player"; keyword parsing will not open the official effect attack choice window.
// Round 22B granted On-Deletion play/gain trigger guardrails:
// - Text granted to a Digimon such as “[On Deletion] You may play 1 [Biyomon] from your hand or trash without paying its cost” is not a keyword.
// - Text granted to a Digimon such as “[On Deletion] Gain 3 memory” is not a keyword.
// - Encode both as GRANT_TRIGGER_EFFECT with trigger:"ON_DELETION" and real actions PLAY_FROM_HAND_OR_TRASH or GAIN_MEMORY.
// - If the same chosen Digimon also receives a blocking/immunity clause, bind the granted trigger to sameAsPreviousTarget instead of opening a second unrelated target choice.
// Round 22A Phoenixmon X attach-End-of-Attack guardrails:
// - Text like “attach [End of Attack] to all of this Digimon's [On Deletion] effects” is not a keyword.
// - Encode a real END_OF_ATTACK copy of the printed On Deletion effect, gated by the printed source condition and Your Turn.
// - Do not emit GRANT_KEYWORD buff.keyword:"End of Attack" or PREVENT_LEAVE_PLAY for this clause.
// - Follow-up deletion such as “with as much or less DP as the Digimon this effect played” must bind to the same-effect played card's DP.
// Round 21Z granted End-of-Turn deletion trigger guardrails:
// - Text granted to a Digimon/Tamer such as “[End of Your Turn] Delete this Digimon” or “Delete 1 of your Digimon” is not a keyword.
// - Encode it as GRANT_TRIGGER_EFFECT with trigger:"END_OF_TURN" and DELETE_DIGIMON self or the printed controller-side target.
// - The affected card's controller resolves the trigger at their End of Turn; do not encode GRANT_KEYWORD buff.stat:"END_OF_TURN" / buff.keyword:"DELETE_DIGIMON".
// - If the printed text targets Digimon or Tamers, preserve the chosen card type in the grant target, but the granted self-delete action should use self:true.
// Round 21Y activate printed trigger-effect guardrails:
// - Printed clauses like “activate 1 of the [On Deletion] effects” or “activate 1 of its [When Digivolving] effects” do not grant a keyword.
// - Encode them as ACTIVATE_TRIGGER_EFFECT with triggerName:"ON_DELETION" or triggerName:"WHEN_DIGIVOLVING" and the correct target.
// - If the text says “that Digimon is [Jesmon GX], activate 1 of its [When Digivolving] effects”, bind ACTIVATE_TRIGGER_EFFECT to sameAsPreviousTarget.
// - Do not emit GRANT_KEYWORD buff.keyword:"On Deletion" / "When Digivolving" for these activation clauses.
// Round 21X granted source-trash / opponent-turn suspend trigger guardrails:
// - Text granted to Digimon such as “[When Attacking] Trash the bottom digivolution card of this Digimon” is not a keyword.
// - Encode it as GRANT_TRIGGER_EFFECT with trigger:"WHEN_ATTACKING" and actions:[{type:"TRASH_BOTTOM_EVO", target:{self:true}}].
// - Text granted by Waltz's End such as “[Opponent's Turn] When this Digimon becomes suspended...” must be GRANT_TRIGGER_EFFECT with trigger:"DIGIMON_SUSPENDED", condition TURN_PLAYER opponent, and same-target follow-up protection.
// - Do not encode granted event text as GRANT_KEYWORD buff.keyword; keyword parsing will not fire from the later attack/suspend timing.
// Round 21W granted End-of-Attack trigger guardrails:
// - Text granted to a Digimon such as “[End of Attack] Delete this Digimon” is not a keyword.
// - Encode it as GRANT_TRIGGER_EFFECT with trigger:"END_OF_ATTACK" and actions:[{type:"DELETE_DIGIMON", target:{self:true}}].
// - The affected Digimon's controller resolves the granted trigger at the End of Attack timing, and the deletion targets that same Digimon.
// - Do not encode this text as GRANT_KEYWORD buff.keyword; keyword parsing will not delete the Digimon at the timing window.
// Round 21V granted When-Attacking trigger guardrails:
// - Text granted to a Digimon such as “[When Attacking] lose 2 memory”, “[When Attacking] Return 1 of your opponent's level 3 Digimon...”, or “When attacking an opponent's Digimon with no digivolution cards, delete that Digimon” is not a keyword.
// - Encode it as GRANT_TRIGGER_EFFECT with trigger:"WHEN_ATTACKING" and real actions such as LOSE_MEMORY, BOUNCE, or DELETE_DIGIMON.
// - Use currentAttackTarget:true for effects that refer to the Digimon being attacked; do not retarget a random matching Digimon.
// - Do not encode granted attack text as GRANT_KEYWORD or HAS_TRAIT strings; those will not fire from the actual attacker.
// Round 21U granted Start-of-Main forced-attack guardrails:
// - Text granted to a Digimon such as “[Start of Your Main Phase] This Digimon attacks” is not a keyword.
// - Encode it as GRANT_TRIGGER_EFFECT with trigger:"START_OF_MAIN_PHASE" and an action that forces this Digimon to attack if able.
// - The granted Digimon's controller resolves this trigger when they enter their main phase; use forcedAttack:true so legal Digimon targets are considered if player attacks are blocked.
// - Do not encode this text as GRANT_KEYWORD buff.keyword; keyword parsing is only a legacy fallback and can miss timing/target legality.
// Round 21T granted On Deletion trigger guardrails:
// - Text granted to a Digimon such as “[On Deletion] Lose 1 memory”, “[On Deletion] Lose 2 memory”, or “[On Deletion] Trash the top card of your security stack” is not a keyword.
// - Encode these as GRANT_TRIGGER_EFFECT with trigger:"ON_DELETION" and real actions such as LOSE_MEMORY or TRASH_SECURITY_STACK.
// - The controller/owner of the deleted Digimon resolves the granted On Deletion trigger.
// - Do not encode granted On Deletion text as GRANT_KEYWORD buff.keyword; keyword parsing will never fire when the Digimon is deleted.
// Round 21S cards-under/source-host guardrails:
// - Printed clauses like “trash 1 card under 1 of your opponent’s Digimon or Tamers” must be TRASH_SOURCE with sourceHostTarget matching Digimon/Tamer hosts, not TRASH_SECURITY_STACK.
// - “For each card trashed by this effect” must scale from TRASHED_BY_THIS_EFFECT in the same effect context.
// - “Digimon or Tamer without cards under it” is a maxSourceCount:0 predicate over a single Digimon-or-Tamer choice; do not encode trait:"no cards under it" or split into two mandatory targets.
// - If the printed cost says “up to N blue cards from your hand,” encode TRASH_HAND upTo:true with target color Blue and record the actual count for follow-up actions.
// Round 21R no-digivolution-cards source-count guardrails:
// - Printed clauses like “Digimon with no digivolution cards” are source-count predicates, not traits.
// - Encode target filters as maxSourceCount:0; encode “no Digimon with digivolution cards” as NOT HAS_DIGIMON with minSourceCount:1.
// - “For each opponent Digimon with no digivolution cards” should use dynamic amount source MATCHING_DIGIMON_COUNT with target:{owner:"opponent",cardType:"digimon",maxSourceCount:0}.
// - “Can’t be blocked by opponent’s Digimon with no digivolution cards” must be a blockerRestriction:{maxSourceCount:0}, not PREVENT_LEAVE_PLAY or trait:"no digivolution cards".
// Round 21Q multicolor condition guardrails:
// - Printed clauses like “Digimon with 2 or more colors” are color-count predicates, not trait/text matches.
// - Encode battle-area targets as multicolor:true, and source clauses like “with 2 or more colors in its digivolution cards” as sourceMulticolor:true.
// - Attack listeners such as Cody Hida/Yolei Inoue must use WHEN_ATTACKING plus EVENT_CONTEXT.attacker matching multicolor:true.
// - Digivolve listeners such as Davis Motomiya & Ken Ichijoji must use DIGIVOLVED plus EVENT_CONTEXT.digivolvedCard matching multicolor:true.
// - Never emit trait:"2", trait:"more colors", textContains:"2", or textContains:"more colors" for these clauses.
// Round 21P granted event-text trigger guardrails:
// - Text granted to a Digimon such as “When this Digimon is blocked, gain 3 memory”, “When this Digimon deletes an opponent’s Digimon in battle and survives, unsuspend it”, or “When this Digimon checks security, gain 2 memory” is not a keyword.
// - Encode these as GRANT_TRIGGER_EFFECT with trigger ATTACK_BLOCKED / BATTLE_WON / SECURITY_CHECKED and real actions such as GAIN_MEMORY or UNSUSPEND.
// - Preserve once-per-turn and DP/turn restrictions on the granted trigger; do not hide the whole sentence in GRANT_KEYWORD buff.keyword.
// - Runtime must enqueue granted triggers from the exact Digimon that was blocked, won the battle, or checked security.
// Round 21O granted suspend-trigger guardrails:
// - Text granted to a Digimon such as “When this Digimon becomes suspended, lose 1 memory” is not a keyword.
// - Encode it as GRANT_TRIGGER_EFFECT targeting the affected Digimon, with buff.trigger:"DIGIMON_SUSPENDED" and actions:[{type:"LOSE_MEMORY",amount:1}].
// - The controller of the suspended Digimon loses the memory when the granted trigger fires.
// - Do not encode this text as GRANT_KEYWORD buff.keyword; keyword parsing will never create the later suspend trigger.
// Round 21M hand-count condition guardrails:
// - Printed phrases like “if you have 7 or fewer cards in your hand” must use HAND_COUNT, not MEMORY_COUNT.
// - MEMORY_COUNT is only for the memory gauge / start-of-turn memory setters.
// - “for each card in your hand” should scale from the current hand size, not from memory and not from a dummy MEMORY_COUNT >= 0 condition.
// - Apply this to inherited effects, Tamers, Options, and trash/hand-zone effects wherever the printed condition references hand size.
// Round 21L played-by-this-effect keyword binding guardrails:
// - Text like “The Digimon this effect played gains <Rush>/<Blocker>” must be encoded as a PLAY_FROM_* action followed by GRANT_KEYWORD_TO_PLAYED_BY_EFFECT.
// - Do not put those keywords inside the PLAY_FROM_* action.buff field; that can be skipped or bind to a stale last-played card.
// - Card names such as [Creepymon] and [Impmon] must use name/nameAny, not trait.
// - Opponent attack listeners such as BeelStarmon must use OPPONENT_ATTACKED, not a static OPPONENTS_TURN trigger.
// Round 21K Tamer-suspend event binding guardrails:
// - Text like “When one/any of your red or yellow Tamers becomes suspended/suspend” is an event listener, not a DIGIMON_SUSPENDED or static YOUR_TURN effect.
// - Encode own Tamer suspension as OWN_TAMER_SUSPENDED with TURN_PLAYER own plus EVENT_CONTEXT key:"suspendedCard" target:{cardType:"tamer", colorAny:[...]}.
// - Encode opponent Tamer suspension as OPPONENT_TAMER_SUSPENDED with EVENT_CONTEXT.suspendedCard target:{cardType:"tamer"}; do not use HAS_TAMER board-state checks as the event condition.
// - “When one of your effects suspends a Tamer” must additionally require EVENT_CONTEXT key:"byEffect" value:true.
// Round 21J Option-use cost-condition guardrails:
// - Text like “When you use an Option card with a cost/use cost of 2 or more” must inspect the actual used Option event card.
// - Encode OPTION_USED listeners with EVENT_CONTEXT key:"optionCard" target:{cardType:"option",minCost:N}; do not use fake HAS_TRAIT strings like “Option card with a cost of 2”.
// - Text like “If you don't use an Option card with this effect” must bind to same-effect option-use result context, e.g. NOT_USED_OPTION_BY_THIS_EFFECT.
// - Returning an Option card from trash to hand is ADD_TO_HAND from trash, not PLAY_FROM_TRASH / USE_OPTION unless the card says use/play.
// Round 21I Security Digimon scope guardrails:
// - "Security Digimon" is a temporary battle/check state, not a real trait token.
// - Effects like "all of your opponent's Security Digimon get -3000 DP" must apply only to the currently checked Digimon card during security battle.
// - Do not encode trait:"Security Digimon"; use securityDigimon:true or rely on runtime static text scope.
// - These effects must never debuff normal battle-area Digimon just because they are Digimon.
// Round 21H comma-delimited name selector guardrails:
// - Printed name alternatives separated by commas, such as “[Huckmon], [Jesmon] or [Sistermon] in their name”, are still alternatives.
// - Encode these as nameContainsAny:[...] rather than nameContains:"Huckmon, Jesmon, Sistermon".
// - A single comma-delimited nameContains string silently searches for the whole phrase and will miss every legal card.
// - This applies to reveal/search/add-to-hand effects and any card-name selector generated from bracketed name lists.
// Round 21G Tamer/Option card-type OR guardrails:
// - Printed selectors like “Tamer card or Option card” are card-type alternatives, not a literal cardType string.
// - Encode them as anyOf:[{cardType:"tamer"},{cardType:"option"}] while preserving shared trait/name/count filters.
// - Do not write cardType:"tamer or option" or cardType:"option or tamer"; those strings silently fail strict target matching.
// - This especially applies to reveal/search effects such as “1 Tamer card or Option card with the [Chronicle] trait”.
// Round 21F Digimon/Tamer card-type OR guardrails:
// - Printed selectors like “Digimon or Tamer” are card-type alternatives, not a literal cardType string.
// - Encode them as anyOf:[{cardType:"digimon"},{cardType:"tamer"}] while preserving shared owner/color/trait/count filters.
// - Do not write cardType:"digimon or tamer" or cardType:"tamer or digimon"; those strings silently fail strict target matching.
// - This applies to suspend/can't-unsuspend/delete/bounce/return/add-to-hand/HAS_SPECIFIC_CARD conditions that can target either type.
// Round 21E Unique Emblem Delay suspend-trigger guardrails:
// - Printed "[Your Turn] When any of your [Tamer] suspend, <Delay>" is an event trigger, not a static YOUR_TURN effect.
// - Encode these as OWN_TAMER_SUSPENDED with an AND condition: TURN_PLAYER own + EVENT_CONTEXT suspendedCard matching the named Tamer.
// - Delay cost is TRASH_OPTION_IN_BATTLE_AREA for this Option; do not encode TRASH_SECURITY_STACK or SUSPEND_OPPONENT as the cost.
// - Keep the base Digimon trait requirement separate from the destination Digimon-in-hand trait requirement; use traitAll/anyOf for "A and LIBERATOR" destinations.
// Round 21D compound color selector guardrails:
// - Printed alternatives like “red or green Digimon” must be encoded as colorAny:["Red","Green"], not color:"red or green".
// - This applies to reveal/search/play targets, static selectors, and board conditions.
// - Keep color OR semantics separate from trait/name alternatives; do not collapse color alternatives into one free-text string.
// - Future generators should canonicalize color/colorAny before writing mechanics so audit can catch regressions cleanly.
// Round 21C level-check / compound-trait guardrails:
// - Board clauses like “if your opponent has a level 6 or higher Digimon” must scan the opponent battle/breeding area; do not check the resolving card's own level.
// - Unsuspended/suspended are card states, not traits. Encode as isUnsuspended:true / isSuspended:true.
// - “Digimon or Tamer” is a card-type OR; use anyOf:[{cardType:"digimon"},{cardType:"tamer"}], not trait:"or tamer".
// - “[A] and [B] trait” destination requirements mean every listed trait is required; encode traitAll:["A","B"], not trait:"A and B".
// - Delay Options placed in the battle area are paid by trashing that Option from the battle area, not by trashing security.
// Round 21B color+trait selector guardrails:
// - Printed selectors like “blue or yellow [TS] trait Digimon” require BOTH a color alternative and the printed trait.
// - Encode as colorAny:["Blue","Yellow"] plus trait:"TS"; do not collapse to trait-only or color-only.
// - This applies to play/search/reveal/static keyword targets and Security effects.
// - Off-color cards with the same trait must not qualify unless the printed text omits the color restriction.
// Round 21A compound name/text selector guardrails:
// - Printed alternatives like “with [Greymon] or [Omnimon] in its name” must not be encoded as nameContains:"Greymon or Omnimon".
// - Split name alternatives into nameContainsAny:[...] or nameAny:[...] according to exact wording.
// - The same rule applies to trait/color/keyword alternatives: use traitAny/colorAny/keywordAny or anyOf.
// - Guard searches/reveals/trash returns especially; a single compound string silently matches nothing at runtime.
// Round 20Z leave-source own-effect selector guardrails:
// - Effects that say “when this Digimon would leave the battle area other than by your own effects” must not trigger when your own effect caused the leave.
// - Partition text with “other than by your own effects or by battle” must apply the own-effect exclusion at runtime, not only the in-battle exclusion.
// - Ancient/Whamon/Bulbmon-style leave-source helpers must preserve printed source filters such as level, play cost, color, trait, and color-or-trait alternatives.
// - Do not collapse “blue or [CS] trait” into an AND filter; it is legal if either the color or trait condition matches.
// Round 20Y Decode/Partition source-play broadcast guardrails:
// - Keyword/helper effects that play a Digimon card from this Digimon's digivolution cards still count as card plays by effect.
// - Decode/Partition/generic leave-source runtime helpers must broadcast both Digimon-played and generic card-played events.
// - Do not regress OWN_CARD_PLAYED / OPPONENT_CARD_PLAYED / PLAYED_BY_EFFECT listeners when the played card came from sources instead of hand/trash.
// - These helpers do not prevent the original Digimon from leaving unless the printed text explicitly prevents it.
// Round 20X played-Tamer source-binding guardrails:
// - Text like “play 1 red Tamer card with inherited effects ... If you did, place this Digimon under the played Tamer” must filter for real inherited/source effects.
// - Do not treat “[Security] Play this card” as an inherited effect for this Tamer filter.
// - The follow-up PLACE_SOURCE must require PLAYED_BY_THIS_EFFECT and attach to the Tamer actually played by this same effect.
// - Runtime may allow PLACE_SOURCE under a Tamer only when the printed effect explicitly says the host is a Tamer; keep token/normal host protections intact.
// Round 20V start-of-main-phase timing guardrails:
// - Printed [Start of Your Main Phase] effects must use trigger START_OF_MAIN_PHASE, not START_OF_TURN.
// - Keep true [Start of Your Turn] memory setters on START_OF_TURN; cards may contain both timing clauses, so do not collapse both into one trigger.
// - For cards with both [Start of Your Turn] and [Start of Your Main Phase], only the actual main-phase branch should move to START_OF_MAIN_PHASE.
// - Runtime enterMainPhase is the official point for START_OF_MAIN_PHASE effects after draw/unsuspend/breeding timing has passed.
// Round 20U without-source host restriction guardrails:
// - Text like “place this card under 1 of your Digimon without [X] in its digivolution cards” must apply the without-[X] filter to attachToTarget/host, not to the source card.
// - Encode these host filters as attachToTarget.withoutSourceName / withoutSourceNameAny / withoutSourceTrait as appropriate.
// - Do not approximate “without [X] in its digivolution cards” with maxSourceCount:0 unless the text says no digivolution cards at all.
// - Runtime target matching must reject hosts whose stack already contains the forbidden source name/trait before opening PLACE_SOURCE attach choice.
// Round 20T all-lowest/all-highest tied target guardrails:
// - Printed effects that say “delete/return all of your opponent’s lowest/highest DP/level/play cost Digimon” must use target.count:"all".
// - Do not encode an all-lowest/all-highest effect as a single pending target with count:1; every tied card at the extreme value is affected.
// - Use the exact printed metric: “lowest play cost” is selection:"lowest_play_cost", not lowest_level.
// - Runtime should auto-apply count:"all" extrema actions to all tied legal targets instead of asking for one target.
// Round 20S empty-breeding play destination guardrails:
// - Text like “play 1 card from your hand/trash to your empty breeding area” must not be encoded as a normal battle-area PLAY_FROM_* action.
// - Encode these actions with to:"breeding", destination:"breedingArea", position:"breeding", and requireEmptyBreeding:true.
// - Runtime must place the card into breedingArea, suppress ordinary On Play there, and fail/fizzle if that breeding area is not empty.
// - Text phrased as “By playing ... to your empty breeding area, [follow-up]” must make the follow-up require PLAYED_BY_THIS_EFFECT so it does not resolve when no card was played.
// Round 20R same-level-as-placed-source follow-up guardrails:
// - Text like “By placing 1 level 6 or lower Digimon card with [X] in its text from your trash as this Digimon's top digivolution card, delete 1 opponent Digimon with the same level as the placed card” must encode the placement as a PLACE_SOURCE cost.
// - The follow-up DELETE/BOUNCE/RETURN target must bind to the level of the card actually placed for that cost, not to a broad maxLevel filter.
// - For Abbadomon-style effects, use target.selection:"same_level_as_placed_cost" on the follow-up action.
// - Runtime must record PLACE_SOURCE cost payments in effect context so same-level follow-ups can resolve after the cost is paid.
// Round 20Q same-level source-cost guardrails:
// - Costs like “trash 2 digivolution cards with the same level” must require both paid cards to share one printed level.
// - Do not let generic TRASH_SOURCE payment select the first N matching sources when cost.sameLevel is true; mixed-level payment is illegal.
// - Protection/replacement costs that use same-level sources should fail atomically if no same-level group can fully pay the cost.
// - When generating this pattern, encode {type:"TRASH_SOURCE", amount:N, sameLevel:true} rather than a broad target-only cost.
// Round 20P D-Reaper host source-count DP guardrails:
// - Text like “For each digivolution card of 1 of your [Mother D-Reaper]s, 1 of your opponent's Digimon gets -1000 DP” must not put Mother D-Reaper on the opponent target filter.
// - Encode the opponent target as a normal opponent Digimon, and scale amount from HOST_SOURCE_COUNT / hostTarget:{name:"Mother D-Reaper"}.
// - Do not use the resolving support card's own stack for this amount; the source-count host is a separate chosen/described Mother D-Reaper.
// - If multiple host candidates exist, future UI should allow host choice; until then runtime must at least avoid targeting an impossible opponent Mother.
// Round 20O D-Reaper source/host binding guardrails:
// - Text like “place this Digimon as the bottom digivolution card of 1 of your [Mother D-Reaper]” must encode the moved source as target.self/from battle_area and Mother D-Reaper as attachToTarget.
// - Do not encode Mother D-Reaper as the PLACE_SOURCE target when Mother is the host receiving the source.
// - Effects that place [ADR-02 Searcher] from hand/in play under [Mother D-Reaper] must use attachToTarget:{name:"Mother D-Reaper"}; otherwise the runtime may attach under any own Digimon.
// - Inherited text “from this Digimon's digivolution cards” must use sourceHostSelf:true so PLAY_FROM_SOURCE does not search unrelated source stacks.
// Round 20N place-source cost scope guardrails:
// - Printed costs like “by placing 3 level 6 or lower Digimon cards with [X] in their text from your trash as this Digimon’s top digivolution cards” must encode the source-zone and target filters on cost itself.
// - Do not emit bare {type: PLACE_SOURCE, amount:N} costs; without card filters the runtime may pay with illegal cards from trash/hand/source.
// - For Abbadomon Core-style costs, Lv.7 Abbadomon Core is not a legal cost card because the printed cost says level 6 or lower.
// - Cost PLACE_SOURCE target.count should match the required amount so audit/regression can verify the payment scope.
// Round 20M meta-archetype regression guardrails:
// - Full-match smoke tests must use only legal player-like actions; test drivers must not rely on intentionally invalid play/evolution attempts.
// - Printed “Then, it may attack” / “1 of your Digimon may attack” is an optional effect-created attack request, not a MOVE/manual placeholder.
// - [Start of Your Main Phase] effects must use START_OF_MAIN_PHASE, not START_OF_TURN.
// - Any newly added archetype regression should assert no unresolved pending windows, no reveal-buffer residue, no duplicate instanceIds, and no manual MOVE placeholders.
// Round 20L Manual 6.0 / CRM 4.0 face-up security static guardrails:
// - Face-up security continuous [Security]/[All Turns] clauses are public static providers, but normal [Security] trigger/sourceEffect text must not become a continuous aura.
// - Do not duplicate combined effectText with mainEffect/sourceEffect when scanning face-up security static text.
// - Split continuous provider clauses before [Main]/[On Play]/[When Digivolving]/[When Attacking]/[On Deletion] activation text.
// - Reminder text in parentheses, such as Alliance gaining Security A.+1 during the attack, must not be extracted as a passive continuous Security A.+ modifier.
// Round 20K Manual 6.0 / CRM 4.0 once-per-turn binding guardrails:
// - A broadcast that is rejected by text/context binding must not consume [Once Per Turn].
// - For SECURITY_REMOVED, wrong-owner/opponent broadcasts are ignored before OPT is marked.
// - For "this Digimon deletes/wins a battle", bystander broadcasts are ignored before OPT is marked.
// - Emit explicit EVENT_CONTEXT/text binding for broad broadcast triggers so runtime can reject false listeners before once consumption.
// Round 20J Manual 6.0 / CRM 4.0 SECURITY_REMOVED owner/opponent guardrails:
// - "When your security stack is removed from" must bind to the owner of the removed security stack, not every listener that receives the event.
// - "When your opponent's security stack is removed from" may listen from the opposite player's battle/source area.
// - "This card is removed/trashed from security" must bind to the physical removed security card instance.
// - Do not encode opponent-security removal watchers as broad SECURITY_REMOVED triggers without text/context binding.
// Round 20I Manual 6.0 / CRM 4.0 battle-deletion binding guardrails:
// - Effects that say "when this Digimon deletes/wins a battle" must bind to the Digimon that actually won/deleted in that battle, not every own battle-area listener.
// - Inherited "this Digimon deletes" effects bind to the host Digimon, not the inherited source card itself.
// - Effects that say "when one of your Digimon" or name/trait watcher text may still listen to the broadcast battle-deletion event.
// - Do not encode "this Digimon deletes" as broad HAS_TRAIT/DP_CHECK conditions that can be satisfied by a different own Digimon.
// Round 20H Manual 6.0 / CRM 4.0 SECURITY_CHECKED self-binding guardrails:
// - Effects that say "when this Digimon checks security" must bind to the Digimon that actually performed the check, not every own battle-area Digimon watching the event.
// - Inherited "this Digimon" SECURITY_CHECKED effects bind to the host Digimon as sourceCard.
// - "checks a face-up security card" must explicitly test the checked security card's face-up state through event context.
// - Such effects should use EVENT_CONTEXT self/source binding plus target.self for buffs to this Digimon; do not target the inherited source card name.
// Round 20G Manual 6.0 / CRM 4.0 Piercing continuation guardrails:
// - <Piercing> only performs security checks after an attacking Digimon deletes an opponent Digimon in battle and survives the battle.
// - If the attacker is deleted by mutual battle deletion or Retaliation before the pending Piercing transition resolves, no Piercing security check is performed.
// - If Armor Purge or Barrier replaces that battle deletion and the attacker remains in the battle area, Piercing may still resolve.
// - Piercing must use the attacker’s current Security A.+/- value at the moment Piercing resolves; battle-deletion triggers can change the count after battle.
// - Jamming only protects against Security Digimon battle deletion; it does not create Piercing from Security Digimon battles and does not skip End of Attack cleanup.
// Round 20F Manual 6.0 / CRM 4.0 multi-security-check guardrails:
// - Security checks are performed one card at a time; do not treat Security A.+N as an unconditional pre-paid loop.
// - After each checked card resolves, stop remaining queued checks if the attacker left the battle area or if current Security A.+/- modifiers no longer allow another check.
// - Jamming only prevents deletion in Security Digimon battle; if it survives, remaining checks may continue normally.
// - Runtime statuses encoded as {stat:'security', value:+/-N} must be counted by getSecurityChecks the same as literal <Security A. +/-N> keyword text.
// Round 20E Manual 6.0 / CRM 4.0 activation-lock guardrails:
// - Text like “all of your opponent’s [Security] effects on Option cards don’t activate” is a Security-effect activation lock, not a target trait named Security.
// - Embedded timing labels such as [Security] inside the locked effect description must stay in the same lock sentence; do not split the clause before “don’t activate”.
// - Explicit provider windows such as [Your Turn] / [Opponent’s Turn] control when the lock is active; [Security] in this sentence is the locked timing, not an all-turns provider.
// - A Delicate Plan-style “Option cards checked by this Digimon don’t activate” remains attacker-attached and applies only to Option Security effects checked by that Digimon.
// Round 20D Manual 6.0 / CRM 4.0 explicit condition guardrails:
// - HAS_KEYWORD and IS_SUSPENDED are real runtime legality/trigger conditions; never rely on unsupported-condition fallthrough to make them pass.
// - "while this Digimon has <Keyword>" should check the actual source/event Digimon keyword state or a keyword-scoped owner board scan.
// - "if your/opponent has a suspended Digimon/Tamer" must count matching suspended battle-area cards under the printed owner scope.
// - Do not encode these as generic HAS_TRAIT/name pollution, and do not let missing condition support widen effects to always-on.
// Round 20C Manual 6.0 / CRM 4.0 source/link Overflow guardrails:
// - ACE Overflow must be charged exactly once per physical ACE card when it moves from battle area/source to outside those zones.
// - removeSourceFromHost is the central source-leave primitive and already processes context-aware Overflow; callers must not call processOverflow again for the same moved source.
// - Linked cards are still source cards for Overflow, but trashing a linked ACE source must only apply the memory loss once.
// - When adding link/source cleanup helpers, pass destination context to removeSourceFromHost rather than duplicating movement and Overflow logic.
// Round 20B live bot/socket action path guardrails:
// - Live automation/bots must send gameplay decisions through the same guarded server action path as real Socket.IO clients.
// - Do not call GameState methods directly from spectator scripts; this bypasses spectator, spoofing, turn-player, memory-side, pending-owner, Counter/Blocker, and BO3 match-recording guards.
// - Reusable bot helpers should bind to a seat socket id and dispatch through executeGuardedRoomAction / createLiveBotSocketActionGuard.
// - Surrender/end-of-game test automation must go through the guarded action path so recordFinishedGameForMatch updates BO3 wins.
// Round 20A Manual 6.0 / CRM 4.0 security-removed/turn-transition guardrails:
// - SECURITY_REMOVED_BY_EFFECT means a security card/stack card was removed by an effect or effect cost; normal security checks must not satisfy this condition.
// - Do not treat unsupported conditions as automatically true when they can widen live gameplay; add explicit runtime condition handling.
// - End phase continuations must be tied to the same player and same turn count that created them; stale pendingEndPhase must not start another turn or draw again.
// - Direct GameState test scripts should not bypass server/client action guards when validating live match flow.
// Round 19Z Manual 6.0 / CRM 4.0 security-check auto-resolution guardrails:
// - After Counter and Blocker timing are passed/skipped, the combat System queue must continue automatically into execute_attack; live rooms must not require a manual resolveEffect click to flip security.
// - A player attack with at least 1 security check must remove the checked card from the defender security stack, resolve/battle the checked card, place it in the correct destination, then continue to End of Attack.
// - Do not strand execute_attack, resolve_security_battle, trash_security, sec_check, or end_of_attack in effectQueue after a defender auto-passes Counter/Blocker.
// - Security Attack -N can reduce checks to 0, but when total checks are positive the security count must decrease immediately once damage step resolves.
// Round 19Y Manual 6.0 / CRM 4.0 can't-attack-Digimon guardrails:
// - Text such as “1 of their Digimon can't attack Digimon” is a targeted CANT_ATTACK_DIGIMON restriction on the chosen Digimon, not STUN and not CANT_ATTACK_PLAYER.
// - The restricted Digimon may still attack players unless another effect prohibits that; only attacks against Digimon targets are blocked.
// - If the same sentence also grants Security A.-1 or another status, bind that follow-up to the same selected target with sameAsPreviousTarget.
// - Do not encode this as a self-only source-card restriction, fake Jamming, BATTLE_DIGIMON, DELETE_DIGIMON, or generic CANT_ATTACK.
// Round 19X Manual 6.0 / CRM 4.0 Blitz guardrails:
// - <Blitz> is optional processing: when it activates, this Digimon may attack only if memory is already 1 or more on the opponent's side.
// - Blitz does not ignore suspension, summoning sickness, can't attack players, can't attack Digimon, or normal attack target legality.
// - Do not encode printed Blitz as REQUEST_ATTACK_PLAYER, ATTACK_PLAYER, BATTLE_DIGIMON, DELETE_DIGIMON, or an always-on Rush-like effect. Runtime handles BLITZ_TARGET_CHOICE.
// - A Blitz attack must proceed through the normal attack flow, including When Attacking, Counter, Blocker, battle/security, and End of Attack timing.
// Round 19W Manual 6.0 / CRM 4.0 forced-attack target guardrails:
// - Text such as “This Digimon attacks” is a forced attack against a legal attack target, not always a hardcoded player attack.
// - If the Digimon can’t attack players, but the opponent has a legal Digimon attack target, the forced attack must use/choose a Digimon target instead of fizzling.
// - If both the opponent player and one or more Digimon are legal attack targets, keep a target choice; do not silently choose the player.
// - Do not encode this as DELETE_DIGIMON/BATTLE_DIGIMON unless the printed text says battle; attack-flow runtime handles FORCED_ATTACK_TARGET_CHOICE.
// Round 19V Manual 6.0 / CRM 4.0 cannot-be-attacked guardrails:
// - Text such as “This Digimon can’t be attacked” is protection on that Digimon as an attack target, not STUN and not “this Digimon can’t attack”.
// - Encode temporary chosen-target protection as CANT_BE_ATTACKED with the printed duration. Do not encode it as STUN, CANT_ATTACK, CANT_ATTACK_DIGIMON, DELETE_DIGIMON, or battle redirection.
// - Attack declaration against a protected target must be rejected even if the attacker can attack unsuspended Digimon; prohibiting effects take precedence over enabling effects.
// - Target-changing effects such as Raid/CHANGE_ATTACK_TARGET are separate timing effects and must not be blocked by normal attack-declaration target checks.
// Round 19U Manual 6.0 / CRM 4.0 Raid guardrails:
// - <Raid> triggers when this Digimon attacks and is optional; it may switch the current attack target to 1 opponent unsuspended Digimon with the highest DP.
// - Raid is not limited to attacks declared against a player. It is a target-change effect during attack timing and must continue into Counter/Blocker timing afterward.
// - If multiple opponent unsuspended Digimon tie for highest DP, keep a player choice among only those tied candidates. Suspended Digimon are never legal Raid targets.
// - Do not encode printed Raid as BATTLE_DIGIMON, REQUEST_ATTACK_PLAYER, DELETE_DIGIMON, CHANGE_ATTACK_TARGET, or REDIRECT_ATTACK_TARGET mechanics; runtime attack-flow handles RAID_TARGET_CHOICE.
// Round 19T Manual 6.0 / CRM 4.0 Alliance guardrails:
// - <Alliance> resolves when attacking by suspending 1 of your other Digimon, then adding that Digimon's DP and <Security A. +1> for the attack.
// - The chosen partner must be another unsuspended Digimon that can legally suspend; never offer or resolve a Digimon under "can't suspend" as an Alliance partner.
// - Using Alliance must actually suspend the partner and trigger normal suspension listeners; do not silently flip state.
// - Do not encode Alliance as a generic DP_MOD/static buff without the suspend-choice cost and attack-only duration.
// Round 19S Manual 6.0 / CRM 4.0 Collision guardrails:
// - <Collision> is persistent while attacking: opponent Digimon gain <Blocker>, and the opponent player must block whenever possible during blocker timing.
// - The <Blocker> grant affects Digimon and can be stopped by “unaffected by opponent effects”; the forced-block clause affects the player.
// - Do not treat every unsuspended opponent Digimon as a legal Collision blocker. An unaffected non-Blocker still cannot block; an unaffected native Blocker can.
// - Collision must be evaluated at blocker timing from the current attacker state; if the attacker lost Collision before blocker timing, forced block no longer applies.
// Round 19R Manual 6.0 / CRM 4.0 Evade guardrails:
// - <Evade> is an optional deletion replacement: when this Digimon would be deleted, the player may suspend it to prevent that deletion.
// - Evade can only be offered if the Digimon is unsuspended and can legally suspend; "can't suspend" effects must block Evade.
// - Using Evade suspends the Digimon and should trigger normal "when this Digimon suspends" listeners; do not silently flip isSuspended.
// - Do not encode printed Evade as ON_DELETION/WOULD_BE_DELETED -> PREVENT_LEAVE_PLAY, STUN, or fake SUSPEND_OPPONENT mechanics; runtime protection handles it.
// Round 19Q Manual 6.0 / CRM 4.0 effect-created attack guardrails:
// - Text like “1 of your Digimon attacks a player” or “1 of your Digimon may attack” must bind/select the attacking Digimon; do not let the effect source card attack by default.
// - Follow-up text like “Then, it may attack” must use sameAsPreviousTarget so the Digimon that received the buff/DP is the attacker.
// - Text granted to an opponent Digimon such as “[Start of Your Main Phase] This Digimon attacks.” is delayed forced-attack text, not an immediate REQUEST_ATTACK_PLAYER.
// - If text says “this Digimon may battle/attack your opponent’s Digimon,” use BATTLE_DIGIMON/direct battle choice rather than attack-player request.
// Round 19P Manual 6.0 / CRM 4.0 unsuspended-Digimon condition guardrails:
// - Clauses that say “opponent has no unsuspended Digimon” must encode HAS_DIGIMON owner:"opponent" cardType:"digimon" isUnsuspended:true operator:"==" value:0.
// - Clauses that say “opponent has an unsuspended Digimon” must encode HAS_DIGIMON owner:"opponent" cardType:"digimon" isUnsuspended:true operator:">=" value:1.
// - Never encode unsuspended-Digimon board checks as HAS_TAMER, HAS_TRAIT trait:"unsuspended", SOURCE_COUNT, or plain unfiltered HAS_DIGIMON.
// - Printed Blocker/Rush/Collision/Raid/Vortex keywords remain runtime keywords and must not be converted into fake PREVENT_LEAVE_PLAY/STUN mechanics.
// Round 19O Manual 6.0 / CRM 4.0 Vortex guardrails:
// - <Vortex> is optional: at the end of your turn, this Digimon may attack an opponent's Digimon.
// - Runtime/UI must expose a VORTEX target/skip choice; do not auto-select a target or force the attack.
// - Vortex attacks only opponent Digimon, not players, and the procedure may allow attacking even if the Digimon was played this turn.
// - Do not encode Vortex as MANUAL_REQUIRED, BATTLE_DIGIMON, DELETE_DIGIMON, REQUEST_ATTACK_PLAYER, or a normal Main action; use END_OF_TURN -> VORTEX_ATTACK_REQUEST.
// Round 19N Manual 6.0 / CRM 4.0 Material Save guardrails:
// - <Material Save N> is optional: when this Digimon would be deleted, the player may place up to N valid DigiXros-requirement source cards under 1 of their Tamers.
// - Material Save does not prevent the deletion; after optional save resolves, the Digimon is still deleted normally and On Deletion/Overflow handling continues.
// - Do not auto-apply Material Save during executePhysicalDeletion; runtime/UI must expose a MATERIAL_SAVE/NONE choice.
// - Do not encode Material Save as PREVENT_LEAVE_PLAY, STUN, ON_DELETION cleanup, Armor Purge, Barrier, Fragment, or Fortitude.
// Round 19M Manual 6.0 / CRM 4.0 Fortitude guardrails:
// - <Fortitude> is a mandatory trigger-type keyword effect: when a Digimon with digivolution cards and Fortitude is deleted, play that Digimon without paying the cost.
// - Do not encode or implement Fortitude as WOULD_BE_DELETED, PREVENT_LEAVE_PLAY, STUN, or any deletion-prevention replacement. The Digimon must actually be deleted first.
// - Fortitude should replay the deleted top card from trash after its sources are trashed normally, then trigger On Play for the replayed card.
// - Effects that reference Digimon cards with <Fortitude> must use target.keyword:"Fortitude", never trait:"Fortitude".
// Round 19L Manual 6.0 / CRM 4.0 Partition color/level guardrails:
// - <Partition (A & B)> requires each listed source spec to be present; each ampersand-separated clause represents one source to play.
// - Specs like Yellow Lv.6, Purple/Black Lv.6, or Yellow/Black Lv.6 are color+level specs; slash inside a spec means color OR, not an extra required source.
// - Do not encode Partition as ON_DELETION, PREVENT_LEAVE_PLAY, STUN, or a deletion shield. It plays specified sources before the original card leaves, then the original card still leaves.
// - Partition does not apply when the card leaves by battle or by your own effects.
// Round 19K Manual 6.0 / CRM 4.0 Barrier guardrails:
// - <Barrier> is a battle-deletion replacement with an optional processing condition: by trashing the top security card, prevent that deletion.
// - Runtime/UI must expose a BARRIER protection choice; do not auto-trash security before the player chooses it.
// - Barrier protects only deletion in battle, not effect deletion, rule deletion, leaving by bounce/deck/security, or non-battle deletion.
// - Do not encode Barrier as generic PREVENT_LEAVE_PLAY/STUN/ON_DELETION mechanics; runtime protection handles the battle-only replacement.
// Round 19J Manual 6.0 / CRM 4.0 Armor Purge runtime guardrails:
// - <Armor Purge> is an optional deletion replacement. It trashes only the current top card and the Digimon remains as the next digivolution card.
// - Keep the surviving battle object stable for UI/battle references, but the trashed armor shell must receive a distinct physical instanceId.
// - Do not encode Armor Purge as generic PREVENT_LEAVE_PLAY/STUN/ON_DELETION mechanics; runtime protection handles the replacement.
// Round 19I Manual 6.0 / CRM 4.0 Retaliation guardrails:
// - <Retaliation> is a battle keyword: when this Digimon is deleted after losing a battle, delete the Digimon it battled.
// - Do not encode printed Retaliation as ON_DELETION -> DELETE_DIGIMON; runtime battle resolution handles it only in the losing-battle context.
// - Retaliation is not a trait. Effects that say “Digimon with <Retaliation>” must use target.keyword:"Retaliation", never trait:"Retaliation".
// - Effects that grant Retaliation should use GRANT_KEYWORD buff.keyword:"Retaliation" scoped to the correct Digimon/host.
// Round 19H Manual 6.0 / CRM 4.0 Decoy guardrails:
// - <Decoy (X)> is a would-be-deleted replacement keyword for other matching Digimon deleted by an opponent's effect.
// - X may be colors such as Black, Red/Black, Black/White, or traits/names such as [D-Brigade] trait, [Deva] or [Four Sovereigns] trait. Preserve that scope exactly.
// - Do not encode Decoy as ON_DELETION, WHEN_DIGIVOLVING, WOULD_BE_PLAYED, STUN, or fake PREVENT_LEAVE_PLAY/self-delete mechanics. Runtime handles the opponent-effect deletion replacement.
// - Effects that grant Decoy should grant the full keyword string, e.g. "Decoy (Black/White)", so runtime can parse the protected scope.
// Round 19G Manual 6.0 / CRM 4.0 Jamming guardrails:
// - <Jamming> only prevents deletion in battles against Security Digimon.
// - Do not encode Jamming as PREVENT_LEAVE_PLAY, STUN, WOULD_BE_DELETED, ON_DELETION, or any generic leave/deletion protection.
// - Runtime getKeywords/security-battle resolution handles Jamming; normal battle, DP deletion, and effect deletion must still be able to delete a Jamming Digimon.
// Round 19F Manual 6.0 / CRM 4.0 Fragment guardrails:
// - <Fragment (N)> is a deletion replacement keyword: when this Digimon would be deleted, by trashing any N digivolution cards, it isn't deleted.
// - Do not encode Fragment as ON_DELETION, TRASH_SOURCE main actions, Armor Purge, Decoy, Barrier, or Fortitude.
// - Runtime/protection UI must expose Fragment during deletion prevention and must process source-to-trash movement with ACE Overflow context exactly once.
// Round 19E Manual 6.0 / CRM 4.0 Blast DNA guardrails:
// - [Hand] [Counter] <Blast DNA Digivolve ([A] + [B])> must be encoded as COUNTER -> BLAST_DNA_DIGIVOLVE, not BLAST_DIGIVOLVE and not ordinary DNA_DIGIVOLVE.
// - Blast DNA is a Counter-timing DNA digivolution from hand using two specified materials; preserve dnaMaterials/nameAny and DNA context for "if DNA digivolving" clauses.
// - Blast DNA must trigger When Digivolving/DIGIVOLVED, must not trigger On Play, and must not charge Overflow for the digivolution procedure itself.
// - Frontend/runtime must expose Blast DNA during Counter timing even when no normal one-base Blast Digivolve target exists.
// Round 19D Manual 6.0 / CRM 4.0 Counter/Blast ACE guardrails:
// - [Counter] effects activate only during the official Counter timing, and only one [Counter] effect may be activated per attack.
// - Do not encode ordinary [Main] actions as Counter responses; normal play/use/digivolve actions remain blocked during Counter and Blocker timing.
// - [Hand] [Counter] <Blast Digivolve> must use the dedicated Blast procedure: digivolve from hand for no cost, trigger When Digivolving/DIGIVOLVED, do not trigger On Play, and do not process Overflow for the digivolution itself.
// - Non-Blast [Counter] clauses printed on fielded Digimon should remain trigger COUNTER with their structured actions, not be converted into Blast or MAIN mechanics.
// Round 19C Manual 6.0 / CRM 4.0 ACE Overflow/source-leave guardrails:
// - <Overflow> applies only when an ACE card moves from the battle area or from under a card to an area outside those zones.
// - Do not charge Overflow when an ACE moves from hand/deck/security/trash, when it is placed under another card, or when it is played from source to the battle area.
// - When an ACE digivolution card/source is trashed, returned to hand/deck/security, or otherwise leaves from under a card to a non-battle-area zone, process Overflow exactly once.
// - Burst regression / Armor Purge / Material Save / source-removal helpers must not pre-call Overflow and then also call sendToTrash; avoid double charging.
// Round 19B Manual 6.0 / CRM 4.0 Mind Link guardrails:
// - <Mind Link> is not Appmon Link. Encode it as MIND_LINK, not PLACE_SOURCE, LINK_FROM_HAND, or LINK_SELF_AS_SOURCE.
// - Mind Link places this Tamer as the bottom digivolution card of 1 legal own Digimon only if that Digimon has no Tamer cards in its digivolution cards.
// - A Mind-linked Tamer is a normal digivolution card/source, not a sideways linked card; do not mark it linked and do not count it for Link +N.
// - The source text "[End of All Turns] You may play 1 [Tamer name] from this Digimon's digivolution cards" must be inherited END_OF_ALL_TURNS -> PLAY_FROM_SOURCE with sourceHostSelf.
// - [Start of Your Main Phase] on Tamers is START_OF_MAIN_PHASE, not START_OF_TURN.
// Round 19A Manual 6.0 / CRM 4.0 Appmon linked-trigger guardrails:
// - Text "When this Digimon gets linked" must use THIS_DIGIMON_LINKED, not YOUR_TURN, ALL_TURNS, ON_PLAY, or SECURITY.
// - Text "When any/your Digimon get linked" must use YOUR_DIGIMON_LINKED, and clauses such as "linked to a [Game] trait card" must inspect linkedCard event context.
// - Appmon promo Tamers with [On Play] reveal/search must keep the reveal transaction separate from their linked-trigger memory gain.
// - [Start of Your Main Phase] is START_OF_MAIN_PHASE, not START_OF_TURN; include printed costs such as trashing an [Appmon] card from hand.
// - Effects that care about link cards being trashed must use LINK_CARD_TRASHED, not OPTION_TRASHED_IN_BATTLE_AREA.
// Round 18Z Manual 6.0 / CRM 4.0 App Fusion guardrails:
// - Text that says a Digimon may app fuse must use APP_FUSION, not DNA_DIGIVOLVE, PLAY_FROM_HAND, or PLAY_FROM_HAND_OR_TRASH.
// - App Fusion is a digivolution procedure: consume a legal Digimon card from the specified zone, use a linked Digimon as the base, convert the specified linked card into material above the base, draw 1, and trigger When Digivolving/DIGIVOLVED.
// - App Fusion must not trigger On Play. It also must not treat linked cards as ordinary pre-existing digivolution cards.
// - If a Tamer says app fuse into a card in hand/trash, encode the source zone on APP_FUSION.from and preserve any trait filters on APP_FUSION.target.
// Round 18Y Manual 6.0 / CRM 4.0 Link/Appmon guardrails:
// - Linked cards are not digivolution cards. Do not count them for SOURCE_COUNT, do not trash them with normal TRASH_SOURCE/TRASH_BOTTOM_EVO, and do not treat text that merely says "gets linked" as an active linked card.
// - Printed link instructions must use LINK_FROM_HAND or LINK_SELF_AS_SOURCE, not PLAY_FROM_HAND/PLAY_FROM_TRASH/PLACE_SOURCE.
// - A Digimon normally has only 1 linked card; if a new link exceeds the limit, trash the old linked card. Link +N increases that maximum.
// - When a Digimon in the battle area becomes a linked card, trash that Digimon's digivolution cards.
// - If a linked card's host stops meeting its link requirements, trash that linked card during rule checks.
// Round 18X Manual 6.0 / CRM 4.0 Overclock guardrails:
// - <Overclock ([X] Trait)> is an end-of-turn keyword procedure: delete 1 of your Tokens or 1 other matching [X] trait Digimon as the built-in cost, then this Digimon attacks a player without suspending.
// - Encode printed Overclock as END_OF_TURN -> OVERCLOCK_ATTACK_REQUEST. Do not encode it as MOVE, STUN, REQUEST_ATTACK_PLAYER, or DELETE_OWN_DIGIMON_COST.
// - Tokens deleted as Overclock cost still trigger their [On Deletion] effects and are removed from the game instead of entering trash.
// - Effects that say "If deleted by <Overclock>" must check event context byOverclock/deletedByOverclock, not a board-state HAS_TRAIT or keyword condition.
// Round 18W Manual 6.0 / CRM 4.0 Token preparation guardrails:
// - Text that creates a Token must use PLAY_TOKEN, never PLAY_FROM_HAND / PLAY_FROM_TRASH / PLAY_FROM_SECURITY. Tokens are prepared outside normal zones.
// - Preserve the exact printed token card information: name, color, level/play cost when printed, DP, traits, keywords, and printed token effects.
// - If the text says the opponent/they play a token, encode target.owner:"opponent"; if the token enters suspended, encode suspended:true / enterSuspended:true.
// - Tokens cannot digivolve, cannot have cards placed under them, and when leaving the battle area they are removed from the game rather than moved to hand/deck/security/trash.
// Round 18U Manual 6.0 / CRM 4.0 Piercing + may-battle guardrails:
// - <Piercing> creates pending security-check processing immediately before attack end; do not perform security checks immediately when the battle deletion happens.
// - Only one security-check transition can occur during a single attack; player-attack checks and Piercing checks must not both resolve in the same attack.
// - Text "may battle 1 of your opponent's Digimon" is a direct battle effect. Encode it as BATTLE_DIGIMON, not MOVE and not REQUEST_ATTACK_PLAYER.
// - Direct effect battles do not open normal attack declaration / Counter / Blocker timing and do not automatically create Piercing checks unless the card is currently attacking.
// Round 18O official tournament deck registration guardrails:
// - Bandai Organized Play Tournament Rules Manual (Jun. 6, 2024) says no side decks are permitted.
// - During a BO3 match, players use one registered deck; do not encode or suggest side-deck swapping between games.
// - Deck changes are only allowed before a fresh match starts, not between Game 1/2/3 of the same match.
// Round 18I official setup/re-draw procedure guardrails:
// - A player who declares re-draw returns their entire initial hand to their deck, shuffles that deck, then draws exactly 5 cards for a new initial hand.
// - Re-draw can only happen once per player during setup; do not encode it as a normal DRAW/search effect, and do not place security before both players finish keep/re-draw decisions.
// Round 18H official setup/mulligan-order guardrails:
// - After rock-paper-scissors determines the first player, initial hand re-draw/mulligan declarations are made starting with that first player, then the second player.
// - Do not let the second player declare keep/re-draw before the first player's mulligan decision is locked.
// - Security setup still happens only after both mulligan decisions are complete; the first player still skips the first-turn draw.
// Round 17X Manual 6.0 / CRM 4.0 blocker/security-reveal/BT14-033 guardrails:
// - Do not keep a BLOCKER timing window open when the defender has no legal unsuspended Blocker and no Collision-forced blocker; auto-skip to damage resolution.
// - A checked security card should be visible to players while its Security effect/battle is resolving; do not hide currentSecurityCard from the UI state.
// - BT14-033 Patamon triggers at START_OF_MAIN_PHASE, searches/digivolves from security into a yellow Vaccine Digimon, then only if this effect digivolved may place a yellow Vaccine card from hand at bottom security. Its inherited effect is SECURITY_ADDED once per turn during your turn, not generic YOUR_TURN/START_OF_TURN memory gain.
// Round 17T Manual 6.0 / CRM 4.0 same-effect suspended-count guardrails:
// - Text such as "for each of your opponent's Digimon suspended by this effect" must scale from the actual cards suspended by the current effect.
// - Use amount:{source:"SUSPENDED_BY_THIS_EFFECT", owner:"opponent", target:{cardType:"digimon"}} or repeatForEachSuspendedByThisEffect:true; do not encode fixed GAIN_MEMORY amount:1.
// - Text "You may suspend up to 3 Digimon" is generic any-owner suspend; do not encode it as SUSPEND_OPPONENT unless the printed text says opponent.
// Round 17S Manual 6.0 / CRM 4.0 same-effect added-to-hand-count guardrails:
// - Text such as "for each card added to your hand by this effect" must scale from cards actually moved to hand by the current effect.
// - Use repeatForEachAddedToHandByThisEffect:true or amount:{source:"ADDED_TO_HAND_BY_THIS_EFFECT"}; do not encode count:"all", fixed counts, or HAS_SPECIFIC_CARD/value:"added_to_hand" placeholders.
// - Reveal/search effects that add "all" matching cards from the revealed set should use selection count:"all" (or the reveal maximum) and record the actual added cards before resolving the follow-up.
// Round 17R Manual 6.0 / CRM 4.0 same-effect deleted-level-count guardrails:
// - Text such as "For each level of the Digimon deleted by this effect" must scale from the actual level(s) of Digimon successfully deleted by the current effect.
// - Encode deck trash/recovery/gain-memory quantities with amount:{source:"DELETED_LEVELS_BY_THIS_EFFECT", owner:"opponent", target:{cardType:"digimon"}} or equivalent same-effect deleted-level context.
// - Do not encode a fixed amount, unconditional follow-up, LAST_DELETION_COUNT, or unrelated printed-keyword action such as GRANT_KEYWORD Blocker.
// Round 17Q Manual 6.0 / CRM 4.0 same-effect trashed-count guardrails:
// - Text such as "for each card trashed by this effect" must scale from the actual number of cards successfully trashed by the current effect, including cards trashed as the cost of that effect.
// - Use repeatForEachTrashedByThisEffect:true or amount:{source:"TRASHED_BY_THIS_EFFECT"}; do not encode a fixed number of DELETE_DIGIMON/SUSPEND/TRASH_SOURCE actions.
// - EX4-073 Omnimon Alter-B: the When Attacking cost trashes up to 3 level 6+ sources, then deletes 1 lowest-play-cost opponent Digimon/Tamer once per card actually trashed; trash opponent security only if 3 were actually trashed.
// Round 17P Manual 6.0 / CRM 4.0 same-effect placed-count guardrails:
// - Text such as "for each card placed by this effect" must scale from the actual number of cards successfully placed by the current effect.
// - Do not encode it as a fixed maximum amount such as DE_DIGIVOLVE amount:3. Use repeatForEachPlacedByThisEffect:true or amount:{source:"PLACED_BY_THIS_EFFECT"}.
// - Each repeated follow-up such as <De-Digivolve 1> should resolve as one independent action per placed card; failed/partial placement must reduce the follow-up count.
// Round 17O Manual 6.0 / CRM 4.0 same-effect placed-result guardrails:
// - Text such as "If this effect placed" or "If this effect didn't place" must check the current effect's actual successful placement result.
// - Encode successful-placement follow-ups with condition:{type:"PLACED_BY_THIS_EFFECT"}; add condition.target for the placed card filter and condition.hostTarget for the host filter when printed text requires it.
// - Do not encode placed/not-placed follow-ups as SOURCE_COUNT, HAS_TRAIT, board-state checks, or unconditional follow-up actions.
// Round 17N Manual 6.0 / CRM 4.0 same-effect trash-result guardrails:
// - Text such as "If this effect trashed", "If this effect trashed a [trait] card", or "If this effect didn't trash" must check the current effect's actual cards moved to trash.
// - Encode successful-trash follow-ups with condition:{type:"TRASHED_BY_THIS_EFFECT"}; add condition.target when the printed text requires a trait/name/color/card-type match.
// - Encode did-not-trash follow-ups with NOT_TRASHED_BY_THIS_EFFECT / NOT_TRASHED_OPPONENT_BY_THIS_EFFECT. Do not use MEMORY_COUNT, SOURCE_COUNT, board-state checks, or text placeholders.
// Round 17M Manual 6.0 / CRM 4.0 same-effect return-result guardrails:
// - Text such as "If this effect returned", "If this effect didn't return", or "If no Digimon was returned by this effect" must check the current effect's successful return/move result.
// - Encode those follow-ups with condition:{type:"RETURNED_BY_THIS_EFFECT"} or condition:{type:"NOT_RETURNED_BY_THIS_EFFECT"}; for opponent-Digimon-specific return clauses, use RETURNED_OPPONENT_BY_THIS_EFFECT / NOT_RETURNED_OPPONENT_BY_THIS_EFFECT.
// - Do not encode returned/not-returned follow-ups as MEMORY_COUNT, DP_CHECK, broad board-state checks, or name/trait placeholders.
// Round 17L Manual 6.0 / CRM 4.0 same-effect deletion-failure guardrails:
// - Text such as "If this effect didn't delete" or "If no Digimon was deleted by this effect" must check the current effect's successful deletion result.
// - Encode those follow-ups with condition:{type:"NOT_DELETED_BY_THIS_EFFECT"}; if the text specifically says opponent's Digimon, use condition:{type:"NOT_DELETED_OPPONENT_BY_THIS_EFFECT"}.
// - Do not encode deletion failure as DP_CHECK, MEMORY_COUNT, LAST_DELETION_COUNT, HAS_TRAIT text placeholders, or a broad board-state check.
// Round 17K Manual 6.0 / CRM 4.0 optional generic suspend with level gate guardrails:
// - Text such as "You may suspend 1 level 6 or lower Digimon. If this effect suspended your Digimon..." is still generic any-owner suspend.
// - Encode the suspend as type:"SUSPEND" with target.owner:"any", target.maxLevel:6, and optional:true if printed may.
// - The follow-up must use condition:{type:"SUSPENDED_OWN_BY_THIS_EFFECT"}; do not encode it as SUSPEND_OPPONENT, own-only suspend, HAS_TRAIT:"suspended", or a board-state check.
// Round 17J Manual 6.0 / CRM 4.0 same-effect deletion-result guardrails:
// - Text such as "If this effect deleted one of your Digimon" must require condition:{type:"DELETED_OWN_BY_THIS_EFFECT"}.
// - Do not encode this as HAS_TRAIT text, LAST_DELETION_COUNT, or a broad board-state check; deleting an opponent's Digimon must not satisfy it.
// - "If this effect didn't delete" should use same-effect deletion result context, not DP_CHECK/MEMORY_COUNT placeholders.
// Round 17I Manual 6.0 / CRM 4.0 generic suspend + same-effect own-suspend guardrails:
// - Text exactly like "Suspend 1 Digimon" can target either player's Digimon; encode it as type:"SUSPEND" with target.owner:"any", not SUSPEND_OPPONENT.
// - Follow-ups like "If this effect suspended your Digimon" must require condition:{type:"SUSPENDED_OWN_BY_THIS_EFFECT"}.
// - Do not resolve the follow-up merely because the effect attempted to suspend, and do not treat suspending an opponent's Digimon as satisfying "your Digimon".
// Round 17H Manual 6.0 / CRM 4.0 same-effect played-result guardrails:
// - Text such as "If you played" and "the Digimon/card played by this effect" must be conditioned on the current effect actually playing a card.
// - Encode those follow-ups with condition:{type:"PLAYED_BY_THIS_EFFECT"} and target.playedByThisEffect:true / useLastPlayedByThisEffect:true.
// - Do not reselect by name for "that Digimon" / "the Digimon played by this effect"; a failed play must not let the follow-up affect an older copy already in play.
// Round 17G Manual 6.0 / CRM 4.0 PLACE_SOURCE same-target buff guardrails:
// - Text such as "place this card as the bottom digivolution card of 1 of your Digimon; that Digimon gets +DP" must apply the DP buff to the exact host that received the source.
// - Either keep the DP buff on PLACE_SOURCE.buff for runtime host application, or encode a DP_MOD follow-up with target.sameAsPreviousTarget:true.
// - Do not open a second independent DP_MOD target choice for "that Digimon" wording.
// Round 17F Manual 6.0 / CRM 4.0 same-target buff follow-up guardrails:
// - Text such as "Unsuspend 1 of your Digimon. That Digimon gains <Blocker>" must bind the GRANT_KEYWORD follow-up to the previous target.
// - Encode the follow-up target with sameAsPreviousTarget:true instead of opening a second independent target choice.
// - This applies only to explicit "That Digimon" / "it" same-target wording, not generic follow-ups that choose a new target.
// Round 17E Manual 6.0 / CRM 4.0 same-target follow-up guardrails:
// - Text such as "Suspend 1 ... That Digimon doesn't unsuspend" or "Suspend 1 ... It can't unsuspend" must bind the CANT_UNSUSPEND follow-up to the previous target.
// - Encode the follow-up target with sameAsPreviousTarget:true instead of opening a second independent target choice.
// - Do not apply this to generic wording like "Then, 1 of their Digimon can't unsuspend" unless the text explicitly says that/it/the suspended Digimon.
// Round 17D Manual 6.0 / CRM 4.0 all-scope keyword canonicalization guardrails:
// - Explicit all-scope clauses such as "all of your Digimon with <Blocker>" or "all of your opponent's Digimon get <Security A. -1>" must use target.count:"all".
// - Printed keyword filters such as <Blocker> or <Reboot> must use target.keyword / target.keywordAny, not trait:"Blocker" or trait:"Reboot".
// - Security effects that say "Unsuspend all ... and they get ..." must make both actions all-scope with the same keyword filter.

// Round 17C Manual 6.0 / CRM 4.0 missing Main-effect guardrails:
// - A card can have both [Main] and [Security] effects. Do not drop the [Main] mechanics just because a Security mechanic exists.
// - BT5-103 style text "all of your Digimon with <Reboot> get +1000 DP and <Blocker>" must be MAIN actions targeting keyword:"Reboot", count:"all".
// - Keep duration "until the end of your opponent's next turn" as OPPONENTS_END_OF_TURN when the effect is activated on your turn.

// Round 17B Manual 6.0 / CRM 4.0 all-scope buff guardrails:
// - Printed text like "All of your [X] Digimon gain/get ..." must target all matching cards with target.count:"all".
// - Do not encode all-scope static or inherited buffs as count:1; that only affects one Digimon and can silently miss the rest.
// - Keep "1 of your" effects as count:1; this guardrail is only for explicit all-scope clauses.

// Round 16Z Manual 6.0 / CRM 4.0 printed Reboot guardrails:
// - Printed <Reboot> is a keyword handled by the unsuspend-phase runtime: during the opponent's unsuspend phase, the Reboot Digimon unsuspends.
// - Do not generate END_OF_TURN mechanics with HAS_TRAIT/Reboot -> UNSUSPEND. That fires at the wrong timing and may target the wrong Digimon.
// - Pure printed keywords should remain in card text and be read by getKeywords()/keyword runtime, not duplicated as fake structured actions.

// Round 16Y Manual 6.0 / CRM 4.0 same-name Tamer play restriction guardrails:
// - Text such as "This effect can't play cards with the same name as any of your Tamers" must add target.noSameNameAsOwnTamer:true to the relevant PLAY_FROM_* action.
// - Keep the printed card type: "Tamer card with [X] in its text" must be cardType:"tamer" with textContains:"X", not cardType:"digimon" or nameContains.
// - Keep the printed source zone: "from your trash" must be PLAY_FROM_TRASH, not PLAY_FROM_HAND.

// Round 16X Manual 6.0 / CRM 4.0 modal-choice guardrails:
// - Text such as "Activate 1 of the effects below" or "You may activate 1 of the effects below" must be encoded as MODAL_CHOICE/ACTIVATE_ONE_OF.
// - Do not emit the listed branches as sequential actions; that incorrectly resolves every branch.
// - If text says "If you have [X], activate all of the effects below instead", use mutually exclusive conditions: all-branch when X is true, MODAL_CHOICE branch when X is false.

// Round 16W Manual 6.0 / CRM 4.0 self static target guardrails:
// - Static clauses that say "this Digimon gains <Keyword>" must bind to target.self:true, even if the card name/trait seems unique.
// - Do not encode these as target.trait/name such as "Creep Hands" or "Horn Striker"; multiple copies or naming mismatches can leak or miss.
// - D-Reaper ADR self static effects such as ADR-05/ADR-06 are self buffs, not global trait buffs.

// Round 16V runtime atomic zone-move guardrails:
// - Any card moved to trash must first be removed from its current direct zone, especially battleArea.
// - Rule deletion / DP-zero deletion must not leave the same instanceId in both battleArea and trash.
// - sendToTrash should be idempotent with callers that already spliced the card from its source zone.

// Round 16V Manual 6.0 / CRM 4.0 total-value feasible-target runtime guardrails:
// - For total DP / total play-cost selections, the target window must only include cards whose individual value is <= the total limit.
// - If no non-empty legal selection can be made, the action fizzles and the effect continues; do not leave an impossible pendingChoice open.
// - This is separate from the Round 16S rule that legal non-empty choices cannot submit [] when at least one feasible target exists.

// Round 16U Manual 6.0 / CRM 4.0 implicit self-target guardrails:
// - Text such as "this Digimon gains <Keyword>", "this Digimon gets +N DP", "this Digimon can't...", or "then, this Digimon may attack" must bind to the effect host with target.self:true.
// - Do not omit target on GRANT_KEYWORD for self buffs; the runtime treats no target as AOE.
// - Do not encode self DP buffs as target:{owner:"own", count:1}; that opens an illegal player target choice.

// Round 16T Manual 6.0 / CRM 4.0 total play-cost selection canonicalization:
// - Text such as "return up to 14 play cost's total worth" or "whose play costs add up to X or less" must use target.selection:"total_play_cost" plus target.totalPlayCost:X/maxTotalPlayCost:X.
// - Do not encode the X value as target.count; count is target quantity, while totalPlayCost is the summed play-cost limit.
// - For removal/return/delete total-play-cost effects, use count:"all" or omit count after setting totalPlayCost.

// Round 16O Manual 6.0 / CRM 4.0 total-DP selection guardrails:
// - Text such as "choose any number of opponent Digimon whose total DP adds up to X or less" or "delete any Digimon with DP adding up to X" must use target.selection:"total_dp" and target.totalDp:X.
// - Do not encode the X value only as maxDp; maxDp is a per-card ceiling, while totalDp is a summed multi-target limit.
// - Runtime should open a multi-target choice, reject selections whose summed DP exceeds the limit, and apply the action only to selected legal cards.

// Round 16N Manual 6.0 / CRM 4.0 same-effect DNA postcondition guardrails:
// - Text such as "If this effect DNA digivolved" must add condition:{ type:"DIGIVOLVE_CONTEXT", dna:true } to the follow-up action(s), e.g. Recovery +1.
// - Do not let the follow-up action fire merely because the effect attempted DNA_DIGIVOLVE; it must only fire after the DNA_DIGIVOLVE action in the same structured effect successfully resolved.
// - Do not encode this condition as MEMORY_COUNT or a global once/counter flag.

// Round 16M Manual 6.0 / CRM 4.0 immunity/effect activation guardrails:
// - Text such as "isn't affected by your opponent's effects" or "none of your [X] are affected by your opponent's Digimon's effects" must be UNAFFECTED_BY_OPPONENT_EFFECTS, not PREVENT_LEAVE_PLAY.
// - Text such as "none of your opponent's Digimon can activate [On Play] effects" must be EFFECT_ACTIVATION_LOCK/CANT_ACTIVATE_EFFECT with timing:"ON_PLAY", not STUN.
// - Immunity and activation locks are rule-layer gates. They do not mean the target can't attack, and they do not only protect against leaving play.

// Round 16L Manual 6.0 / CRM 4.0 PLAY_FROM_SOURCE total-play-cost guardrails:
// - Text such as "play up to 12 play cost's total worth of [X] cards from this Digimon's digivolution cards" must be PLAY_FROM_SOURCE with from:"source", sourceHostSelf:true, target.selection:"total_play_cost", and target.totalPlayCost:N.
// - Do not encode this as PLAY_FROM_HAND_OR_TRASH or an unbound source scan; it must only look under the effect host.
// - Conditional text "If DNA digivolving" must use condition:{ type:"DIGIVOLVE_CONTEXT", dna:true }, not MEMORY_COUNT.

// Round 16K Manual 6.0 / CRM 4.0 DigiXros/Assembly material guardrails:
// - DigiXros materials may come from hand and/or battle area as specified by the rule text; do not restrict material lookup to battle area only.
// - When a battle-area material is placed under a card for DigiXros/Assembly, place only that material card itself. Cards that were under that material are trashed and must not be carried over under the new host.
// - Token Digimon cannot be used as materials to be placed under another card, and tokens cannot receive Assembly/source attachments.
// - Assembly/DigiXros material placement is not Link and must not fire THIS_DIGIMON_LINKED/YOUR_DIGIMON_LINKED.

// Round 16J Manual 6.0 / CRM 4.0 can't-suspend guardrails:
// - Text saying a Digimon or Tamer "can't suspend" must be encoded as CANT_SUSPEND, not STUN, CANT_UNSUSPEND, PREVENT_LEAVE_PLAY, or SUSPEND_OPPONENT.
// - CANT_SUSPEND prevents becoming suspended for attacks, blocks, costs, and effects while active; it does not automatically suspend the target and it does not mean "can't unsuspend".
// - If text says "can't suspend or activate [Timing] effects", encode both CANT_SUSPEND and EFFECT_ACTIVATION_LOCK/CANT_ACTIVATE_EFFECT separately.

// Round 16I Manual 6.0 / CRM 4.0 source-count binding guardrails:
// - Conditions such as "one of your [X]s has N or more digivolution cards" must be encoded as SOURCE_COUNT with hostTarget:{ name:"X" }, not HAS_SPECIFIC_CARD.
// - Conditions such as "with a Tamer card in its digivolution cards would digivolve into this card" must use SOURCE_COUNT with scope:"base_source" and sourceTarget:{ cardType:"tamer" }.
// - Conditions such as "this Digimon has [X] in its digivolution cards" should use SOURCE_COUNT with sourceTarget, bound to this/sourceCard stack; do not scan the whole field.
// - Do not use HAS_TRAIT/HAS_TAMER to mean a card inside a digivolution stack unless the scope is explicitly a SOURCE_COUNT/sourceTarget condition.

// Round 16H Manual 6.0 / CRM 4.0 Link/source attachment guardrails:
// - LINK_FROM_HAND and LINK_SELF_AS_SOURCE must preserve explicit link/asLink metadata when routed through PLACE_SOURCE-style source attachment choices.
// - <Mind Link> places the Tamer itself as a linked card under a legal Digimon; do not encode it as choosing a random Digimon card to PLACE_SOURCE.
// - Linking is not ordinary play. Do not encode link actions as PLAY_FROM_HAND/PLAY_FROM_TRASH/PLAY_FROM_SOURCE.
// - Token Digimon cannot receive linked cards or ordinary source attachments.
// - When a linked card is replaced or trashed, clear its linkedTo/linked state and fire source/link removal events; ordinary PLACE_SOURCE must not trigger link state.

// Round 16G Manual 6.0 / CRM 4.0 total play cost selection guardrails:
// - Text such as "choose any number of your opponent's Digimon whose play costs add up to X or less" must be encoded as target.selection:"total_play_cost" with totalPlayCost/maxTotalPlayCost:X.
// - Do not encode the X value as target.count, and do not encode it as per-card maxCost unless the text says "1 Digimon with play cost X or less".
// - Runtime must allow multi-target selection, reject selections whose summed playCost exceeds the limit, and then apply the action only to selected legal cards.

// Round 16F Manual 6.0 / CRM 4.0 AOE target-scope guardrails:
// - AOE runtime actions still must respect cardType/owner/trait/name selectors. A battle-area array may contain Tamers/support cards, so "all of your Digimon" must never affect Tamers.
// - Do not implement GRANT_KEYWORD/STUN/DP_MOD AOE by scanning name/type/fullText manually; use the same cardMatchesTarget selector path as single-target actions.
// - Trait-gated AOE effects must use real traitTokens only and must not match effect text pollution or support cards that merely share text/name fragments.

// Round 16E Manual 6.0 / CRM 4.0 security-check compatibility guardrails:
// - Security A.+N and Security A.-N are numeric modifiers and must stack together before calculating final security checks. Do not keep only the first +N or first -N.
// - Continuous/source/face-up-security clauses that grant Security A.+/- must be evaluated live like DP/keyword static effects, not converted into stale permanent turn effects.
// - A Delicate Plan-style text suppresses only checked Option card [Security] effects. It must not suppress Digimon/Tamer Security effects, and a suppressed checked Option still goes to trash unless another non-suppressed effect moves it.
// - <Jamming> prevents deletion by Security Digimon battle only; it does not suppress Security effects or stop the checked security card from leaving the security stack.
// - <Piercing> uses the final stacked security-check count and must still obey the single security-check transition rule for the attack.

// Round 16C Manual 6.0 / CRM 4.0 delayed action guardrails:
// - Delayed actions remain normal effect actions at their scheduled timing; action.condition must be preserved and re-checked when the delayed action resolves.
// - If SCHEDULE_DELAYED_ACTION carries target/condition on the wrapper while action.action only stores the delayed type, copy those fields into the delayed action.
// - Targeted delayed actions such as DELETE_DIGIMON must open/use the correct delayed target selector and must never fall back to deleting the source card.

// Round 16B Manual 6.0 / CRM 4.0 self-target guardrails:
// - Phrases such as "this Digimon gets/gains", "this card", or "it" are self references, not trait/name selectors.
// - Encode self buffs/restrictions as target:{ owner:"own", cardType:"digimon", self:true, count:1 }, never trait:"this" or trait:"this Digimon".
// - Do not open a normal target-choice window for mandatory self buffs; runtime should apply the effect directly to the source/host card.

// Round 16A Manual 6.0 / CRM 4.0 static condition zone guardrails:
// - Continuous static text such as "While you have [Neptunemon]" must check cards in play/battle area only.
// - Do not satisfy these conditions from breeding area, security stack, or digivolution/link sources unless the printed text explicitly references that zone.
// - Face-up security cards can provide static effects, but cards in security must not satisfy the provider's "while you have [X]" condition.

// Round 15Z Manual 6.0 / CRM 4.0 token field-rule guardrails:
// - Token Digimon can be prepared/played by effects, but tokens cannot digivolve.
// - Cards cannot be placed under Token Digimon as digivolution cards or Link cards.
// - When a Token is removed from the field, remove it from the game instead of putting it into trash, hand, deck, security, or other zones.
// - Do not encode token leaving as ordinary SEND_TO_TRASH/BOUNCE/RETURN_TO_DECK/SEND_TO_SECURITY movement.

// Round 15Y Manual 6.0 / CRM 4.0 face-up security static clause guardrails:
// - Face-up security [Security] [All Turns] continuous text must be interpreted clause-by-clause, not as one combined paragraph.
// - Unconditional grants such as "All of your blue or yellow [TS] trait Digimon gain <Blocker>" must remain active even if a later "While you have [Neptunemon] or [Venusmon]" clause is not satisfied.
// - Conditional grants such as Alliance from Abyss Sanctuary: Throne Room must require the named condition and must accept alternatives inside the same while-clause as OR.
// - Do not restore legacy full-text keyword scanning for face-up security cards.

// Round 15W Manual 6.0 / CRM 4.0 static text scope guardrails:
// - Static effect target/condition matching must use card identity metadata only: name/nameTokens/traits/traitTokens.
// - Do not use full effectText/searchText to decide whether a card has a bracketed trait/name for continuous static effects or "while you have [X]" conditions.
// - A card that merely mentions [TS], [Mother D-Reaper], etc. in its effect text must not satisfy [TS] trait targets or "while you have [Mother D-Reaper]" checks.

// Round 15V Manual 6.0 / CRM 4.0 token preparation guardrails:
// - Effects that say "play [X] Token" must be encoded as PLAY_TOKEN, never PLAY_FROM_HAND/PLAY_FROM_TRASH/PLAY_FROM_SOURCE/PLAY_FROM_SECURITY.
// - Token cards are prepared outside normal zones; they are not selected from hand, trash, deck, security, or source.
// - Preserve token printed information (name, color, level/cost/DP/traits/keywords) in action.token, and preserve amount/amountSource for multi-token effects.

// Round 15U Manual 6.0 / CRM 4.0 token amount runtime guardrails:
// - PLAY_TOKEN actions must honor printed amount and amountSource; do not collapse multi-token effects to a single token.
// - Effects such as "play 2 Diaboromon Tokens" or "for each of your opponent's Digimon, play 1 Familiar Token" must encode amount/amountSource and runtime must create that many token Digimon.
// - Token Digimon entering by an effect should enter battle area as Digimon, receive unique instanceIds, and broadcast the normal played-by-effect context.

// Round 15T Manual 6.0 / CRM 4.0 breeding regression guardrails:
// - When a card has both ordinary timing text and [Breeding] timing text, only the [Breeding] clause may receive breedingOnly:true and activate in the breeding area.
// - Do not rely on broad full-card text scanning to activate ordinary WHEN_DIGIVOLVING/MAIN/OPPONENT_ATTACKED mechanics while the host is in breeding.
// - Moving from breeding to battle must trigger [When Moving] after the card reaches battle area, but must not count as [On Play].

// Round 15S Manual 6.0 / CRM 4.0 [Breeding] scope guardrails:
// - Any effect clause that begins with [Breeding] must be encoded with breedingOnly:true so it only functions while the provider/host is in the breeding area.
// - Source effects that begin with [Breeding] must also be isInherited:true and must require the host Digimon to be in breeding; they must not activate from a battle-area stack.
// - Do not duplicate [Breeding] attack-listener text as battle-area OPPONENT_ATTACKED mechanics; use the BREEDING bridge/runtime gate instead.

// Round 15R Manual 6.0 / CRM 4.0 RETURN_TO_DECK cost / Digi-Egg deck guardrails:
// - Costs that say return cards from trash or digivolution cards to the bottom of the Digi-Egg deck must be encoded as RETURN_TO_DECK with from:"trash_or_source", destination:"eggDeck", position:"bottom", and a real target selector.
// - Do not encode Digi-Egg deck returns as normal deck returns. Do not omit target/textContains selectors such as [Negamon] in its text.
// - Returning a digivolution card to a deck is source removal, not trashing; runtime must broadcast SOURCE_REMOVED and place the card in eggDeck/deck according to printed text.

// Round 15Q Manual 6.0 / CRM 4.0 Piercing processing guardrails:
// - <Piercing> triggers when an attacking Digimon deletes an opponent's Digimon in battle, but the security-check transition is pending until immediately before the attack ends.
// - Do not generate or restore card mechanics that immediately call security checks from a battle deletion; keep Piercing in the runtime attack pipeline.
// - During a single attack, only one security-check transition can occur. If the attack already successfully transitioned to a player security check, pending Piercing checks are not performed.

// Round 15P Manual 6.0 / CRM 4.0 Decode selector guardrails:
// - <Decode (...)> is handled by the runtime replacement layer when the Digimon would leave the battle area other than in battle. Do not generate ON_DELETION or ordinary PLAY_FROM_SOURCE mechanics for Decode.
// - Decode selectors may be exact names ([Aegiomon]), name alternatives ([Betamon])/([ModokiBetamon]), color+level selectors (Red/Black Lv.3), or trait+level selectors (Lv.6 or lower w/[Aqua]/[Sea Animal] in any trait).
// - Decode plays one matching card from that Digimon's digivolution cards before the original card continues leaving; it does not prevent the original leave unless card text explicitly says so.

// Round 15O Manual 6.0 / CRM 4.0 2026-04-17 processing-order guardrails:
// - For the official listed cards whose text changed from "gain memory and <Draw 1>" to "<Draw 1> and gain memory", emit DRAW before GAIN_MEMORY.
// - Affected IDs: BT6-087, BT6-088, BT8-028, BT8-092, BT9-092, BT11-092, BT11-095, BT13-102, BT17-052, EX1-069, EX2-017, EX2-045, RB1-032.
// - Do not apply this blindly to effects with intervening conditions such as BT17-089 Rhythm; preserve printed conditional ordering there.
// Round 15N Manual 6.0 / CRM 4.0 DUAL split-information guardrails:
// - When a DUAL card is referenced as a Digimon card, only the Digimon-side information above the traits may satisfy color/trait/effect matching.
// - When a DUAL card is referenced as an Option card, only the Option-side information below the traits may satisfy color/trait/effect matching, except broad "card with X in its text" effects can reference all information.
// - Do not copy Digimon-side traitTokens into optionTraitTokens/dualOptionTraitTokens unless the lower Option information explicitly has that trait metadata.
// - DUAL Option use must check Option-side color requirements, not Digimon-side color requirements.

// Round 15M Manual 6.0 / CRM 4.0 DUAL Option-side scope guardrails:
// - DUAL Option-side [Main] text stored in sourceEffect must only be encoded once as trigger:"MAIN" with dualOptionSide:true.
// - Do not also emit an ordinary MAIN mechanic for the same Option-side text, even with Use Requirement as a condition; this causes double resolution when the DUAL is used as an Option.
// - Do not mark DUAL Option-side [Main] text as isInherited:true; a DUAL card under a Digimon does not grant its Option-side text as an inherited effect.
// - Digimon-side effects above the traits and Option-side effects below the traits must remain separated by runtime scope.

// Round 15L Manual 6.0 / CRM 4.0 DUAL use/Arts guardrails:
// - DUAL cards can be referenced by add/search effects as Digimon or Option cards, but they have no play cost and can't be played by generic PLAY_FROM_* effects.
// - A DUAL card's Option-side [Main] text is stored in sourceEffect by the current data feed; encode it as trigger:"MAIN" with dualOptionSide:true so it only resolves when the card is used as an Option.
// - Do not let a normal hand drag/drop or PLAY_FROM_HAND/PLAY_FROM_TRASH/PLAY_FROM_SOURCE put a DUAL card into the battle area. It may only be used as an Option, then optionally Arts Digivolve through the dedicated DUAL procedure.
// - Arts Digivolve is not the same as activating the Option-side [Main] effect by another effect; it is only available when the DUAL card is actually used as an Option card and must still obey digivolution requirements and bonus draw timing.
// - DUAL Option-side Use Requirement text such as "Use Requirement: DATA SQUAD trait" must be checked before use; do not treat it as normal card trait targeting or ignore it as flavor text.

// Round 15K Manual 6.0 / CRM 4.0 DUAL card guardrails:
// - DUAL cards must be targetable as Digimon cards or Option cards when an effect references that card category; they are not Tamers.
// - When a DUAL card is stacked on top of a card on the field, it is treated as a Digimon.
// - When used as an Option card, check the Option-side color requirement; do not rely on the Digimon-side color.
// - Do not encode DUAL as a fake trait or as separate duplicate cards; preserve type:"dual" and let runtime type matching handle it.

// Round 15J Manual 6.0 compound trait/name/color alternatives guardrails:
// - Never encode alternatives such as "Hybrid or Ten Warriors" as one trait string; use traitAny for pure trait alternatives.
// - Mixed alternatives such as "Night Claw or 2-color", "Three Musketeers or Option", or "Blocker or Reboot" must use anyOf with separate trait/color/cardType/keyword clauses.
// - Printed keyword alternatives are keyword/keywordAny, not trait/traitAny; level phrases such as "level 4 or lower" are maxLevel/minLevel filters.
// - Keep owner/cardType/count as shared target fields and place only the differing official predicates inside anyOf.

// Round 15I Manual 6.0 HAS_SPECIFIC_CARD condition-scope guardrails:
// - HAS_SPECIFIC_CARD must not use a trait field as a dumping ground for card names, event phrases, or source-count phrases.
// - Exact named cards in play use name/nameAny; cards with X in their name use nameContains/nameContainsAny.
// - Clauses about cards in this Digimon's digivolution cards use SOURCE_COUNT with filters, not HAS_SPECIFIC_CARD.trait.
// - Clauses about cards being added/removed from security use SECURITY_ADDED/SECURITY_REMOVED triggers with TURN_PLAYER/EVENT_CONTEXT, not HAS_SPECIFIC_CARD.trait.
// - Clauses about having no Digimon with sources use HAS_DIGIMON with minSourceCount and operator/value.

// Round 15H Manual 6.0 color-vs-trait mechanics guardrails:
// - Color words such as red/blue/yellow/green/black/purple/white are card color properties, not traits.
// - Clauses like "blue Tamer", "red Digimon", or "red or yellow card" must use color/colorAny, not trait/traitAny.
// - Mixed alternatives such as "red or has the [Legend-Arms] trait" should use anyOf with separate color and trait alternatives.
// - "multicolored" must be represented as a color property flag such as multicolor:true, never as trait:"multicolored".

// Round 15G Manual 6.0 mechanics target-reference guardrails:
// - A mechanics target/condition field named trait must only be used for official traits/forms/types.
// - Exact bracketed card-name references like [Palmon], [Mimi Tachikawa], [Agumon] or [Gabumon] must use name/nameAny, not trait/traitAny.
// - Clauses that say "with [X] in its name" must use nameContains/nameContainsAny. Clauses that say "with [X] in its text" must use textContains/textContainsAny.
// - HAS_TRAIT should not be used for checking whether a named Tamer/Digimon/Option is in play; use HAS_SPECIFIC_CARD or HAS_TAMER/HAS_DIGIMON with name/nameAny.

// Round 15F Manual 6.0 card metadata guardrails:
// - Existing cards.json metadata must not store exact card-name references from bracketed rules text as traitTokens/traits.
// - Store bracketed text references in effectBracketTokens/search text, while traitTokens remains only official trait/form/type metadata.
// - Deck-builder trait/keyword search should use traitTokens/effectBracketTokens/printed keywords, not arbitrary full effect text as if it were trait metadata.

// Round 15E Manual 6.0 target matching / text-reference guardrails:
// - target.trait must mean an official trait/form/type token, not arbitrary bracket text from mainEffect/sourceEffect/searchText.
// - Clauses that say "with [X] in its text" must use target.textContains / target.inText, not target.trait.
// - Clauses that say "with [X] in its name" must use target.nameContains, not target.trait.
// - fetch-cards must not copy every bracket token from card text into traitTokens; keep text-only references separate from real traits.

// Round 15D Manual 6.0 security-to-hand cost event guardrails:
// - Costs such as "By adding your top security card to the hand" must still move that exact security card to hand through ADD_SECURITY_TO_HAND with position/from preserved.
// - The runtime must broadcast SECURITY_REMOVED and CARD_ADDED_FROM_SECURITY_TO_HAND / OWN_CARD_ADDED_TO_HAND context with byCost:true so cards watching hand-add/security movement receive accurate context.
// - Do not hardcode top security when printed text says bottom security; preserve position:"top"/"bottom" on the cost.

// Round 15C Manual 6.0 checked Option Security suppression guardrails:
// - Effects such as A Delicate Plan grant a target Digimon text saying checked Option [Security] effects do not activate.
// - Store that granted text on the temporary effect as text/effectText/buff.text so the security-check runtime can suppress only checked Option cards.
// - Do not suppress Security Digimon battles or non-Option security cards; the restriction applies only to Option cards checked by that Digimon.

// Round 15B Manual 6.0 text-scope guardrails:
// - Do not rely on combined effectText to decide active battle-area keywords/static effects; fetch-cards stores mainEffect + sourceEffect together.
// - A top-level Digimon/Tamer/Option in the battle area uses its main/card text only; its sourceEffect applies only while it is a digivolution/link source.
// - Inherited/source text should not grant Security A., Blocker, Rush, DP, attack restrictions, or activation locks to the same card while it is the top card.
// - When regenerating data, keep mainEffect and sourceEffect scopes separate so runtime helpers can apply official zone/timing rules.

// Round 15A Manual 6.0 printed keyword-only cleanup guardrails:
// - Pure printed keywords such as <Blocker>, <Rush>, <Jamming>, <Piercing>, <Reboot>, <Barrier>, <Decoy>, <Vortex>, <Raid>, etc. are read by runtime keyword/replacement layers.
// - Do not generate fake ON_PLAY / WHEN_BLOCKING / WHEN_ATTACKING / ALL_TURNS GRANT_KEYWORD mechanics for a card whose text only contains printed keyword lines and reminder text.
// - Timed clauses such as "[When Digivolving] <Blitz>" are not keyword-only text; keep their printed timing semantics separate from pure always-on keywords.
// Round 14Z Manual 6.0 attack restriction gate guardrails:
// - Effects that create CANT_ATTACK, CANT_ATTACK_PLAYER, or CANT_ATTACK_DIGIMON are attack-declaration restrictions, not display-only keywords.
// - "can't attack players" blocks attacks declared at a player/security, but still allows legal attacks on Digimon unless another restriction applies.
// - "can't attack" blocks every attack target before the attacker suspends or attack timing opens.
// - True continuous restrictions such as "[Your Turn] This Digimon can't attack players" should stay as runtime static text/mechanics and be evaluated live at declaration time.

// Round 14Y Manual 6.0 PLACE_SOURCE cost guardrails:
// - Clauses that say "By placing ... as this Digimon's digivolution card" may be encoded as cost:{type:"PLACE_SOURCE"}; the engine can now pay this cost atomically before resolving the effect.
// - Always include an explicit source zone when possible: from:"trash", from:"hand", from:"hand_or_trash", from:"battle_area_or_trash", from:"source", or from:"security".
// - Put attach position in position:"top"/"bottom" and source zone in from/zone; do not overload position:"trash" when regenerating new data.
// - If the cost places cards under the source Digimon, omit attachToTarget; if it places under another Digimon, provide attachToTarget.

// Round 14X Manual 6.0 Condition placement / security compare guardrails:
// - Do not put conditions inside action.target.condition; the resolver evaluates action.condition and mechanic.condition.
// - Clauses like "when your/opponent's security stack is removed from" use SECURITY_REMOVED; never add SECURITY_COUNT < 0 as a proxy for the removal event.
// - Clauses like "if your security is less than or equal to your opponent's" use SECURITY_COUNT_COMPARE with left:"own", operator:"<=", right:"opponent", not SECURITY_COUNT <= 0.

// Round 14W Manual 6.0 Current-option face-up security guardrails:
// - Option cards that say "place this card face up as the top/bottom security card" must use PLACE_THIS_CARD_AS_SECURITY, not generic SEND_TO_SECURITY.
// - The current Option card may already be in trash after being used; the action must move that same source card into security.
// - "Add your top/bottom security card to the hand" before that clause is ADD_SECURITY_TO_HAND with the printed position.
// - "Play ... from your hand with the play cost reduced by N" must not become free play; set free:false and costReduction:N on the PLAY_FROM_HAND action.
// Round 14V Manual 6.0 Reveal selected-consumer sweep guardrails:
// - If a card says reveal/search top cards and choose/play/add/place a card "among them", the selected card must never be consumed from hand/trash by a follow-up action.
// - For reveal-to-hand clauses, prefer REVEAL_AND_SELECT with then: "ADD_SELECTED_TO_HAND" and no separate generic ADD_TO_HAND choice from normal zones.
// - If old data keeps a follow-up PLAY_FROM_* / PLACE_SOURCE / SEND_TO_SECURITY consumer, it must include from: "revealed" and rest cleanup must happen after the selected consumer.
// - TRASH_REVEALED_REST / RETURN_REVEALED_REST must only process unselected cards and must not clear pendingReveal before selected PLAY/PLACE consumers run.

// Round 14U Manual 6.0 Reveal selected-consumer cleanup guardrails:
// - Reveal/search effects that say "play ... among them" must keep the selected card in the revealed buffer and make the following PLAY_FROM_* consume from: "revealed".
// - Reveal/search effects that say "place ... among them as a digivolution card/source" must use then: "PLACE_SELECTED_AS_SOURCE" and make the following PLACE_SOURCE consume from: "revealed".
// - Reveal/search effects that say "place ... among them in security" must use then: "PLACE_SELECTED_AS_SECURITY" and make the following SEND_TO_SECURITY consume from: "revealed".
// - Do not let post-reveal consumers choose unrelated cards from hand/trash/battle area unless the printed text explicitly says from those zones.

// Round 14T Manual 6.0 Security current-card cleanup guardrails:
// - Security effects that say "Add this card to your/the hand" must use ADD_CURRENT_SECURITY_TO_HAND, not generic ADD_TO_HAND or ADD_SECURITY_TO_HAND.
// - Security effects that say "Play this card without battling/without paying the cost" must use PLAY_FROM_SECURITY, not PLAY_FROM_HAND, PLAY_FROM_TRASH, or PLAY_FROM_HAND_OR_TRASH.
// - Security effects that play a different named/trait card from hand/trash should keep PLAY_FROM_HAND_OR_TRASH, and only the later "add this card" clause becomes ADD_CURRENT_SECURITY_TO_HAND.
// - Checked security cards live in counterTiming.currentSecurityCard until consumed by ADD_CURRENT_SECURITY_TO_HAND, PLAY_FROM_SECURITY, battle, or trash cleanup.

// Round 14S Manual 6.0 Event-semantics cleanup guardrails:
// - [All Turns]/[Your Turn]/[Opponent's Turn] followed by "When an attack target is switched/changed" must use ATTACK_TARGET_CHANGED, not a static trigger.
// - "When your security stack is removed from" must use SECURITY_REMOVED with a TURN_PLAYER condition if the printed timing is [Your Turn]/[Opponent's Turn].
// - "When this/one of your Digimon deletes an opponent's Digimon in battle" must use DELETED_OPPONENT_IN_BATTLE; the engine broadcasts this to the controller's battle area.
// - "When an opponent's Digimon is deleted" must use OPPONENT_DIGIMON_DELETED.
// - "When one of your Digimon attacks a player" must use OWN_DIGIMON_ATTACKED_PLAYER; "when an opponent's Digimon attacks" must use OPPONENT_ATTACKED or OPPONENT_ATTACKED_PLAYER.
// - Do not park these event clauses on ALL_TURNS/YOUR_TURN/OPPONENTS_TURN just because the printed text begins with a turn label.

// Round 14R Manual 6.0 Security-from-hand / security-to-hand cleanup guardrails:
// - "By adding your top security card to the hand" is ADD_SECURITY_TO_HAND as a cost/action, not PLACE_SOURCE.
// - "Place 1 [trait] card from your hand face up as the bottom security card" is PLACE_SECURITY_FROM_HAND, not SEND_TO_SECURITY and not PLACE_SOURCE.
// - Royal Base effects that exchange top security with a hand card must preserve order: ADD_SECURITY_TO_HAND first when printed first; PLACE_SECURITY_FROM_HAND first when printed as a cost.
// - Security added/removed and card-added-to-hand events must fire from these helpers.

// Round 14Q Manual 6.0 Static-like Trigger Cleanup guardrails:
// - Printed keyword reminder text must not become ALL_TURNS/YOUR_TURN/OPPONENTS_TURN fake GRANT_KEYWORD mechanics.
// - "When attack targets change" must use ATTACK_TARGET_CHANGED.
// - "When this Tamer suspends" must use OWN_TAMER_SUSPENDED/TAMER_SUSPENDED, not ALL_TURNS.
// - "When Tamer/cards are placed in digivolution cards" must use SOURCE_PLACED.
// - "When effects trash cards from under this Tamer" must use SOURCE_TRASHED/TRASHED_FROM_SOURCE.
// - "When a card is added to security" must use SECURITY_ADDED, and "when security is removed" must use SECURITY_REMOVED.
// - "When one of your Digimon activates Digi-Burst" must use DIGI_BURST_ACTIVATED.

// Round 14P Manual 6.0 Deleted / Hand-added / Source-trashed Event Cleanup guardrails:
// - "When one of your Digimon is deleted" is OWN_DIGIMON_DELETED, not YOUR_TURN/ALL_TURNS.
// - "When an opponent's Digimon is deleted" is OPPONENT_DIGIMON_DELETED; DP-zero-only cases need byDpZero context/condition.
// - "When an effect adds a card/cards to your hand" is OWN_CARD_ADDED_TO_HAND / CARD_ADDED_TO_HAND, not a static aura.
// - "When a card returns from trash to hand" should use CARD_ADDED_FROM_TRASH_TO_HAND when the source zone matters.
// - "When effects trash digivolution/source/link cards" is TRASHED_FROM_SOURCE / SOURCE_TRASHED / LINK_CARD_TRASHED, not ALL_TURNS static.
// - Do not generate DELETED_EVENT_HARNESS, HAND_ADDED_HARNESS, SOURCE_TRASHED_HARNESS, or fake YOUR_TURN DP/keyword actions for these clauses.

// Round 14O Manual 6.0 Static Audit False-positive / Runtime Keyword Cleanup guardrails:
// - Printed keywords and replacement keywords already handled by runtime layers must not be emitted solely to silence missing-mechanics/audit checks.
// - Do not encode pure printed keywords such as <Blocker>, <Reboot>, <Armor Purge>, <Barrier>, <Decoy>, <Scapegoat>, <Fortitude>, <Decode>, or <Partition> as fake ALL_TURNS/ON_PLAY GRANT_KEYWORD actions.
// - Continuous clauses like "[Your Turn] This card gets...", "This Digimon is also treated as...", "This Digimon is unblockable", and "all of your Digimon gain..." remain runtime static clauses and should not be converted into temporary turnEffects.
// - "can't/don't unsuspend" is CANT_UNSUSPEND, never PREVENT_LEAVE_PLAY. Attach it to the printed trigger when the sentence is part of an On Play/When Digivolving effect.
// - Inherited "[When Attacking] ... gets/gains ... for the turn" effects must stay WHEN_ATTACKING inherited triggers, not YOUR_TURN static auras.

// Round 14N Manual 6.0 Attack-player / Tamer-suspend Trigger Layer guardrails:
// - "When one of your Digimon attacks a player" is OWN_DIGIMON_ATTACKED_PLAYER, not YOUR_TURN.
// - "When an opponent's Digimon attacks a player" is OPPONENT_ATTACKED_PLAYER, not OPPONENTS_TURN.
// - Tamer suspension is not the same event as Digimon suspension. Encode "when your effects suspend a Tamer" as OWN_TAMER_SUSPENDED.
// - Effects that suspend this Tamer as a cost should keep that as a structured SUSPEND cost and resolve from the event trigger.
// - Do not generate ATTACK_PLAYER_HARNESS, TAMER_SUSPEND_HARNESS, or fake static YOUR_TURN DP/keyword actions for these clauses.

// Round 14M Manual 6.0 Remaining Static-like Timing Cleanup guardrails:
// - Do not encode printed keyword text such as ＜Jamming＞, ＜Reboot＞, ＜Blocker＞, Armor Purge, Barrier, Raid, Collision, or Alliance as fake ALL_TURNS/ON_PLAY harness actions. The runtime keyword/replacement layer reads printed keyword text.
// - [Your Turn]/[All Turns] followed by a true "When ..." clause must use the event trigger (DIGIMON_SUSPENDED, DIGIMON_UNSUSPENDED, SECURITY_REMOVED, ATTACK_TARGET_CHANGED, DELETED_OPPONENT_IN_BATTLE, etc.) plus any turn restriction, not a static timing trigger.
// - Temporary buffs printed under [On Play]/[When Digivolving]/[When Attacking]/[On Deletion] must stay on those printed timings and may be duplicated across printed timings instead of being parked on ALL_TURNS.
// - True continuous static clauses using "while", "this Digimon gains/gets", "all of your", "your other", or "players can't" remain runtime static effects and should not be flagged as card-action bugs.

// Round 14L Manual 6.0 Mixed De-Digivolve / Delete guardrails:
// - On mixed cards, do not let one De-Digivolve clause contaminate separate normal delete clauses.
// - Encode each printed De-Digivolve clause as DE_DIGIVOLVE with its printed amount and target only.
// - Normal deletes such as "delete lowest play cost", "delete level 4 or lower", and "delete play cost 3 or less" remain DELETE_DIGIMON.
// - Never encode De-Digivolve as DELETE_DIGIMON, TRASH_SECURITY_STACK, or TRASH_BOTTOM_EVO.
// - Armor Purge/Barrier/Decode replacement keywords stay in runtime helpers and must not create ON_DELETION pseudo-cost actions.

// Round 14K Manual 6.0 Attack Keyword / Battle-flow guardrails:
// - Raid, Collision, Alliance, Jamming, Piercing, Blocker, and Vortex are attack-flow/runtime keywords, not generated harness actions.
// - Raid is optional and must open a choice among opponent unsuspended Digimon tied for highest DP; never auto-retarget to an arbitrary card.
// - Collision gives opponent Digimon Blocker for that attack and forces a legal block, but the defender chooses among legal blockers when multiple exist.
// - Alliance must stay optional, suspend the chosen ally as the cost, and grant DP plus Security A. +1 only until END_OF_ATTACK.
// - Jamming prevents deletion only in battles against Security Digimon; it does not prevent normal battles, effect deletion, or DP<=0 rule checks.
// - Piercing performs security checks after deleting an opponent Digimon in battle and surviving, but it does not win through an empty security stack by itself.
// - Do not generate RAID_HARNESS, COLLISION_HARNESS, ALLIANCE_HARNESS, JAMMING_HARNESS, PIERCING_HARNESS, or BLOCKER_HARNESS as card actions.

// Round 14J Manual 6.0 Effect Lock / Immunity Scope Layer guardrails:
// - Encode "can't activate [Timing] effects" as CANT_ACTIVATE_EFFECT / EFFECT_ACTIVATION_LOCK on the affected card/player scope, not STUN or PREVENT_LEAVE_PLAY.
// - Encode "unaffected by opponent effects" as UNAFFECTED_BY_OPPONENT_EFFECTS runtime immunity, not generic leave prevention.
// - Option-use locks, Security-effect locks, and timing-specific activation locks must be checked before queue entry and must not block costs, battle deletion, or DP<=0 rule checks.
// - Provider auras such as "none of your [trait] Digimon are affected by opponent effects" must apply live to matching cards only while the provider remains in battle/security.
// - Do not generate EFFECT_LOCK_HARNESS, IMMUNITY_HARNESS, OPTION_LOCK_HARNESS, SECURITY_LOCK_HARNESS, STUN_AS_LOCK, or PREVENT_LEAVE_AS_IMMUNITY.

// Round 14I Manual 6.0 Effect-play / Option-use Timing guardrails:
// - [Your Turn]/[All Turns] followed by "When you play...", "When your Digimon are played or digivolve", or "When you use an Option" is an event trigger with a turn restriction, not a continuous aura.
// - Encode own play watchers as OWN_DIGIMON_PLAYED; if the text says played or digivolve, also encode DIGIVOLVED.
// - Encode Option-use watchers as OPTION_USED / OPPONENT_OPTION_USED and keep Option-use locks separate from the trigger.
// - Encode "a card is added to your security stack" as SECURITY_ADDED, not YOUR_TURN.
// - Encode link event clauses as THIS_DIGIMON_LINKED or YOUR_DIGIMON_LINKED; do not leave them on YOUR_TURN/ALL_TURNS.

// Round 14H Manual 6.0 Replacement / Prevention Timing Layer guardrails:
// - Effects that say "When this Digimon would be deleted... prevent that deletion" are replacement timing, not YOUR_TURN/ALL_TURNS static auras.
// - Encode deletion replacement as WOULD_BE_DELETED + PREVENT_LEAVE_PLAY with its cost/context; Barrier remains battle-deletion only.
// - Encode non-battle leave replacement such as Decode/Partition/source-play prevention as WOULD_LEAVE_BATTLE_AREA; the original card still leaves unless the text explicitly says it does not.
// - Decoy protects only other matching Digimon from opponent-effect deletion; Scapegoat excludes deletion by your own effects.
// - Do not generate generic YOUR_TURN/ALL_TURNS PREVENT_LEAVE_PLAY for Barrier, Armor Purge, Decode, Partition, Decoy, Scapegoat, or Fortitude.

// Round 14G Manual 6.0 Triggered Timing Cleanup guardrails:
// - [Your Turn] / [Opponent's Turn] / [All Turns] followed by "When ..." is a triggered effect with a turn restriction, not a continuous static aura.
// - Encode "When this Digimon becomes unsuspended" as DIGIMON_UNSUSPENDED, not YOUR_TURN.
// - Encode "When one of your Digimon/Tamers becomes suspended" as DIGIMON_SUSPENDED with suitable target/condition metadata, not YOUR_TURN/ALL_TURNS.
// - Encode "When your security stack is removed from" as SECURITY_REMOVED and "deletes an opponent's Digimon in battle" as DELETED_OPPONENT_IN_BATTLE.
// - Keep only true always-on clauses such as "While...", "This Digimon gains...", and "All of your... gain..." on YOUR_TURN/OPPONENTS_TURN/ALL_TURNS.

// Round 12V Manual 6.0 Static / Continuous Effect Stacking Matrix guardrails:
// - Static/continuous auras are rule-layer runtime logic, not generated card actions.
// - DP aura, keyword aura, your-turn/opponent-turn/all-turns timing, trait/color/name filters, and face-up security static effects must be evaluated live.
// - Continuous bonuses must not materialize stale permanent turnEffects; changing turn player or removing the provider must immediately change results.
// - Static effects, effect locks, immunity, and face-up security providers must keep distinct scopes and remain covered by regression tests.
// - Do not generate STATIC_STACKING_HARNESS, CONTINUOUS_EFFECT_HARNESS, DP_AURA_HARNESS, or KEYWORD_AURA_HARNESS as card actions.

// Round 12U Manual 6.0 Targeting / Selection / PendingChoice v3 guardrails:
// - Targeting/selection v3 is a rule-layer pending choice contract, not a generated card action.
// - Multi-target choices must support up to X, choose any number, total play cost/DP limits, and lowest/highest selection rules.
// - Illegal selections must not clear the pending window; the correct player must be able to retry.
// - Mandatory choices with no legal candidate must fizzle safely and never deadlock the engine/UI.
// - Do not generate TARGET_SELECTION_V3_HARNESS, PENDING_CHOICE_V3_HARNESS, or MULTI_TARGET_HARNESS as card actions.

// Round 12T Manual 6.0 Cost System Finalization / Rollback guardrails:
// - Structured costs are rule-layer transactions, not generated harness actions.
// - Required composite costs must be atomic: if any later cost part fails, earlier paid costs must roll back.
// - Optional costs may fail without failing the effect, but they must not leave partial state changes.
// - Cost-paid trash/security/source movement must preserve byCost/byEffect context and continue using the 12Q/12R trigger matrices.
// - Do not generate COST_ROLLBACK_HARNESS, COST_TRANSACTION_HARNESS, or OPTIONAL_COST_HARNESS as card actions.

// Round 12S Manual 6.0 Reveal / Search / Multi-Slot Selection v3 guardrails:
// - Reveal/search selection is a rule-layer transaction, not a generated harness action.
// - Multi-slot reveal selections must prevent the same revealed card from satisfying multiple slots unless a card physically exists twice.
// - Mandatory slots must not deadlock when no legal revealed candidate exists; optional/up-to selection must stay legal and deterministic.
// - Revealed rest top/bottom deck order must follow engine convention: deck[0] bottom, deck[last] top.
// - Do not generate REVEAL_SELECTION_HARNESS, SEARCH_V3_HARNESS, or MULTI_SLOT_REVEAL_HARNESS as card actions.

// Round 12R Manual 6.0 Source / Digivolution Card Trigger Matrix guardrails:
// - Source placement/removal/play/return is a unified rule-layer trigger matrix, not a generated harness action.
// - SOURCE_PLACED / SOURCE_REMOVED / SOURCE_MOVED contexts must preserve host, position, destination, linked/source boundary, byCost/byEffect, and batch metadata.
// - Linked cards and normal digivolution cards are both stack cards, but linked cards must preserve __linked metadata and link limits.
// - Playing from source must first remove the source from the host, then enter battle area and trigger PLAYED_FROM_SOURCE/ON_PLAY once.
// - Do not generate SOURCE_MATRIX_HARNESS, DIGIVOLUTION_SOURCE_HARNESS, or LINK_SOURCE_BOUNDARY_HARNESS as card actions.

// Round 12Q Manual 6.0 Trash / Discard / Deck-Mill Trigger Matrix guardrails:
// - Trash/discard/deck-mill/source-trash is a unified rule-layer trigger matrix, not a generated harness action.
// - Cards trashed from deck, hand, source, security, battle area, costs, effects, battle, and rule checks must preserve fromZone/cause/byCost/byEffect/batch metadata.
// - Legacy triggers TRASHED_FROM_DECK, OWN_CARD_TRASHED_FROM_DECK, OWN_HAND_TRASHED_BY_EFFECT, OPPONENT_HAND_TRASHED_BY_EFFECT, and OPPONENT_SOURCE_TRASHED remain valid.
// - General CARD_TRASHED / OWN_CARD_TRASHED / OPPONENT_CARD_TRASHED watcher windows must batch multi-card trash events so OPT effects do not double-trigger.
// - Do not generate TRASH_MATRIX_HARNESS, DISCARD_MATRIX_HARNESS, or DECK_MILL_HARNESS as card actions.

// Round 12P Manual 6.0 Security Removed / Security Checked Trigger Matrix guardrails:
// - SECURITY_REMOVED and SECURITY_CHECKED are trigger windows with context, not generated harness actions.
// - Security removed context must preserve cause, destination, byCheck/byEffect/byCost, face-up status, and batch metadata.
// - Multi-card security removal must batch triggers so once-per-turn watchers only queue once per timing.
// - SECURITY_CHECKED belongs to the attacking side/watchers and must include attacker, defender, and checked security card context.
// - Do not generate SECURITY_TRIGGER_MATRIX_HARNESS, SECURITY_REMOVED_MATRIX_HARNESS, or SECURITY_CHECKED_MATRIX_HARNESS as card actions.

// Round 12O Manual 6.0 Security Battle / Security Option Resolution guardrails:
// - Checked Security cards are removed from the security stack before effects resolve; cleanup must not fire SECURITY_REMOVED twice.
// - Security Options/Tamers that say "activate this card's [Main] effects" must execute that card's own Main effect, then go to trash unless the effect moves them elsewhere.
// - Security Digimon battles do not make the checked Security Digimon activate On Deletion; they go to trash after battle resolution.
// - Remaining security checks must stop if the attacking Digimon is deleted by a Security Digimon battle.
// - Do not generate SECURITY_BATTLE_HARNESS, SECURITY_OPTION_HARNESS, or SECURITY_DIGIMON_ON_DELETION_HARNESS as card actions.

// Round 12N Manual 6.0 Security Recovery / Face-Up Security Static Effects guardrails:
// - Recovery and security placement must preserve official top/bottom order and optional face-up metadata.
// - Face-up security static effects are rule-layer runtime logic and should apply only while the card remains face-up in security.
// - SECURITY_REMOVED triggers must also allow face-up security watchers to react when another security card leaves.
// - NO_FACE_UP_SECURITY / FACE_UP_SECURITY_COUNT are condition helpers, not generated card actions.
// - Do not generate SECURITY_RECOVERY_HARNESS, FACE_UP_STATIC_HARNESS, or NO_FACE_UP_SECURITY_HARNESS as card actions.

// Round 12M Manual 6.0 Security Stack / Face-Up Security guardrails:
// - Security stack top/bottom convention is rule-layer runtime logic: security[0] is bottom and the last element is top.
// - Face-up security cards must preserve faceUpSecurity/isFaceUpSecurity metadata until they leave the security stack.
// - SECURITY_REMOVED triggers must fire when a card leaves security by check, add-to-hand, trash, or search effects.
// - Checked security cards must stay in currentSecurityCard until Security effects or security battle cleanup finish.
// - Do not generate SECURITY_STACK_HARNESS, FACE_UP_SECURITY_HARNESS, or SECURITY_REMOVED_HARNESS as card actions.

// Round 12L Manual 6.0 Player / Digimon / Tamer / Option Effect Lock Matrix guardrails:
// - Effect-lock matrix behavior is rule-layer runtime logic, not generated card actions.
// - Player-wide, Digimon-only, Tamer-only, Option-use, Security-effect, and breeding-area locks must keep distinct scopes.
// - Option-use locks such as "your opponent can't use Option cards" must be checked before color-requirement/legal-use selection.
// - Security-effect locks must block SECURITY timing before queue entry; breeding-area locks must only apply to cards actually in breeding.
// - Activation locks must not block costs, battle deletion, DP<=0 rule checks, or other rule-layer processing.
// - Do not generate EFFECT_LOCK_MATRIX_HARNESS, PLAYER_LOCK_HARNESS, OPTION_USE_LOCK_HARNESS, or SECURITY_LOCK_HARNESS as card actions.

// Round 12K Manual 6.0 On Play Suppression / Effect Activation Lock guardrails:
// - Effect activation locks are rule-layer checks, not generated card actions.
// - Locks like "none of your opponent's Digimon can activate [On Play] effects" must prevent the matching effect before it enters the effect queue.
// - Timing-specific locks must stay narrow: [On Play] locks should not block [When Digivolving] unless the text says all effects.
// - Card-type scope matters: Digimon-only locks must not block Tamer/Option effects.
// - Memory-gated locks must be evaluated from the controller's perspective.
// - Do not generate EFFECT_LOCK_HARNESS, ACTIVATION_LOCK_HARNESS, or ON_PLAY_SUPPRESSION_HARNESS as card actions.

// Round 12J Manual 6.0 Immunity / Unaffected guardrails:
// - Unaffected / immunity is a target-filter and effect-prevention rule layer, not a generated card action.
// - Opponent effects must be blocked before they delete, DP-modify, bounce, return, de-digivolve, suspend, or trash sources from an immune Digimon.
// - Immunity to opponent effects must not block battle deletion, rule-check deletion such as DP <= 0, costs, or the card owner's own effects.
// - Specific protections like can't be deleted/returned/de-digivolved by opponent effects must stay narrower than full unaffected.
// - Do not generate IMMUNITY_HARNESS, UNAFFECTED_HARNESS, or CANT_BE_AFFECTED_HARNESS as card actions.
// Round 12I Manual 6.0 Special Evolution Requirement / Hybrid / Warp guardrails:
// - Hybrid/Tamer digivolution and ignore-digivolution-requirements are runtime rule overrides, not generated test actions.
// - Normal level/color digivolution requirements must remain enforced unless card text/action explicitly ignores them.
// - Hybrid evolution from Tamers must preserve the Tamer as source and preserve the host instanceId.
// - Special digivolution cost/no-cost text must be handled before payment; keep focused regression tests.
// - Do not generate SPECIAL_EVOLUTION_HARNESS, HYBRID_HARNESS, WARP_HARNESS, or IGNORE_REQUIREMENT_HARNESS as card actions.
// Round 12H Manual 6.0 App Fusion / DigiXros / Assembly guardrails:
// - App Fusion, DigiXros, and Assembly are special material procedures; runtime helpers must preserve material order and source metadata.
// - DigiXros must validate named materials, calculate [DigiXros -N] reduction before removing the hand card, and never remove the hand card if cost cannot be paid.
// - App Fusion must remove the fusion card from hand, place the target as material, mark appFusion context, and trigger the correct entry timing once.
// - Assembly places selected hand/battle materials under the target without treating the source as played; keep focused regression tests.
// - Do not generate APP_FUSION_HARNESS, DIGIXROS_HARNESS, ASSEMBLY_HARNESS, or SPECIAL_MATERIAL_HARNESS as card actions.
// Round 12G Manual 6.0 Overclock / Appmon linked-trigger guardrails:
// - Overclock is an end-of-turn attack procedure: delete a valid Token/other matching-trait Digimon, then attack a player without suspending.
// - Linking must fire host-only "this Digimon gets linked" triggers separately from global/Tamer "your Digimon get linked" triggers.
// - Link up to N, linked DP/App Link DP, and get-linked triggers must stay runtime/test harness features, not generated harness actions.
// - Do not generate OVERCLOCK_HARNESS, APPMON_LINK_HARNESS, LINK_TRIGGER_HARNESS, or APP_LINK_DP_HARNESS as card actions.
// Round 12F Manual 6.0 Link / linked-card runtime guardrails:
// - Link is a runtime rule layer distinct from normal digivolution-source placement; linked cards should be marked and counted separately.
// - A Digimon normally has a maximum of 1 linked card; Link +N increases that maximum and excess linked cards are trashed.
// - Linked cards may contribute Link DP and linked/source effects, and they go to trash when the linked Digimon leaves the battle area.
// - Do not generate LINK_HARNESS, LINK_RUNTIME_HARNESS, or LINK_TEST_SCENARIO as card actions.

// Round 12E Manual 6.0 ACE / Blast DNA counter timing guardrails:
// - Blast DNA Digivolve is a Counter timing procedure, not a card-generation harness; never emit BLAST_DNA_HARNESS as a mechanic.
// - Normal Blast Digivolve and Blast DNA Digivolve must remain separate runtime paths because Blast DNA needs two materials and DNA context.
// - Counter timing must pause/continue correctly after Blast or Blast DNA if effects or pending windows open.
// - Overflow remains per-card leave-play/source-leave processing and must not recursively double-count ACE cards.

// Round 12D Manual 6.0 start-phase timing guardrails:
// - Manual coverage must track Official Rule Manual for Web Ver. 6.0 when manual.pdf is the 20-page web PDF.
// - Start of Turn / Start of Opponent's Turn effects occur during the Unsuspend Phase before unsuspending.
// - Reboot unsuspends during the opponent's Unsuspend Phase; normal opponent cards must not unsuspend there.
// - Draw Phase must skip only the first player's first turn; moving from breeding is not playing and can attack that turn.
// - Start of Main Phase is a timing window, not a card action; never generate START_PHASE_HARNESS or MANUAL_60_DELTA as mechanics.

// Round 12C end-phase timing guardrails:
// - End of Turn and End of All Turns are rule-layer timing windows, not card actions; never generate END_PHASE_HARNESS or TURN_CLEANUP_HARNESS actions.
// - passTurn must pause if End of Turn effects open pending windows such as Vortex attacks, then resume only after cleanup.
// - Temporary effects must expire by explicit duration; do not blanket-clear all turnEffects at the start of a new turn.
// - OPPONENTS_END_OF_TURN delayed actions and effects must wait for the opponent's end turn, with focused regression coverage.

// Round 12B rule-check / On Deletion cascade guardrails:
// - DP<=0 rule deletion is a rule-layer cascade, not a card mechanic; never generate RULE_CHECK_HARNESS or ON_DELETION_CASCADE_HARNESS actions.
// - Rule-check deletions must collect all affected Digimon before resolving On Deletion so simultaneous triggers share one timing window.
// - On Deletion from rule checks must use turn-player priority and must not double-trigger for the same deleted card.
// - Cards removed by rule checks should leave the battle area before triggers and enter trash after the trigger batch resolves; cascade checks need focused tests.

// Round 12A simultaneous-trigger priority guardrails:
// - Simultaneous trigger batching is a rule-layer runtime concern, not a card mechanic; never generate SIMULTANEOUS_TRIGGER_HARNESS or PRIORITY_HARNESS actions.
// - triggerEffect must not auto-resolve while inside beginTriggerBatch/endTriggerBatch; effects should be queued first, then sorted.
// - Turn-player effects must resolve before non-turn-player effects for the same timing, with stable order within each player.
// - Future rule-check cascades and optional simultaneous effects must add focused regression tests before changing priority behavior.
// Round 11Z option/color/delay guardrails:
// - Option use is a rule-layer action and must enforce official color requirements unless the card/effect explicitly ignores them.
// - A public matching-color Digimon/Tamer, including an eligible breeding-area Digimon/Egg, can satisfy an Option card's color requirement.
// - Delay Options placed in the battle area cannot activate on the same turn they were placed; activation trashes the Delay card as the cost.
// - Security effects that place Delay Options in the battle area must clear the currentSecurityCard buffer and not leak into later checks.
// - Do not generate OPTION_HARNESS, COLOR_REQUIREMENT_HARNESS, or DELAY_HARNESS as card actions.
// Round 11Y replacement/protection keyword guardrails:
// - Barrier, Armor Purge, Evade, Fortitude, Decoy, Material Save, Partition, and Decode are rule-layer keywords; keep them in runtime helpers and tests.
// - Partition must not be encoded as Armor Purge/deletion prevention; it plays specified sources before non-battle, non-own-effect leave-play and the original still leaves.
// - Decoy protects only from opponent-effect deletion, not battle deletion or own-effect deletion.
// - Material Save moves source cards under a Tamer before deletion and does not prevent the deleted Digimon from leaving.
// - Do not generate REPLACEMENT_HARNESS, PROTECTION_HARNESS, MATERIAL_SAVE_HARNESS, PARTITION_HARNESS, or DECODE_HARNESS as card actions.
// Round 11X advanced attack keyword guardrails:
// - Collision, Raid, Alliance, and Vortex are attack-flow keywords; keep them in engine/runtime tests, not generated harness actions.
// - Raid must only retarget to opponent Digimon, never Tamers or hidden zones.
// - Collision's temporary Blocker grants must expire at END_OF_ATTACK and forced blocks must still use normal Blocker timing.
// - Alliance must allow both choose and skip paths; choosing suspends the ally, adds DP, and grants Security A. +1 only for that attack.
// - VORTEX_ATTACK_REQUEST must dispatch to requestVortexAttack(), target opponent Digimon only, and not permanently clear playedThisTurn.
// - Do not generate COLLISION_HARNESS, RAID_HARNESS, ALLIANCE_HARNESS, or VORTEX_HARNESS as card actions.
// Round 11W attack/security keyword scenario guardrails:
// - Attack/security keyword coverage is infrastructure and regression testing, not card mechanics.
// - executePendingAttack must use getSecurityChecks() so Security Attack +N and -N share one source of truth.
// - Jamming, Piercing, Blocker, Counter timing, direct attack, and zero-check attacks must remain covered by deterministic tests.
// - Do not generate ATTACK_HARNESS, SECURITY_HARNESS, or TEST_SCENARIO as card actions.
// Round 11V official-manual coverage guardrails:
// - Keep manual-rule-coverage-11v.json and manual-rule-coverage-11v.md as the engine gap map against manual.pdf.
// - Manual coverage checklists are infrastructure only; never generate MANUAL_COVERAGE, RULE_CHECKLIST, or GAP_MAP card mechanics.
// - Any official-rule gap promoted from partial/gap to covered/tested must add a focused regression test before changing status.
// - Priority gaps from the manual map should drive future rounds before adding speculative card mechanics.
// Round 11U one-click regression guardrails:
// - The project must keep npm test wired to test-all.js so audit, syntax checks, game-over tests, and Socket.IO integration can run together.
// - test-all.js must fail if audit-report.json contains any non-empty bucket.
// - Local regression scripts are infrastructure only; never generate TEST_ALL, REGRESSION_RUNNER, or npm-test card mechanics.
// - New live-playtest fixes should add or update a focused regression test and keep it included in the one-click command suite.
// Round 11T true Socket.IO integration-test guardrails:
// - Online regression must be runnable with real Socket.IO clients for P1, P2, and spectator, not only static contract checks.
// - True integration tests must verify role-private gameStart/gameResumed/gameStateUpdate payloads with hidden zones preserved as counts.
// - Reconnect/resume tests must prove the same guest resume token returns to the original seat without stealing another seat.
// - Surrender/rematch tests must prove spoofed playerId is ignored, gameOver metadata is emitted, and rematch returns the room to staging.
// Round 11S game-over/result UX guardrails:
// - Game over state should be finalized through a central helper with winner/loser/reason metadata for clients.
// - Result/rematch UI is player-flow UX, not a card mechanic; never generate GAME_OVER or REMATCH as card actions.
// - Finished matches must disable gameplay controls and hide pending overlays while still preserving final board visibility.
// - Rematch must reset a finished room to staging and require both players to ready again; do not reuse stale GameState.
// Round 11R surrender / concession guardrails:
// - Surrender is a player action, not a card mechanic; never generate SURRENDER as a card action.
// - Server must derive surrendering player from socket seat and reject spectators/spoofed playerId.
// - Surrender may be submitted during pending windows and must immediately set gameOver/winner and clear transient pending state.
// - Frontend must require a confirmation before emitting surrender.
// Round 11Q online socket contract guardrails:
// - Live-match gameStart/gameResumed/gameStateUpdate must use role-private payloads, never raw room.game broadcasts.
// - Socket event contracts should be regression-testable: P1, P2, and spectator receive different safe views.
// - Room IDs must be normalized on every room/action event before reading rooms[].
// - Unknown or wrong-socket gameplay actions must reject before mutating GameState.
// Round 11O online-action permission guardrails:
// - Server action dispatch must derive the actor role from the socket seat, not from submitted playerId.
// - Spectators must be rejected for all gameplay actions even if the frontend hides controls.
// - Turn-player actions must be blocked during pendingTarget/pendingReveal/pendingChoice/pendingProtection and counter/block windows.
// - Pending submissions must only be accepted from the pending owner; counter and blocker responses only from the defender.
// Round 11N frontend-room privacy guardrails:
// - Server gameState payloads must be private per recipient: only the seated player sees their own hand.
// - Spectators must receive masked hand/deck/egg/security zones with counts preserved, never real card IDs.
// - Deck order, Digi-Egg deck order, and security contents should not be exposed in socket payloads.
// - GameStart/gameStateUpdate should use the same privacy sanitizer so refresh/reconnect cannot leak hidden zones.
// Round 11H production-stability guardrails:
// - SESSION_SECRET, COOKIE_SECURE, ALLOWED_ORIGINS, MAX_ROOMS, and Discord OAuth config must be env-driven for deployment.
// - Local development must still work without HTTPS cookies; production should use secure/httpOnly session cookies.
// - Discord OAuth routes must fail safely with 503 when env vars are missing instead of redirecting with undefined credentials.
// - Server room/player inputs should be normalized/sanitized, and server.js should be importable for smoke tests without auto-listening.
// Round 11G live-playtest guardrails:
// - Spectators receiving gameStart must remain spectators; never infer them as p2 just because they are not p1.
// - Server staging actions such as toggleReady/switchRole must verify socket ownership, not trust a submitted role.
// - Switching seats must not remove a player from their current seat if the destination seat is occupied.
// - Spectator UI may render a board view but must not reveal either player's hand or submit gameplay actions.
// Round 11F frontend-UX guardrails:
// - Frontend must clearly render pendingTarget/pendingReveal/pendingChoice/pendingProtection/Counter/Blocker status.
// - Spectators must not be able to submit gameplay actions or interact with pending overlays.
// - Reveal multi-select UI should preserve selected order and show selected slots.
// - Protection UI must render every supported protection option key, not only Evade/Armor Purge.
// - Breeding [Main] and Delay activations need explicit UI entry points.
// Round 11E UI/server pending-choice guardrails:
// - Server must preserve null/array payloads for submitChoice/submitRevealChoice; do not coerce with || because skip choices are valid.
// - Modal choices are label-based pendingChoice entries and may have no card image; UI must render them as text buttons.
// - Canceling a Blast Digivolve targeting flow after submitting BLAST must not also send a BYPASS counter response.
// - All pending flows should remain visible/submittable: pendingTarget, pendingReveal, pendingChoice, pendingProtection, Counter/Blast, Delay, and Breeding activation.

// ==================== 你原来的 Schema v1.1（完整版） ====================
const mechanicsSchema = {
    type: "array",
    description: "Digimon TCG 卡牌完整效果逻辑列表。必须按照官方规则语义输出，只能使用白名单 trigger/action。Reveal 检索类效果必须支持单选择槽与多选择槽。",
    items: {
        type: "object",
        properties: {
            trigger: {
                type: "string",
                description: "必须使用以下值: MAIN, WOULD_BE_PLAYED, WOULD_DIGIVOLVE, DIGIVOLVED, ON_PLAY, WHEN_DIGIVOLVING, WHEN_ATTACKING, ON_DELETION, SECURITY, START_OF_TURN, END_OF_TURN, END_OF_ATTACK, ALL_TURNS, YOUR_TURN, OPPONENTS_TURN, BREEDING, WHEN_BLOCKING, WHEN_MOVING, SECURITY_REMOVED, PLAYED_FROM_SOURCE, OPPONENT_SOURCE_TRASHED, TRASHED_FROM_DECK, OWN_CARD_TRASHED_FROM_DECK, PLAYED_BY_EFFECT, OPPONENT_PLAYED_DIGIMON, OPPONENT_ATTACKED, OPPONENT_ATTACKED_PLAYER, ATTACK_TARGET_CHANGED, ATTACK_BLOCKED, OPTION_TRASHED_IN_BATTLE_AREA, DELETED_OPPONENT_IN_BATTLE, OWN_HAND_TRASHED_BY_EFFECT, OPPONENT_HAND_TRASHED_BY_EFFECT, DIGIMON_SUSPENDED, DIGIMON_UNSUSPENDED, OPPONENT_DIGIMON_SUSPENDED, OWN_DIGIMON_UNSUSPENDED, CARD_TRASHED, TRASHED, OWN_CARD_TRASHED, OPPONENT_CARD_TRASHED, TRASHED_FROM_HAND, TRASHED_FROM_SOURCE, TRASHED_FROM_SECURITY, END_OF_ATTACK"
            },

            isOncePerTurn: {
                type: "boolean",
                description: "如果卡文包含 [Once Per Turn]，填 true；否则 false。"
            },

            isInherited: {
                type: "boolean",
                description: "如果是进化源效果/Inherited Effect，填 true；否则 false。"
            },

            condition: {
                type: ["object", "null"],
                description: "发动条件。没有条件时填 null。",
                properties: {
                    type: {
                        type: "string",
                        description: "只能使用: MEMORY_COUNT, SECURITY_COUNT, HAS_TAMER, HAS_TRAIT, HAS_KEYWORD, IS_SUSPENDED, HAND_COUNT, DP_CHECK, COLOR_CHECK, LEVEL_CHECK, HAS_SPECIFIC_CARD, SOURCE_COUNT, TRASH_COUNT, HAS_DIGIMON, TURN_PLAYER, DIGIXROSING"
                    },
                    owner: {
                        type: "string",
                        description: "own, opponent, any"
                    },
                    operator: {
                        type: "string",
                        description: ">, >=, <, <=, =, ==, !=, or, and"
                    },
                    value: {
                        type: ["integer", "string"]
                    },
                    trait: {
                        type: "string"
                    },
                    color: {
                        type: "string"
                    },
                    name: {
                        type: "string"
                    }
                }
            },

            cost: {
                type: ["object", "null"],
                description: "发动代价。没有代价时填 null。",
                properties: {
                    type: {
                        type: "string",
                        description: "只能使用: MEMORY, SUSPEND, TRASH_HAND, TRASH_SECURITY, PLACE_SOURCE, RETURN_TO_DECK, ADD_SECURITY_TO_HAND"
                    },
                    amount: {
                        type: "integer"
                    },
                    owner: {
                        type: "string",
                        description: "own, opponent, any"
                    },
                    position: {
                        type: "string",
                        description: "top, bottom, any"
                    },
                    target: {
                        type: ["object", "null"],
                        properties: {
                            owner: { type: "string" },
                            cardType: { type: "string" },
                            count: { type: ["integer", "string"] },
                            trait: { type: "string" },
                            name: { type: "string" },
                            color: { type: "string" }
                        }
                    }
                }
            },

            actions: {
                type: "array",
                items: {
                    type: "object",
                    required: ["type"],
                    properties: {
                        type: {
                            type: "string",
                            description: "只能使用以下值: DRAW, GAIN_MEMORY, SET_MEMORY, REDUCE_COST, DELETE_DIGIMON, DP_MOD, ADD_TO_HAND, RECOVERY_DECK, TRASH_BOTTOM_EVO, REVEAL_AND_SELECT, RETURN_REVEALED_REST_TO_DECK_BOTTOM, RETURN_REVEALED_REST_TO_DECK_TOP, TRASH_REVEALED_REST, GRANT_KEYWORD, PLAY_FROM_HAND, PLAY_FROM_TRASH, PLAY_FROM_HAND_OR_TRASH, SEND_TO_SECURITY, TRASH_SECURITY_STACK, SUSPEND_OPPONENT, UNSUSPEND, DNA_DIGIVOLVE, BURST_DIGIVOLVE, WARP_EVOLVE, STUN, BOUNCE, PLACE_SOURCE, RETURN_SOURCE_TO_DECK, RETURN_SOURCE_TO_HAND, TRASH_SOURCE, BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE, RETURN_TO_DECK, PREVENT_LEAVE_PLAY, CANT_MOVE, MOVE, ADD_SECURITY_TO_HAND, PLACE_IN_DELAY_AREA, LINK_FROM_HAND, PLAY_FROM_SOURCE, PLAY_FROM_HAND_OR_SOURCE, VORTEX_ATTACK_REQUEST, PLAY_FROM_SECURITY, ADD_CURRENT_SECURITY_TO_HAND, SEARCH_SECURITY_TO_HAND, ACTIVATE_TRIGGER_EFFECT, TRIGGER_REDIRECT, GRANT_KEYWORD_TO_LAST_PLAYED, GRANT_KEYWORD_TO_PLAYED_BY_EFFECT, BLAST_DIGIVOLVE, USE_OPTION_CARD, USE_OPTION, ACTIVATE_MAIN_EFFECT, MODAL_CHOICE"
                        },

                        amount: {
                            type: ["integer", "string"],
                            description: "数量。例如 draw 1、reveal top 3。费用预处理可用 SOURCE_COUNT / DELETED_CARD_PLAY_COST / OPPONENT_DIGIMON_AND_TAMER_COUNT。"
                        },

                        from: {
                            type: "string",
                            description: "来源区域，例如 deck_top, hand, trash, battle_area, security, source。Reveal top X 一律用 deck_top。"
                        },

                        to: {
                            type: "string",
                            description: "目标区域，例如 hand, trash, deck_bottom, deck_top, security, battle_area, source。"
                        },

                        zone: {
                            type: "string",
                            description: "旧字段兼容：deck, hand, trash, security, bottom, top 等。"
                        },

                        then: {
                            type: "string",
                            description: "后续处理提示。例如 ADD_SELECTED_TO_HAND, PLAY_SELECTED, PLACE_SELECTED_AS_SOURCE。"
                        },

                        useAttackingDigimon: {
                            type: "boolean",
                            description: "WARP_EVOLVE 专用：当卡文写 attacking Digimon/that Digimon/it digivolves 时填 true，表示进化目标必须锁定当前攻击中的 Digimon。"
                        },

                        evolveFrom: {
                            type: "string",
                            description: "WARP_EVOLVE 专用：进化卡来源，hand / trash / source / hand or trash。"
                        },

                        evolveTo: {
                            type: "object",
                            description: "WARP_EVOLVE 专用：要进化成的卡牌条件，例如 name/nameContains/trait/color。"
                        },

                        payCost: {
                            type: "boolean",
                            description: "WARP_EVOLVE 专用：如果卡文写 for a digivolution cost of X，填 true；without paying the cost 填 false 或省略。"
                        },

                        cost: {
                            type: ["integer", "object"],
                            description: "WARP_EVOLVE 专用：指定进化费用，例如 for a digivolution cost of 3 就填 3。"
                        },

                        target: {
                            type: ["object", "null"],
                            description: "单一选择目标。只有卡文是 Add 1 A or B 时才可用单一 target。若卡文是 Add 1 A and 1 B，必须使用 selections。",
                            properties: {
                                owner: {
                                    type: "string",
                                    description: "own, opponent, any"
                                },
                                cardType: {
                                    type: "string",
                                    description: "必须小写，例如 digimon, tamer, option, any, card, security。"
                                },
                                count: {
                                    type: ["integer", "string"],
                                    description: "目标数量，可以是数字或 all。"
                                },
                                trait: {
                                    type: "string",
                                    description: "trait 条件，例如 D-Reaper, Dragonkin。不要把 card name 硬塞进 trait。"
                                },
                                name: {
                                    type: "string",
                                    description: "精确卡名，例如 ADR-02 Searcher。"
                                },
                                nameContains: {
                                    type: "string",
                                    description: "卡名包含条件，例如 Greymon, Omnimon。"
                                },
                                color: {
                                    type: "string",
                                    description: "颜色条件，例如 red, blue, yellow, green, black, purple, white。"
                                },
                                maxDp: {
                                    type: ["integer", "string"],
                                    description: "仅卡文明示 DP 上限时使用，例如 3000, 7000, this。"
                                },
                                minDp: {
                                    type: "integer"
                                },
                                maxLevel: {
                                    type: "integer",
                                    description: "仅卡文明示等级上限时使用。"
                                },
                                minLevel: {
                                    type: "integer"
                                },
                                maxCost: {
                                    type: "integer",
                                    description: "仅卡文明示 play cost 上限时使用。"
                                },
                                minCost: {
                                    type: "integer",
                                    description: "仅卡文明示费用下限时使用。"
                                },
                                minSourceCount: {
                                    type: "integer",
                                    description: "仅卡文明示进化源数量下限时使用。"
                                },
                                maxSourceCount: {
                                    type: "integer",
                                    description: "仅卡文写 no digivolution cards 时可填 0。"
                                },
                                selection: {
                                    type: "string",
                                    description: "特殊选择方式，例如 lowest_level, highest_dp, total_play_cost, same_level, any。"
                                },
                                exceptNameContains: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "排除卡名包含，例如 DoruGreymon, BurningGreymon。"
                                },
                                condition: {
                                    type: ["object", "null"],
                                    properties: {
                                        type: { type: "string" },
                                        owner: { type: "string" },
                                        operator: { type: "string" },
                                        value: { type: ["integer", "string"] },
                                        trait: { type: "string" },
                                        color: { type: "string" },
                                        name: { type: "string" }
                                    }
                                }
                            }
                        },

                        selections: {
                            type: "array",
                            description: "Reveal 多选择槽专用。卡文是 Add 1 A and 1 B among them 时必须用 selections，不能合并成 count: 2 + A or B。",
                            items: {
                                type: "object",
                                required: ["count", "target"],
                                properties: {
                                    count: {
                                        type: "integer",
                                        description: "这个选择槽最多选择几张。"
                                    },
                                    optional: {
                                        type: "boolean",
                                        description: "是否可选。通常 Digimon TCG 的 Add among them 可以少拿，填 true。"
                                    },
                                    target: {
                                        type: "object",
                                        properties: {
                                            owner: {
                                                type: "string",
                                                description: "own, opponent, any"
                                            },
                                            cardType: {
                                                type: "string",
                                                description: "digimon, tamer, option, any, card。"
                                            },
                                            trait: {
                                                type: "string",
                                                description: "trait 条件，例如 D-Reaper。"
                                            },
                                            name: {
                                                type: "string",
                                                description: "精确卡名，例如 ADR-02 Searcher。"
                                            },
                                            nameContains: {
                                                type: "string",
                                                description: "卡名包含条件，例如 Greymon。"
                                            },
                                            color: {
                                                type: "string"
                                            },
                                            maxCost: {
                                                type: "integer"
                                            },
                                            minCost: {
                                                type: "integer"
                                            },
                                            maxLevel: {
                                                type: "integer"
                                            },
                                            minLevel: {
                                                type: "integer"
                                            },
                                            maxDp: {
                                                type: ["integer", "string"]
                                            },
                                            minDp: {
                                                type: "integer"
                                            },
                                            exceptNameContains: {
                                                type: "array",
                                                items: { type: "string" }
                                            }
                                        }
                                    }
                                }
                            }
                        },

                        buff: {
                            type: ["object", "null"],
                            properties: {
                                stat: {
                                    type: "string",
                                    description: "dp, keyword, securityAttack, memory 等。"
                                },
                                value: {
                                    type: ["integer", "string"]
                                },
                                keyword: {
                                    type: "string",
                                    description: "Blocker, Reboot, Piercing, Jamming, Rush, Security A. +1 等。"
                                },
                                duration: {
                                    type: "string",
                                    description: "END_OF_TURN, OPPONENTS_END_OF_TURN, THIS_TURN, ALL_TURNS"
                                }
                            }
                        },

                        condition: {
                            type: ["object", "null"],
                            properties: {
                                type: {
                                    type: "string",
                                    description: "只能使用: MEMORY_COUNT, SECURITY_COUNT, HAS_TAMER, HAS_TRAIT, HAS_KEYWORD, IS_SUSPENDED, HAND_COUNT, DP_CHECK, COLOR_CHECK, LEVEL_CHECK, HAS_SPECIFIC_CARD, SOURCE_COUNT, TRASH_COUNT, HAS_DIGIMON, TURN_PLAYER, DIGIXROSING"
                                },
                                owner: { type: "string" },
                                operator: { type: "string" },
                                value: { type: ["integer", "string"] },
                                trait: { type: "string" },
                                color: { type: "string" },
                                name: { type: "string" }
                            }
                        }
                    }
                }
            }
        },
        required: ["trigger", "actions"]
    }
};

// ==================== 主程序 ====================
const CARDS_FILE = path.join(__dirname, 'cards.json');
const BACKUP_FILE = path.join(__dirname, 'cards_backup_before_mechanics_v5.0.json');

async function generateMechanics() {
    console.log(`🚀 DTCG Mechanics v5.0 - 最终超强提示版启动... FORCE_REGENERATE = ${FORCE_REGENERATE}`);

    if (!process.env.OPENROUTER_API_KEY) {
        console.error("❌ 未找到 OPENROUTER_API_KEY，请检查 .env 文件！");
        return;
    }

    // 1. 读取完整的卡池（这里必须叫 allCards！）
    const allCards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
    
    // 2. 备份完整卡池
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(allCards, null, 2));
    console.log(`✅ 已备份原始文件 → ${BACKUP_FILE}`);

    // 3. 准备处理队列
    let targetCards = allCards; 
    const targetId = process.argv[2]; 

    if (targetId) {
        targetCards = allCards.filter(card => card.id === targetId);
        console.log(`🎯 [狙击模式] 锁定目标：${targetId}，开始生成...`);
    } else {
        console.log(`🔥 [全量模式] 未指定目标，准备轰炸全部 ${allCards.length} 张卡！`);
    }

    let processed = 0;
    let successCount = 0;
    let failCount = 0;
    const failedCards = [];
    const total = targetCards.length; // 注意这里用 targetCards.length

    // 4. 开始循环（遍历 targetCards）
    for (const card of targetCards) {
        processed++;

        const shouldGenerate = FORCE_REGENERATE || 
            (!card.mechanics || card.mechanics.length === 0 || card.mechanics[0].trigger === "MANUAL");

        if (!shouldGenerate) continue;

        const prompt = `
你是一位**极度严谨**的 Digimon TCG 规则引擎开发者。
请**严格按照下面这个 Schema** 输出，**绝对不能**添加任何 Schema 之外的字段，也不能使用未定义的 trigger 或 action type。

完整 Schema：
${JSON.stringify(mechanicsSchema, null, 2)}

合法 trigger（必须使用这些）：
MAIN, WOULD_BE_PLAYED, WOULD_DIGIVOLVE, DIGIVOLVED, ON_PLAY, WHEN_DIGIVOLVING, WHEN_ATTACKING, ON_DELETION, SECURITY, START_OF_TURN, END_OF_TURN, ALL_TURNS, YOUR_TURN, OPPONENTS_TURN, BREEDING, WHEN_BLOCKING, WHEN_MOVING

合法 action type（只能使用这些）：
DRAW, GAIN_MEMORY, SET_MEMORY, REDUCE_COST, RETURN_REVEALED_REST_TO_DECK_TOP, DELETE_DIGIMON, DP_MOD, ADD_TO_HAND, RECOVERY_DECK, TRASH_BOTTOM_EVO, REVEAL_AND_SELECT, RETURN_REVEALED_REST_TO_DECK_BOTTOM, TRASH_REVEALED_REST, GRANT_KEYWORD, PLAY_FROM_HAND, PLAY_FROM_TRASH, PLAY_FROM_HAND_OR_TRASH, SEND_TO_SECURITY, TRASH_SECURITY_STACK, SUSPEND_OPPONENT, UNSUSPEND, DNA_DIGIVOLVE, BURST_DIGIVOLVE, WARP_EVOLVE, STUN, BOUNCE, PLACE_SOURCE, RETURN_SOURCE_TO_DECK, RETURN_SOURCE_TO_HAND, TRASH_SOURCE, BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE, RETURN_TO_DECK, PREVENT_LEAVE_PLAY, MOVE, ADD_SECURITY_TO_HAND, PLACE_IN_DELAY_AREA, LINK_FROM_HAND, PLAY_FROM_SOURCE, PLAY_FROM_HAND_OR_SOURCE, VORTEX_ATTACK_REQUEST

WOULD_BE_PLAYED 只用于实际付款前的登场费用预处理。WOULD_DIGIVOLVE 只用于实际付款前的进化费用预处理。减费不要写成 YOUR_TURN 或 WHEN_DIGIVOLVING。
REDUCE_COST 可使用 amount: SOURCE_COUNT / DELETED_CARD_PLAY_COST / OPPONENT_DIGIMON_AND_TAMER_COUNT。

owner 只能使用 "own", "opponent", "any"
cardType 必须小写（如 "digimon", "option"）
duration 只能使用 "END_OF_TURN", "OPPONENTS_END_OF_TURN", "THIS_TURN"

卡牌名称: ${card.name}
卡牌类型: ${card.type}
Main Effect: ${card.mainEffect || "无"}
Source Effect: ${card.sourceEffect || "无"}

**铁律（翻译指南）**：
1. 【格式锁死】必须返回包含 "mechanics" 数组的 JSON 对象。绝对不要加解释文字。
2. 【禁止套娃与拆分】绝对不准在 condition 或 action 内部嵌套另一个数组！如果遇到 "from hand or trash"，强制使用合并动作 type: "PLAY_FROM_HAND_OR_TRASH" 解决，绝对不能拆分成两个独立的 Action！遇到 "A or B"，直接在 trait 填入 "A or B"。
3. 【禁止强迫症与记忆串线】绝对不准在 target 里凭空捏造卡文当前句没有的限制条件！如果**当前正在翻译的这句话**没有提等级、DP或费用上限，绝对不能把卡文其他地方的条件（如 maxLevel: 4）串接过来！也绝对不准在任何数值字段（如 minCost, maxCost, maxDp, maxLevel 等）瞎填 0，没有明确限制就直接省略该字段！
4. 【场上卡牌判定】如果条件是“场上有某卡”，强制使用 type: "HAS_TRAIT" 或 "HAS_SPECIFIC_CARD"，绝对不准使用 "HAS_TAMER"！HAS_TAMER 仅限驯兽师！
5. 【特殊动作锚定】"ignoring digivolution requirements" = WARP_EVOLVE；"reduce play cost" = REDUCE_COST；"cannot attack" = CANT_ATTACK；"can’t be attacked" = CANT_BE_ATTACKED；"place ... under ... as digivolution card" = PLACE_SOURCE；"return ... to hand" = BOUNCE；"return ... to deck" = RETURN_TO_DECK（绝对不能用 RECOVERY_DECK！）；"place this card in security" = SEND_TO_SECURITY。
6. 【安保特权严格判定】只有当安保效果明确写有 "add this card to your hand" 时，才允许在最后加上 type: "ADD_TO_HAND" 且 "zone": "security"。如果卡面上**没有**写这句话（例如只写了 Activate this card's Main effects），**绝对不准**凭空捏造 ADD_TO_HAND！
7. 【绝对无视固有词条】这是最核心的警告！如果卡面上带有 ＜Collision＞, ＜Piercing＞, ＜Security A. +1＞, ＜Reboot＞, ＜Blocker＞, ＜Alliance＞ 等尖括号词条，以及它们紧跟在后面的圆括号 "(...)" 里的所有规则解释，**绝对不可**为它们生成任何 action！哪怕括号里的句子再长，也直接当它们不存在！底层引擎会自动扫描提取这些词条！
8. 【Reveal 善后动作】对于 reveal 效果中的 Place/Return the rest/remaining cards to the bottom/top of the deck，必须生成明确善后 action。放到底部用 RETURN_REVEALED_REST_TO_DECK_BOTTOM。绝对不能无视，也绝对不能用 TRASH_BOTTOM_EVO。
9. 【共享条件防漏】如果卡文开头有多个触发时点共享同一个条件（例如 "[On Play] [When Attacking] If you have..."），必须在生成的每一个对应的 trigger 内部完整附带上该 condition 对象！判断进化源数量请使用 type: "SOURCE_COUNT"。
10. 【禁止无中生有】如果卡面文本中**没有**明确写出 [Security] 触发器，**绝对不准**凭空捏造 SECURITY 效果和 ADD_TO_HAND 动作！
11. 【再次重申括号豁免】就算圆括号里写着 "Unsuspend this Digimon..."（例如 <Reboot> 的解释），也**绝对不要**去翻译它！只要是固有词条的括号解释，无论多像技能，一律无视！
12. 【Reveal 剩余卡处理】如果卡文写 Place/Return the rest/remaining cards to the bottom/top of the deck，必须使用 RETURN_REVEALED_REST_TO_DECK_BOTTOM。绝对不能使用 TRASH_BOTTOM_EVO。TRASH_BOTTOM_EVO 只用于 “Trash the bottom digivolution card”。
13. 【Reveal 多选择槽】如果卡文是 “Add 1 A and 1 B among them”，绝对不能合并成 count: 2 + trait: "A or B"。必须在 REVEAL_AND_SELECT 里使用 selections 数组，每个选择槽单独写 count: 1 和 target。
14. 【攻击中进化链】如果卡文写 “When you attack... if the attacking Digimon is X, digivolve it into Y from hand/trash for a digivolution cost of N”，必须生成 trigger: "WHEN_ATTACKING"，代价写在 mechanic.cost（例如 suspend this Tamer），动作顺序保留原文，最后用 WARP_EVOLVE，并设置 useAttackingDigimon: true、target 锁定 X、evolveFrom、evolveTo、payCost: true、cost: N。绝对不要写成 YOUR_TURN + MANUAL_REQUIRED。
16. 【禁止 STUN 万能化】绝对不要使用 STUN 表示 can't attack / can't attack players / can't unsuspend。遇到 can't attack players 用 CANT_ATTACK_PLAYER；遇到 can't unsuspend 用 CANT_UNSUSPEND；遇到 can't attack 用 CANT_ATTACK；遇到 can't be attacked 用 CANT_BE_ATTACKED。若 schema 尚未支持这些 action，则不要生成 STUN，改为 MANUAL_REQUIRED。
17. 【condition 不能写时点】OPPONENTS_TURN、YOUR_TURN、ALL_TURNS、WHEN_ATTACKING、ON_PLAY 等都是 trigger，不是 condition.type。condition.type 只能是 MEMORY_COUNT、SECURITY_COUNT、HAS_TAMER、HAS_TRAIT、HAS_KEYWORD、IS_SUSPENDED、HAND_COUNT、DP_CHECK、COLOR_CHECK、LEVEL_CHECK、HAS_SPECIFIC_CARD、SOURCE_COUNT、TRASH_COUNT、HAS_DIGIMON、TURN_PLAYER、DIGIXROSING。
18. 【cost 与 action 分离】DELETE_DIGIMON、DP_MOD、BOUNCE、RETURN_TO_DECK、TRASH_SECURITY_STACK、RECOVERY_DECK 通常是效果 action，不是 cost。只有卡文明写 “By deleting/trashing/returning ...” 作为发动代价时才可写入 cost；否则必须放在 actions。
18a. 【未知事件统一降级】如果卡文是 when source trashed、when security removed、when attack target changes、when deleted in battle、if previous effect didn't happen、would leave battle area 等 schema 尚未支持的事件，不准硬塞进 condition.type，必须输出 MANUAL_REQUIRED。
18b. 【非法 cost 禁止】TRASH_BOTTOM_EVO、BOUNCE、RETURN_SOURCE_TO_DECK、PLAY_FROM_TRASH、SEND_TO_SECURITY、REDUCE_COST 不准写进 cost.type；需要时放到 actions 最前面，或用 MANUAL_REQUIRED。
18c. 【Barrier 禁止误译】＜Barrier＞ 是 would-be-deleted replacement keyword，不是 [On Deletion]。绝对不准把 Barrier 翻译成 ON_DELETION、TRASH_SECURITY_STACK + prevent deletion buff、或普通 PREVENT_LEAVE_PLAY。暂时不要为 Barrier 生成 mechanics；让规则引擎 keyword/replacement 层处理。
18d. 【Decode 禁止误译】＜Decode (...)＞ 是 would-leave-battle-area replacement keyword，不是 [On Deletion]。绝对不准把 Decode 翻译成 ON_DELETION 或 PLAY_FROM_HAND_OR_TRASH。暂时不要为 Decode 生成 mechanics；让规则引擎 replacement 层处理。
18e. 【Overflow 禁止误译】＜Overflow＞ 是规则层离场时处理，不是普通 action，不要生成 MANUAL_REQUIRED 或普通动作；规则引擎会在 sendToTrash / leave-play 流程处理。
18f. 【Vortex 规则】＜Vortex＞ 是结束自己回合时可攻击对手 Digimon 的攻击请求。必须输出 END_OF_TURN + VORTEX_ATTACK_REQUEST，不能写成 MANUAL_REQUIRED，不能写成普通 DELETE/DP_MOD。
19. 【禁止 Action 套娃】actions 数组里的每个 action 必须是单层 object。action 内部绝对不能再出现 actions、effect、thenActions、additionalActions 这类嵌套 action。多步骤效果必须拆成同一个 actions 数组里的多个平级 action。
20. 【Reveal 剩余卡丢弃】如果卡文写 Trash the rest / Trash the remaining cards，REVEAL_AND_SELECT 后必须添加同级 action: TRASH_REVEALED_REST。绝对不能使用 TRASH_BOTTOM_EVO、TRASH_SECURITY_STACK 或 RETURN_REVEALED_REST_TO_DECK_BOTTOM。
如果卡文写 Trash the rest / Trash the remaining cards，REVEAL_AND_SELECT 后必须使用 TRASH_REVEALED_REST，绝对不能使用 RETURN_REVEALED_REST_TO_DECK_BOTTOM、TRASH_BOTTOM_EVO 或 TRASH_SECURITY_STACK。
例如 EX2-047 应该是 selections: [
  { count: 1, target: { owner: "own", cardType: "any", trait: "D-Reaper" } },
  { count: 1, target: { owner: "own", cardType: "digimon", name: "ADR-02 Searcher" } }
]
只有卡文是 “Add 1 A or B” 才能用单一 target。
【安保防幻觉终极警告】如果 Security 效果只是 "Activate this card's [Main] effects."，你只需要把 MAIN 里的 actions 原样复制过来即可，**绝对、绝对、绝对不准在最后擅自加上 ADD_TO_HAND！**只有卡文明确写了 "add this card to your hand" 才能加！

现在开始输出：
`;

        try {
            const response = await openai.chat.completions.create({
                model: "qwen/qwen-2.5-72b-instruct",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.0,
                response_format: { type: "json_object" }
            });

            // 🛡️ 终极防御机制：彻底抛弃反引号正则替换，直接抓取首尾的大括号
            let rawText = response.choices[0].message.content.trim();
            const jsonMatch = rawText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (jsonMatch) {
                rawText = jsonMatch[0];
            }

            const parsedData = JSON.parse(rawText);

            // 智能提取数组
            if (parsedData && Array.isArray(parsedData.mechanics)) {
                card.mechanics = parsedData.mechanics;
            } else if (Array.isArray(parsedData)) {
                card.mechanics = parsedData;
            } else {
                card.mechanics = [];
            }

            successCount++;
            console.log(`✅ [${processed}/${total}] ${card.id} ${card.name} 已生成 mechanics`);

        } catch (err) {
            failCount++;
            failedCards.push({ id: card.id || '未知ID', name: card.name, error: err.message });
            console.error(`❌ [${processed}/${total}] ${card.id} ${card.name} 生成失败: ${err.message}`);
            card.mechanics = [{ trigger: "MANUAL", note: "生成失败，请手动补充" }];
        }

        if (processed % 5 === 0) {
            fs.writeFileSync(CARDS_FILE, JSON.stringify(allCards, null, 2));
        }

        await new Promise(resolve => setTimeout(resolve, SLEEP_MS));
    }

    fs.writeFileSync(CARDS_FILE, JSON.stringify(allCards, null, 2));

    console.log(`\n🎉 === 处理完成！===`);
    console.log(`✅ 成功生成 mechanics：${successCount} 张`);
    console.log(`❌ 生成失败：${failCount} 张`);

    if (failCount > 0) {
        console.log("\n📋 以下卡牌生成失败，需要手动补充：");
        failedCards.forEach((f, i) => console.log(`   ${i+1}. ${f.id} - ${f.name}`));
    }

    console.log("\n✅ cards.json 已更新");
}

generateMechanics().catch(console.error);
// Round 9M rule: Use PLAYED_BY_EFFECT for cards that trigger when a Digimon is played by an effect. Use OPPONENT_PLAYED_DIGIMON + ACTIVATE_TRIGGER_EFFECT for effects that re-activate [When Digivolving]/[On Play] effects.


// Round 9S rule: Effects worded as "When one of your Digimon digivolves" must use trigger DIGIVOLVED, not WHEN_DIGIVOLVING. Use condition scope:'event' to match the Digimon that just digivolved, for example HAS_TRAIT Puppet or COLOR_CHECK purple.


// Round 9T rule: Delay cards that say link 1 card from your hand with 1 of your Digimon should use LINK_FROM_HAND, or PLACE_SOURCE from hand with attachToTarget. Cards that say place this card in the battle area after [Main] or [Security] must use PLACE_IN_DELAY_AREA and must not use SEND_TO_SECURITY.


// Round 9U rule: delayed end-of-turn cleanup must not become MANUAL_REQUIRED.
// Encode "gain X memory, at end of turn lose X memory" as GAIN_MEMORY + SCHEDULE_DELAYED_ACTION {LOSE_MEMORY}.
// Encode "if it does / this effect played, delete it at end of turn" as WARP_EVOLVE/PLAY_* + SCHEDULE_DELAYED_ACTION {DELETE_THIS or DELETE_LAST_PLAYED_BY_EFFECT}.


// Round 9V parser hint:
// Reveal text with "Add 1 A and 1 B" MUST use REVEAL_AND_SELECT.selections[] with independent slots.
// Do not collapse separate slots into one OR target. Use RETURN_REVEALED_REST_TO_DECK_BOTTOM or TRASH_REVEALED_REST for cleanup.
// Option cards that say "Then, place this card in the battle area" should emit PLACE_IN_DELAY_AREA after reveal cleanup.


// Round 9W rule: Effects that say "when this Digimon checks security" must use trigger SECURITY_CHECKED, not YOUR_TURN or WHEN_ATTACKING. Raid/Piercing/Alliance are timing keywords and should not be encoded as MANUAL_REQUIRED.
// Round 9W action enabled: REVEAL_SECURITY_TOP_CONDITIONAL, CHANGE_ATTACK_TARGET, REDIRECT_ATTACK_TARGET, ATTACK_PLAYER, REQUEST_ATTACK_PLAYER, CANT_ATTACK_DIGIMON
// Round 9W action enabled: DELETE_LOWEST_DP_DIGIMON
// Round 9W action enabled: TRASH_OPTION_IN_BATTLE_AREA
// Round 9W action enabled: LINK_SELF_AS_SOURCE

// Round 10A audit taxonomy:
// MANUAL_REQUIRED must be grouped into actionable buckets rather than left as OTHER_MANUAL_REQUIRED.
// Main buckets include REVEAL_PLAY_PLACE_COMPLEX, COST_REDUCTION_PREPROCESS, ATTACK_REDIRECT_BLOCKER,
// COUNTER_ACE_BLAST, REPLACEMENT_PROTECTION, USE_OPTION_OR_ACTIVATE_EFFECT,
// REPLACEMENT_LEAVE_PLAY_DECODE, SOURCE_COMPLEX, HAND_TRASH_DISCARD, LINK_OVERCLOCK,
// HYBRID_TAMER_EVOLVE, SECURITY_STACK_MANIPULATION and ATTACK_CHOICE_VORTEX_ALLIANCE.


// Round 10B Reveal Play/Place guidance:
// - For "Reveal top X. Play 1 ... among them", encode REVEAL_AND_SELECT with then: "PLAY_SELECTED",
//   then a PLAY_FROM_HAND / PLAY_FROM_HAND_OR_TRASH action with from: "revealed".
// - For "Place 1 ... among them under ...", encode REVEAL_AND_SELECT with then: "PLACE_SELECTED_AS_SOURCE",
//   then PLACE_SOURCE with from: "revealed" and attachToTarget.
// - Always add RETURN_REVEALED_REST_TO_DECK_BOTTOM / TOP or TRASH_REVEALED_REST so revealed cards cannot leak.


// Round 10C rule hint: Encode would-play / would-digivolve cost reductions as WOULD_BE_PLAYED or WOULD_DIGIVOLVE with REDUCE_COST. Use action.cost for optional costs such as SUSPEND or RETURN_TO_DECK, and use amount RETURNED_CARD_PLAY_COST / OWN_TAMER_COUNT / OWN_DIGIMON_COUNT when the card text defines variable reduction. Do not leave simple cost preprocessing as MANUAL_REQUIRED.


// Round 10D guidance: attack redirection and blocker/collision timing must be structured.
// - When opponent attacks a player -> trigger OPPONENT_ATTACKED_PLAYER and use CHANGE_ATTACK_TARGET.
// - When any opponent attacks -> trigger OPPONENT_ATTACKED.
// - When attack targets change -> trigger ATTACK_TARGET_CHANGED.
// - Blocker/Collision are handled by keywords; do not emit MANUAL_REQUIRED for plain Blocker/Collision/Raid/Alliance.


// Round 10E rules:
// - [Hand] [Counter] <Blast Digivolve> must be encoded as trigger COUNTER + action BLAST_DIGIVOLVE, not MANUAL_REQUIRED.
// - ACE Overflow must be stored on card.overflow as a negative number and handled only by the rule layer, never as a normal action.
// - Blast Digivolve is free but still triggers When Digivolving and DIGIVOLVED after the counter window action resolves.

// Round 10F rule note: Barrier / Armor Purge / Scapegoat / Decoy / Fortitude are engine keyword layers.
// Do not emit MANUAL_REQUIRED only for these replacement-protection keywords.
// Encode their other printed effects normally; leave the protection keyword in card text for runtime detection.

// Round 10H: Use Option / Activate [Main] / Modal Choice. Use USE_OPTION_CARD for 'use 1 Option card'; ACTIVATE_MAIN_EFFECT for 'activate this card's [Main] effects'; MODAL_CHOICE for 'activate 1 of the effects below'.

// Round 10H: PLAY_TOKEN is supported for token creation effects.


// Round 10I: Cost Reduction Preprocess v3. Effects that say "by suspending/trashing..., may digivolve/play with the cost reduced by X" should use WARP_EVOLVE or PLAY_FROM_* with action.cost and costReduction/reduceCost. Use action-level cost instead of MANUAL_REQUIRED. For costs that require multiple payments, use cost.type: AND with costs[]. For "trash 1 Option from hand or source", use TRASH_HAND_OR_SOURCE. For "trash 1 Option card in the battle area", use cost.type TRASH_OPTION_IN_BATTLE_AREA, not TRASH_SECURITY_STACK.


// Round 10J: Reveal-digivolve / reveal-from-hand rules.
// If a card says reveal top X and digivolve this/attacking Digimon into a revealed card, encode REVEAL_AND_SELECT with then: PLAY_SELECTED or WARP_EVOLVE from revealed, then RETURN_REVEALED_REST_TO_DECK_BOTTOM/TOP.
// If a card says reveal a card from hand then place it in security if it is yellow, encode REVEAL_AND_SELECT from: hand to: security.

// ==================== Round 10M guidance ====================
// Hybrid Tamer evolution: if card text says "digivolve this card from your hand onto one of your [color] Tamers as if the Tamer is a level 3 [color] Digimon",
// do not emit MANUAL_REQUIRED. Runtime playOrEvolve supports treating the Tamer as Lv.3 for the evolution target.
// The card's When Digivolving search should still be encoded normally with REVEAL_AND_SELECT + independent selections.
// Reveal mixed destinations: when a reveal effect says "add 1 ... and trash 1 ...", use selection slots with `to: "hand"` and `to: "trash"`.

// Round 10N: Hand-trash triggers use OWN_HAND_TRASHED_BY_EFFECT / OPPONENT_HAND_TRASHED_BY_EFFECT, not YOUR_TURN placeholders.

// Round 10P rule note:
// Training / Unique Emblem / Memory Boost-style cards should be encoded as:
// REVEAL_AND_SELECT -> RETURN_REVEALED_REST -> PLACE_IN_DELAY_AREA.
// Their Delay text is handled by buildDelayActions(), including reduced-cost play/digivolve from hand or hand/trash.
// Do not emit MANUAL_REQUIRED for simple reveal + battle-area Delay + reduced-cost play/digivolve chains.

// Round 10Q final sweep guidance:
// - Linked-state / source immunity should be encoded as GRANT_KEYWORD with an IMMUNITY_* keyword, not MANUAL_REQUIRED.
// - Link/Plug-In effects should use LINK_SELF_AS_SOURCE or PLACE_SOURCE from hand/trash/source with attachToTarget.
// - Remaining protection effects should use PREVENT_LEAVE_PLAY with an explicit structured cost where possible.
// - Reveal "Add 1 A and 1 B" leftovers must continue using REVEAL_AND_SELECT.selections[] and rest cleanup.
// - Counter text without Blast Digivolve can be encoded as COUNTER plus its normal structured actions.


// Round 11B official timing guardrails:
// - Attack flow must remain: When Attacking effects fully resolve -> Counter window fully resolves -> Blocker timing -> Battle/Security -> End of Attack.
// - Blast Digivolve during Counter can create pending target/reveal/modal choices; do not move to Blocker until all pending choices and queued effects are cleared.
// - Recovery +X (Deck) uses the same deck-top convention as draw/security setup: deck.pop().
// - A Digimon deleted in battle may only trigger DELETED_OPPONENT_IN_BATTLE once per actual confirmed deletion.

// Round 22W guardrail: checked-security suppression must stay scoped.
// - "[Security] effects on Option cards checked by this Digimon don't activate" should be CANT_ACTIVATE_EFFECT on the chosen/attacking Digimon with Option-only scope metadata.
// - "[Security] effects on cards checked by this Digimon don't activate" from an inherited/source effect should bind to the host Digimon and apply to any checked card type.
// - Do not encode Raid/Piercing reminder text as MOVE or zero-DP placeholder mechanics while repairing these cards.

// Round 22X guardrail: opponent-effect immunity must stay as runtime immunity.
// - Text such as "isn't affected by your opponent's effects" must use UNAFFECTED_BY_OPPONENT_EFFECTS, not GRANT_KEYWORD placeholder text like "ignoring opponent's effects".
// - Text such as "isn't affected by your opponent's Option cards" must preserve Option-card source scope on the UNAFFECTED_BY_OPPONENT_EFFECTS action/text.
// - For "that Digimon isn't affected..." follow-ups, bind to the same previously selected/event Digimon instead of opening an unrelated second target.

// Round 22AA guardrail: attack-target-change locks must stay as target-change locks.
// - "This Digimon's attack target can't change/switch" is not STUN, CANT_SUSPEND, PREVENT_LEAVE_PLAY, or a fake "attack target" trait.
// - It should be encoded as CANT_CHANGE_ATTACK_TARGET/CANT_SWITCH_ATTACK_TARGET or recognized by the runtime static text layer on the attacker/host.
// - Raid and CHANGE_ATTACK_TARGET/REDIRECT_ATTACK_TARGET must respect the lock, but the original attack declaration must remain legal.

// Round 22BF DUAL field reference guardrails:
// - Follow CRM 4.0 DUAL scope: a DUAL card in hand/deck/trash/revealed may be referenced by Digimon/Option/card effects as appropriate, but once it is stacked on the field through Arts Digivolve it is treated as a Digimon.
// - A field DUAL must not match cardType:"option", Option-side color selectors, or Option-card target windows while it remains in battle area/breeding area.
// - A field DUAL should still match cardType:"digimon" and mixed Digimon-or-Option selectors through its Digimon status.
// - Do not fix this by disabling DUAL Option use from hand; only separate field-Digimon reference mode from non-field Option reference mode.

// Round 22BE guardrail: security-to-hand "By ..." costs.
// - Printed text like "By adding your top security card to the hand, ..." is a structured cost.
// - Encode it on mechanic.cost as { type:'ADD_SECURITY_TO_HAND', amount:1, from:'security_top', to:'hand', position:'top' }.
// - Do not encode that clause as a normal ADD_SECURITY_TO_HAND action before the payoff, and do not use TRASH_SECURITY_STACK unless the printed text says trash.
// - If the cost cannot be paid because the player has no security, the payoff actions must not resolve.

// Round 22CS BT9-043 Magnadramon (X Antibody) guardrails:
// - Its upper-text [End of Attack][Once Per Turn] "add the top card of your security stack to your hand to unsuspend this Digimon" is a real END_OF_ATTACK timing, not END_OF_TURN and not part of the When Digivolving effect.
// - Encode the security-to-hand clause as mechanic.cost { type:'ADD_SECURITY_TO_HAND', amount:1, position:'top' } so the UNSUSPEND payoff is gated atomically by a payable security cost.
// - The UNSUSPEND payoff targets this Digimon only with target.self:true and is not inherited.
// - The separate When Digivolving DP reduction remains gated by having [Magnadramon] or [X Antibody] in this Digimon's digivolution cards; do not use an unconditional board-wide placeholder.
