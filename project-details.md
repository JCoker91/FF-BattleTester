# Project: Final Fantasy 5v5 Battler Playtester

## What this is

A web-based playtesting tool for designing and balancing a competitive 5v5 turn-based battler inspired by Final Fantasy. The user is the designer; this app lets them configure characters, skills, status effects, and run live battles to validate ideas.

The end vision is a competitive 2-player web battler with draft/ban phase, live battles with turn timers, and elemental/status interactions as the core strategic depth. This playtester is the design/iteration tool, not the final product.

**Core design philosophy** (load-bearing — refer back to these when proposing mechanics):
- Buff/debuff stacking combos are the core strategy. No single ability should one-shot.
- Every character needs an identity that justifies picking them over similar-role characters.
- Counterplay matters. Strong abilities should have specific weaknesses that other characters can exploit.

## Tech stack

- **Next.js 16** (App Router) with **Turbopack** — `node_modules/next/dist/docs/` is the source of truth for Next-specific APIs, NOT general Next.js knowledge from training data. **Read those docs before touching framework code.**
- **TypeScript**, strict
- **Tailwind CSS v4** (uses `@theme inline` syntax in `globals.css`)
- **better-sqlite3** for persistence with hand-rolled migrations in `src/lib/db.ts`
- **dnd-kit** for drag-and-drop battlefield placement
- **React Context store** pattern (`src/lib/store.tsx`) wrapping fetch-based API calls

## File map (where to find things)

```
src/
├── app/
│   ├── battlefield/page.tsx       # THE BIG ONE — battle screen, ~6000 lines, contains:
│   │                              #   - BattlefieldPage (main component)
│   │                              #   - GridCell, EnergyPool, TurnOrderBar, BattleDetailsPanel
│   │                              #   - SkillModal (with damage preview, choose pools, splash, etc.)
│   │                              #   - All onApplyAndUse logic, animation triggers, etc.
│   ├── characters/                # Character list + character details/edit page
│   ├── skills/                    # Skill list + skill edit
│   ├── status-effects/            # Status effect editor
│   ├── series/, forms/, templates/, character-skills/  # Other CRUD pages
│   └── globals.css                # Animations live here (damage-float, sling-*, recoil-*, panel-fade-in, self-buff)
├── components/
│   ├── CharacterForm.tsx          # Create/edit characters (stats, gender, photo, bench visibility, etc.)
│   ├── SkillForm.tsx              # Create/edit skills (level config, effects, splash, riders, etc.)
│   └── (other forms)
└── lib/
    ├── types.ts                   # All TypeScript types — start here for any data shape question
    ├── db.ts                      # SQLite schema, migrations, CRUD functions
    ├── damage-calc.ts             # The damage formula — pure function, no React
    ├── damage-config.ts           # BASE_POWER, DAMAGE_TIERS, DAMAGE_MULTIPLIERS
    ├── targeting.ts               # resolveTargets() — turns a TargetType into actual unit IDs
    └── store.tsx                  # React context wrapping useStore(); all components pull state from here
```

**When in doubt**: `types.ts` defines the schema, `db.ts` persists it, `battlefield/page.tsx` consumes it. Edit in that order if you're adding a field.

### Database snapshot (cross-machine sync)

The user works on two machines and wants design data synced via git instead of copying the SQLite file. There's an export/import system for this:

- **`db.ts`** exports `exportSnapshot()` / `importSnapshot(data)` and `SNAPSHOT_TABLES` (the table list). Export does `SELECT *` per table; import wipes and re-inserts inside a single transaction. Import intersects snapshot columns with the live schema (`PRAGMA table_info`), so old snapshots survive future migrations — missing columns just take the schema's `DEFAULT`.
- **`src/app/api/snapshot/route.ts`** — `GET` writes to `db/snapshot.json` at repo root and returns row counts. `POST` reads the same file and imports.
- **`src/app/config/page.tsx`** — small "Database Snapshot" panel above the tabs with Export / Import buttons + status line.
- The snapshot file lives at **`db/snapshot.json`** (repo root). `/data/` is gitignored (live SQLite db), `/db/` is committed.
- Battle state (HP, buffs, character levels, SP, etc.) is React state, not in the DB, so it's automatically excluded.
- To add a new table to the snapshot: append it to `SNAPSHOT_TABLES` in `db.ts`. Done.

Workflow: edit → click Export → `git commit db/snapshot.json` → push → pull on other machine → click Import → reload.

## Core systems

### Damage calculation (`src/lib/damage-calc.ts`)

`calculateDamage(attacker, defender, skillLevel)` is a pure function that returns a `DamageResult`. It's called from many places: damage previews in the modal, the actual Apply path, counter-attacks, splash hits, etc.

Pipeline (in order):
1. Determine offensive/defensive stats based on damage category (physical = ATK vs DEF, magical = MATK vs SPI, true = ignores defense, healing = SPI vs flat)
2. Apply ignore-DEF / ignore-SPI %
3. Compute ratio = offensiveStat / defensiveStat (1.0 for true, SPI/50 for healing)
4. Base = `BASE_POWER * ratio * tierMultiplier`
5. HP-based scalings: caster missing HP, giant slayer (more dmg vs high HP), execute (more dmg vs low HP), bonus HP damage, bonus vs status, stolen energy
6. Faster Target Bonus (tag-based, attacker has tag + attacker SPD > defender SPD)
7. Imbue override: physical attacks with no element set pick up the attacker's `fire-imbue` / `ice-imbue` / `thunder-imbue` tag
8. Elemental modifier = (attackerElemDmg - defenderElemRes) / 100
9. Damage category resistance (dmgCatRes.physical, dmgCatRes.magical)
10. Damage source resistance (dmgSrcRes.direct/aoe/indirect — direct/aoe inferred from targetType, but `damageSourceOverride` lets a skill mark itself e.g. as indirect)
11. Healing-received modifier (defender tag, scales healing only)
12. Row positioning: front +20% dealt/taken, back -20% taken, melee penalty -20% if back-row caster
13. Variance ±10%
14. Round up

**`BASE_POWER` is 100** (was 10, bumped to make variance feel meaningful at HP×10 scale). Default character HP is **1000**.

### Skill system (`src/lib/types.ts` → `Skill`, `SkillLevel`)

A `Skill` has a `skillType` (innate / basic / ability / conditional), a `leveled` flag, and 3 `levels`. Each level is an independent `SkillLevel` config — different cost, damage, effects per level.

`SkillLevel` is the workhorse type. Big union of fields:
- Damage: `damageCategory`, `damageTier`, `randomTierPool`, `damageSourceOverride`, `element`
- Targeting: `targetType` (front-row-enemy, random-enemy, aoe-enemy, all-front-row-enemy, column-pierce-enemy, etc. — see `TARGET_TYPES` in types.ts)
- Cost: `cost` (per-color array), `costNote`, `hpCost`, `instant`
- Effects: `effects` (regular buff/debuff applies), `randomEffectPools` (random pick), `chooseEffectPools` (player picks at use time)
- Riders: `ignoreDefense`, `ignoreSpirit`, `casterMissingHpScaling`, `giantSlayerMaxBonus`, `executeBonus`, `bonusHpDamage`, `bonusDamageVsStatus`, `stolenEnergyScaling`
- Splash: `splashHit` (secondary damage payload, see SplashHit type)
- Misc: `dispels`, `movements`, `energySteal`, `energyGenerate`, `variableRepeat`
- Gates: `requiresAnyStatus`, `consumesCasterImbue`
- Row sniping: `ignoreRowDefense` (bypasses the defender's back-row -20% taken modifier — built for Squall's Renzokuken)
- Guaranteed hit: `guaranteedHit` (bypasses miss-chance, dodge-chance, and cover redirect — per-skill toggle, separate from the `guaranteed-hit` buff tag)
- Passive flag: `passive` (while-equipped effects auto-apply), `activeWhileDefeated` (opt-in for passives that persist after death, default false)
- Range tags: `rangeTags` (e.g. `["melee"]` triggers back-row penalty)

When you add a new field, you typically need to update: types.ts → SkillForm.tsx (UI) → battlefield/page.tsx (runtime, usually in `onApplyAndUse`) → optionally damage-calc.ts.

### Status effect system

`StatusEffect` is a reusable buff/debuff template. Has a name, category (buff/debuff/status), `stats` array (what stat keys it modifies), `defaultModifier`, `dispellable`, `polarity`, `stackable`, `maxStacks`, `formId` (for form-linked statuses), and `tags`.

`stats` are strings like `"atk"`, `"def"`, `"eleRes.fire"`, `"eleDmg.fire"`, `"dmgCatRes.physical"`, `"dmgSrcRes.direct"`. A single status can target multiple stats with the same modifier (so `["def", "spi"]` with `-30` = both DEF and SPI down 30%).

A `BuffDebuff` is the runtime instance applied to a character. It carries `effectId`, `effectName`, `category`, `stats`, `modifier`, `duration`, `source`, `sourceCharId`, `appliedTurn` (used to skip ticking on the cast turn), `untilNextTurn` (special expiry), and tags.

**Important duration semantics**:
- Duration `-1` = permanent
- Duration `>0` = turns remaining; ticks at end of caster's turn
- `appliedTurn === current turn` skips the first tick (so a 1-turn buff on a normal skill lasts the rest of this turn + the next turn)
- `instant` skills don't set `appliedTurn` by default (so a 1-turn buff is gone by end of this turn)
- `untilNextTurn` flag (per-effect) forces `appliedTurn` even on instant skills, AND triggers explicit removal at the start of the caster's next turn (in `processStartOfTurn`)

**Mutual exclusion patterns**:
- Form-linked statuses (set `formId`) auto-strip each other when applied
- Imbue tags (`fire-imbue` / `ice-imbue` / `thunder-imbue`) auto-strip each other on apply (hardcoded in the buff application path)

### Effect tag system

Tags are runtime behaviors attached to status effects. Defined in `effect_tag_types` table, seeded in db.ts. Each tag has a name, label, description, and a JSON `param_schema` for editor UI.

Currently seeded tags:
- `dot`, `hot` — damage/healing over time at turn start
- `skip-turn` — stun
- `miss-chance`, `dodge-chance` — outgoing/incoming attack avoidance with filter (direct/indirect/aoe/any) and damageCategory params
- `redirect-random`, `force-target`, `block-target` — targeting overrides
- `restrict-skills` — silence (allowed types whitelist)
- `set-stat` — overrides a stat to a fixed value
- `invert-healing` — heals damage and damage heals
- `removed-on-damage` — strips the buff if the holder takes damage
- `cover` — intercepts damage targeting allies, with hpThreshold / filter / damageCategory / allyGender params
- `counter` — retaliates with the holder's basic attack
- `restrict-switch` — blocks the Switch command
- `faster-target-bonus` — bonus damage when attacker SPD > defender SPD
- `fire-imbue` / `ice-imbue` / `thunder-imbue` — grants element to physical attacks, mutually exclusive
- `healing-received` — modifies incoming heal amount on the holder
- `multi-strike` — when the holder uses the specified skill, it triggers multiple times against the same target with independent miss/dodge/cover rolls per hit. Params: `hits` (number), `skillId` (skill picker — uses the `"skill"` param type which renders a searchable dropdown). Also wired into the counter-attack path so Counter + Dual Wield fires twice. Built for Squall's Dual Wield innate.
- `guaranteed-hit` — attacks from the holder bypass miss-chance, dodge-chance, AND cover redirect. Params: `filter` (direct/indirect/aoe/any). Built for Squall's Lionheart accuracy passive.

Tags are wired into runtime in damage-calc.ts (faster-target-bonus, healing-received, imbue) and in battlefield/page.tsx (everything else — the buff application path, processStartOfTurn, the cover/counter/effect resolution loops, multi-strike loop, guaranteed-hit gate, etc.).

**Tag param types**: `ParamDef.type` supports `"number"`, `"enum"`, `"string[]"`, and `"skill"`. The `"skill"` type renders a searchable skill picker dropdown in the status effect tag editor (config page) and displays the skill name in tag descriptions.

### Energy system

5 colors (red, blue, green, purple, yellow) + rainbow as a wildcard. Energy is **shared per team**, not per character — generated per round based on each character's `energyGeneration` config. When a character casts a skill, the cost is deducted from the team pool (rainbow can substitute for any color shortfall).

Rainbow conversion: 2 of any color → 1 rainbow via the conversion modal (click an energy in the pool).

`variableRepeat` skills: cost is per-repeat, color can be specific or `"any"` (player picks the mix at use time via per-color steppers).

**Skill-based energy generation** (`SkillLevel.energyGenerate`): a skill can generate energy for its team via three triggers:
- `on-use` (default) — fires when the skill is used. E.g. "Deal damage and generate 1 Green energy."
- `on-attack-hit` — fires only if the attack deals damage (not dodged/missed).
- `round-start` — fires passively at the start of each round while the skill is equipped and the character is alive. Only `specific` and `random` modes supported (no picker at round start). Processed in `advanceToTurn` alongside base energy generation. Used by Squall's Red Draw innate and future color Draw variants for other characters.

### Leveling system (character level + skill points)

Two independent in-battle progression tracks. Both spend resources during the **End-of-Round Phase** (a modal that opens when the last character of the round acts; the next round only starts when the player clicks "Begin Next Round"). Both are ephemeral battle state — reset on battle start/end, not persisted.

**Track 1 — Character Level (rainbow-gated)**
- Each character: Lv 0 → Lv 3. Costs **1 / 2 / 3 rainbow** per level (6 total to max).
- Each level adds **+10% to ATK, MATK, DEF, SPI, SPD**. **HP is intentionally NOT scaled.**
- State: `characterLevelMap: Record<charId, 0..3>`.
- Multiplier is applied via the pure helper `applyCharLevelStats(stats, level)` defined at module scope in `battlefield/page.tsx`. It's wrapped around every `aStats`/`dStats` site (the form-merged base stats fed into damage-calc), and `getEffectiveSpeed` multiplies `baseSpd` by the level mult before applying SPD buffs (so turn order recomputes correctly each round).
- Display panels (`BattleDetailsPanel`, the active character panel) receive `characterLevelMap` / `characterLevel` and apply the helper to `panelStats` so the displayed "base" reflects the leveled value.

**Track 2 — Skill Points (auto-generated)**
- Each **living** character earns **+1 SP at the end of every round**. Defeated characters earn nothing. Banked per-character.
- Spend **1 SP** to bring an ability skill from L1→L2, **2 SP** for L2→L3 (helper: `skillUpgradeCost(currentLevel)` → `1 | 2 | null`).
- Only **ability skills with `leveled !== false`** are upgradeable. Innate, basic, and conditional skills are always at L1. (The runtime `canLevel` check is more permissive for legacy reasons but the leveling UI only offers ability skills.)
- State: `skillPointsMap: Record<charId, number>`. The existing `skillLevelMap: Record<skillId, 1..3>` is the runtime selector — already wired into every `skill.levels[lvlIdx]` read. Variant-group siblings (e.g. Lightning's Flame/Frost/Spark) auto-sync to the same level when one is upgraded.

**End-of-Round Phase**
- State: `endOfRoundPhaseOpen: boolean`. When `endRound()` is called, instead of immediately running `advanceToTurn(0, true)`, it ticks the ending character's buffs, awards SP to all living chars, sets the phase open, and waits. `beginNextRound()` clears the phase and runs the actual round transition.
- Modal lives in `battlefield/page.tsx` as a fixed overlay (z-40, lower than SkillModal at z-50 so the skill detail modal layers on top).
- Renders both teams as character cards: portrait, char level pips, "Level Up (🌈 X)" button, SP balance, and a per-skill list of equipped levelable abilities with "↑ X SP" buttons.
- Clicking a skill name in the modal opens `SkillModal` with `levelingMode={true}`, which:
  - Shows **all 3 levels** stacked instead of just the current one (so the player can compare what their SP would buy)
  - Highlights the current level (blue "CURRENT" tag) and the next level (yellow "NEXT ↑" tag)
  - **Hides all "Apply and Use" buttons** — the modal is read-only during leveling
- The phase modal is the foundation a future **shop feature** will hook into (between-rounds item purchases for additional strategic decisions).
- The old inline `↑ Upgrade` button on each skill tile in the action bar was removed — the End-of-Round modal is now the only place skills can be upgraded.

### Battle flow (`battlefield/page.tsx`)

**Phases**: `staging` (drag characters from bench to grid, equip skills) → `battle` (turn order, action, etc.).

**Turn order**: computed once at battle start by SPD; recomputed at the start of each round to account for SPD buffs. Sorted high → low. `currentTurnIndex` walks through.

**Per-turn flow**:
1. `processStartOfTurn(charId)` runs:
   - Strips any "until next turn" buffs the character cast on a prior turn
   - Skips if defeated
   - Processes DoT/HoT/skip-turn tags
   - Fires `turn-start` triggered effects from passive skills
   - Returns `shouldSkip` if stunned
2. Player picks a skill via the action bar → opens SkillModal → previews damage → clicks Apply and Use
3. `onApplyAndUse(entries, skill, opts)` callback fires (giant function, ~600 lines) and runs:
   - Variable-repeat expansion (re-rolls random-enemy targets per hit)
   - Miss/dodge rolls
   - Cover redirect (with damage recalc against the cover user)
   - HP application (delayed 300ms for attacker slingshot animation)
   - Damage floats + recoil animation per target
   - Imbue consumption (if `consumesCasterImbue`)
   - Effects loop (regular + random pools + chosen pools, filtered by trigger)
   - Status floats + self-buff flash for self-targeted positive effects
   - Dispels
   - Movements (`push-back` = full punt to back row, `push-back-one` = single-step shove that swaps with whoever is directly behind, `pull-forward`, `teleport-self` with player picker)
   - Energy steal/generate
   - Counter attacks (defenders with `counter` tag retaliate)
   - Battle log entries
   - Turn advance (or stay if instant)
4. Pass button or Apply ends the turn → `nextTurn()` ticks the ending character's buffs and advances to the next character

### Variant groups (linked skills)

A `CharacterSkill` assignment has an optional `variantGroupId` and `statusConditionId`. When the character's equipped skill is part of a variant group, `resolveFormView` checks for siblings with matching status conditions and swaps them in.

Used by:
- **Cecil's forms** (paladin/dark knight) — `formId`-based variants
- **Lightning's Elemental Strike** → Flamestrike / Froststrike / Sparkstrike — status-condition variants (the imbue tags)
- **Lightning's Army of One** → Inferno / Glacier / Storm — same pattern
- **Squall** — three vertical chains (Strike / Pierce / Sweep), each base ability applies **Combo**, each Combo-tier applies **Renzoku**. All 9 abilities live in one variant group keyed by `statusConditionId` (Combo for tier 2, Renzoku for tier 3). Combo and Renzoku are both `dispellable: false` and `untilNextTurn` — counterplay is silence/stun/energy denial, not dispel.

**Important rule**: variant siblings with `statusConditionId` set are hidden from the equip UI. Only the base (no status condition) can be equipped; the variants swap in automatically.

### Combat animations (`globals.css`)

- **Attacker slingshot** (`sling-left` / `sling-right`) — pull back, lunge forward, return. 650ms with springy easing. Direction depends on caster's side.
- **Defender recoil** (`recoil-left` / `recoil-right`) — snap away from attacker, elastic return. 550ms.
- **Damage float** — number rises ~80px over 1400ms with smooth cubic-bezier, fades via separate fade keyframe (avoids the "stepping" artifact). Multiple floats per character stagger 260ms via `floatScheduleRef` so they don't overlap.
- **Self-buff flash** — green drop-shadow pulse + jitter, 700ms. Triggered when caster applies a non-debuff effect to themselves.
- **Panel fade-in** — active character panel re-mounts on turn change with `key={activeCharId}` and a 260ms fade.

Pass button has a 180ms delay before advancing the turn so the panel transition reads cleanly.

### Combat geometry (coordinate system)

**Important and non-obvious**: in the placement coordinate system, **`col` is the depth axis** (0 = front row, 1 = mid, 2 = back) and **`row` is the lateral axis** (3 lateral lanes). "Front row" in game terms = `col === 0`. "Row behind X" in game terms = `X.col + 1`. The naming is confusing — read code carefully.

Splash patterns (`SplashTargetPattern`):
- **`adjacent-of-target`** — 4-directional neighbors of the primary on the same side (same row ±1 col, or same col ±1 row).
- **`all-other-enemies`** — every unit on the primary's side except the primary.
- **`row-behind-target`** — every unit at `col === primary.col + 1` on the same side, any lateral row. Up to 3 splash targets. No-op if primary is in the back row. Built for Squall's Blasting Zone.

`column-pierce-enemy` targetType: hits the chosen front-of-lane unit + the **single** unit directly behind it (same lateral row, `col + 1`). It does NOT pierce all the way through the lane — only one cell back. Used by Squall's Solid Barrel.

`front-row-enemy` / `all-front-row-enemy` targetTypes: both use **per-lane frontmost** logic, NOT literal `col === 0`. For each lateral lane, the lowest-col living enemy is considered that lane's "front" — so a lane with only a mid-row or back-row enemy still contributes that enemy as its front. `front-row-enemy` is single-pick (dropdown across the per-lane fronts); `all-front-row-enemy` is AOE across all per-lane fronts. This means a back-row character is NOT safe from front-row AOE if their lane is empty in front of them. Used by Squall's Fire Cross.

`movements`:
- **`push-back`** — full punt to col=2, shifting other characters in the lane forward
- **`push-back-one`** — one column step back (col → col+1). Swaps with whoever is directly behind, walks into empty cell otherwise. No-op if already at back row. Used by Squall's Rough Divide.
- **`pull-forward`** — mirror of push-back toward col=0
- **`pull-forward-one`** — one column step forward (col → col-1). Swaps with whoever is in front, walks into empty cell otherwise. No-op if already at front row. Used by Squall's Revolver Drive L1.
- **`teleport-self`** — caster picks an empty grid cell to move into
- **`recoil-self-one`** — automatic self-move: caster col → col+1, swap with ally behind or walk into empty cell. No-op at back row. "Cannon recoil" fantasy. Built for Squall's Fire Cross.
- **`switch-self-adjacent`** — player-picker self-move: opens a picker highlighting the 4-directional neighbors of the caster's current cell on their own team's grid. Empty neighbors = walk into them; ally-occupied neighbors = swap with the ally. Uses `pendingTeleport` flag to defer turn advance until the click resolves (same pattern as `teleport-self`).

**Movement timing**: `MovementAction.timing` is `"before-damage" | "after-damage"` (default `"after-damage"` for backward compat). Set per-movement in the SkillForm movement editor. The movements block in `onApplyAndUse` is extracted into `applyMovementsTimingPhase(phase)`, called once just before the Attack Choreography slingshot and once after the damage-apply block; each call filters to its matching timing. Enables "dash in then strike" (before) and "strike then recoil" (after) patterns on the same primitive.

**Known limitation (movement timing + row bonus)**: row-positioning damage bonuses (front +20% dealt, back-row melee penalty, etc.) are baked into `aStats`/`dStats` *before* movements resolve, so a `before-damage` self-move does NOT recompute attacker row bonus for the current hit. Works positionally/visually, but not for damage scaling. Fix would require re-running the row-bonus layer after the pre-damage movement phase. Punted until a skill actually needs it.

### FLIP movement transitions

`useLayoutEffect` watches `teams` and applies FLIP transforms to characters whose `data-char-id` element moved between renders. Threshold of 24px ignores sub-pixel layout drift. 360ms cubic-bezier transition.

Used for: Switch command, Banishing Blade push-back, Flee teleport-self, any future grid movement.

## Character configurations (current state)

### Built characters (4 done, 1 in progress)

- **Cloud** (Buster) — Limit Warrior innate (gain Limit stack on turn start), stackable Limit buff → Limit Break + Omnislash conditional
- **Cecil** (Vanguard) — paladin/dark knight forms, Saintly Wall buff, Dark Flame (caster missing HP scaling), Cover-based defensive identity, Sentinel-style cover
- **Auron** (Buster) — Counter mechanic via tag, Banishing Blade push-back movement, Full Break stat reduction
- **Zidane** (Specialist) — Steal/energy mechanics, Soul Blade random effect pool, Slow status, Trance form, Protect Girls (cover for female allies, until-next-turn duration), Flee (player-controlled teleport-self)

### Lightning (Agent) — IN PROGRESS, mostly done

Identity: physical attacker who imbues her weapon with Fire/Ice/Thunder for elemental specialization.

**Confirmed kit**:
- **Innate**: TBD by user (built-in choice)
- **Basic Imbue** (basic, 0 cost, instant) — `chooseEffectPools` lets player pick Fire/Ice/Thunder Imbue self. Permanent until swapped.
- **Saber** (ability, instant, 1 green at L1/L2, free at L3) — same imbue picker + applies Resonance buff (+20/+30/+40 to all elemental damages, 3 turns)
- **Elemental Strike** (variant group of 4):
  - Base: physical, moderate, no element. `chooseEffectPools` self-imbues. L3 is instant.
  - Flamestrike (Fire Imbue): physical, moderate, fire. ignoreDefense 25/40/50%
  - Froststrike (Ice Imbue): physical, moderate, ice. Applies Slow + bonusDamageVsStatus(Slow) at 10/20/30%
  - Sparkstrike (Thunder Imbue): physical, moderate, thunder. splashHit minor/low/low to adjacent → adjacent → all-other-enemies
- **Crushing Blow** — physical, low, single target, applies "Sundered" (DEF + SPI -%) for 2-3 turns
- **Army of One** (variant group of 4):
  - Base: requiresAnyStatus = [Fire, Ice, Thunder Imbue]. Disabled placeholder when no imbue.
  - Inferno (Fire Imbue): severe physical, giantSlayerMaxBonus 50/75/100, consumesCasterImbue
  - Glacier (Ice Imbue): severe physical, applies anti-heal status (healing-received -30%, 3 turns), consumesCasterImbue
  - Storm (Thunder Imbue): severe physical, applies self-evasion (dodge-chance ~60%, 1 turn), consumesCasterImbue
- **White Magic (Initiate)** — utility healer access via template
- **Conditionals** (auto-available based on imbue):
  - Searing Edge (Fire Imbue): physical low AOE fire, applies Fire Resistance Down (-20%, 3 turns)
  - Glacial Lance (Ice Imbue): same with ice
  - Thunderfall (Thunder Imbue): same with thunder

**Statuses needed for Lightning**:
- Fire Imbue / Ice Imbue / Thunder Imbue (with respective tags)
- Resonance (multi-stat eleDmg+, dispellable, reusable)
- Sundered (DEF + SPI -%, dispellable, reusable)
- Wounded or similar (healing-received tag, dispellable, reusable)
- Charged Reflex or similar (dodge-chance tag, 1 turn, dispellable)
- Fire/Ice/Thunder Resistance Down (single eleRes stat, dispellable, reusable)

### Squall (Buster) — IN PROGRESS

Identity: weak early / strong late chain combatant. Cheap red-cost abilities form three vertical chains; each chain executes through Combo → Renzoku tiers, with Renzoku-tier finishers granting permanent ATK stacks (Lion's Might) that snowball into a late-game threat. Counterplay is exclusively silence, stun, and energy denial — chain statuses and Lion's Might are all undispellable by design.

**Innate options**:
- **Red Draw** — "Generate an additional red energy at the start of each round." Uses `energyGenerate` with `trigger: "round-start"`, mode `specific`, color `red`, count 1. Future characters will have color Draw variants (Blue/Green/Purple/Yellow Draw) as innate options.
- **Dual Wield** — "Your Basic Attacks trigger twice." While-equipped buff with `multi-strike` tag (hits: 2, skillId: Basic Attack). Each hit has independent miss/dodge/cover rolls. Also works with Counter retaliations.
- **Lionheart** (accuracy) — "Your attacks always hit." While-equipped buff with `guaranteed-hit` tag (filter: any). Bypasses miss-chance, dodge-chance, and cover redirect.

**Chain statuses** (both `dispellable: false`, `untilNextTurn`):
- **Combo** — applied by base abilities, gates the Combo-tier variants
- **Renzoku** — applied by Combo-tier abilities, gates the Renzoku-tier variants

**Lion's Might** — stackable ATK buff, +10% per stack, max 5, **undispellable, permanent**. Granted on every Renzoku-tier cast (the cast itself, not on hit — dodge tags don't deny it). Justification for undispellability: the buff takes ~15 turns of perfect chain execution to max out, so cost asymmetry of "1 dispel wipes it" would gut the late-game identity.

**The 9 abilities** (one variant group, status-condition swaps):

| Slot | Base (no condition) | Combo tier (Combo status) | Renzoku tier (Renzoku status) |
|---|---|---|---|
| **1 — Strike** | **Draw Cut** (1🔴) — physical low single, ignoreDefense | **Rough Divide** (2🔴) — physical moderate single + push-back-one | **Lion Heart** (3🔴) — physical severe single, executeBonus, +Lion's Might stack |
| **2 — Pierce** | **Trigger Shot** (1🔴) — physical low single ranged, ignoreDefense 25% | **Aura Burst** (1🟢) — self-buff Aura (+30% ATK, 2 turns), no damage, NOT instant | **Renzokuken** (1🔴 + variableRepeat red max 3) — physical moderate single, ignoreDefense 40%, `ignoreRowDefense`, multi-hit on locked target, +Lion's Might stack |
| **3 — Sweep** | **Solid Barrel** (1🔴) — physical low, `column-pierce-enemy` (target front + 1 directly behind) | **Fire Cross** (2🔴) — physical low, `all-front-row-enemy`, self-move after damage (either `recoil-self-one` auto or `switch-self-adjacent` player-picker — both configured, to playtest) | **Blasting Zone** (4🔴) — physical high, `front-row-enemy` + splashHit moderate indirect with `row-behind-target` pattern, +Lion's Might stack |

**Statuses needed for Squall**:
- Combo (no stat effect, undispellable, untilNextTurn)
- Renzoku (no stat effect, undispellable, untilNextTurn)
- Lion's Might (atk +10% per stack, max 5, stackable, undispellable, permanent duration)
- Aura (atk +30%, 2 turns, dispellable — it's a normal buff)

**Standalone abilities** (non-chain, equippable alongside the chain variant group):
- **Keen Edge** — self-buff, NOT instant. Grants ATK+ and guaranteed-hit for 3 turns. Setup move before starting a chain — spend one turn buffing, then chain with stronger hits that can't miss. Cost: red.
- **Fated Circle** — physical low AOE to all enemies + applies "Shattered Armor" debuff (`dmgCatRes.physical` -10/15/20% per level, 2 turns). First physical damage resistance shred in the game. Team support — enables all physical attackers on the roster. Cost: 2 red.
- **Revolver Drive** — physical moderate single-target + `pull-forward-one` (L1) / `pull-forward` (higher levels). Yellow energy cost so it doesn't compete with red chain economy. Positional utility — yank backline enemies forward into front-row danger. Cost: yellow.

**Statuses needed for standalone abilities**:
- Keen Edge buff (ATK +%, guaranteed-hit tag, 3 turns, dispellable)
- Shattered Armor (dmgCatRes.physical -%, 2 turns, dispellable)

**Junction**: tabled. May come back as an equippable stat-boost ability rather than a defining mechanic.

User is configuring these manually in the UI; do not configure them via code.

### Aerith (Specialist) — IN PROGRESS

Identity: healer/support with a Limit Break system mirroring Cloud's. Stacks build passively or via skill riders, unlocking increasingly powerful limit abilities. At max stacks, auto-converts to Limit Break status (1-turn window for Great Gospel). Can spend stacks early on weaker limit abilities or hold for the big payoff.

**Limit system** (mirrors Cloud's pattern):
- Limit stacks (stackable, max 5, `onMaxStacks` → Limit Break status, same as Cloud)
- Limit Break status (1 turn, `untilNextTurn`)
- Limit conditionals are dual-gated: visible/enabled if `requiresMinStacks` (stack-spending phase) OR `requiresAnyStatus: [Limit Break]` (free-use phase)
- `consumesCasterStacks` with `skipIfStatus: Limit Break` — spends stacks when used pre-5, free during Limit Break window

**Innate options:**
- **Cetra's Prayer** — gain 1 Limit stack per turn start (same as Cloud's Limit Warrior). Passive, guaranteed limit generation.
- **Aegis Ward** — passive, turn-start: grant minor shielding to `lowest-hp-ally`. Uses `damageTrigger: "turn-start"` with shielding damage category. Proactive protection, no limit generation.

**Basic options:**
- **Basic Attack** — physical low single target (standard)
- **Mend** — healing, minor, single ally, 0 cost. Can include a self-targeted Limit stack rider for passive limit generation while healing.

**Limit conditionals:**

| Requirement | Skill | Effect | Consumes |
|---|---|---|---|
| 2+ Limit stacks OR Limit Break | **Healing Wind** | AOE team heal (moderate) | 2 stacks (free during LB) |
| 3+ Limit stacks OR Limit Break | **Seal Evil** | AOE silence on all enemies | 3 stacks (free during LB) |
| 4+ Limit stacks OR Limit Break | **Planet Protector** | Team-wide damage reduction buff | 4 stacks (free during LB) |
| Limit Break only | **Great Gospel** | Massive AOE heal + invincibility (1 turn, `untilNextTurn`) | none (LB expires) |

**Abilities:**
- **White Magic (Expert)** — template: Cure, Curaga, Dispel, Raise, Protectga, Shellga, Holy, Brave/Bravega, Faith/Faithga, Reraise
- **Pulse of Life** — single-target high heal + dispel 1 debuff. High cost. Can include Limit stack rider.
- Additional ability slots TBD based on playtesting.

**Limit generation philosophy**: if Cetra's Prayer is not equipped, limit can still be generated via skill riders — add a self-targeted Limit stack effect (on-use trigger) to any ability. Different loadouts generate limit at different speeds. No new system needed.

**Statuses/tags built for Aerith:**
- Invincible tag — takes no damage, effects still apply (for Great Gospel)
- Auto-revive tag — on defeat, revive at hpPercent% HP, buff consumed (for Reraise)
- Shielding damage category — absorbs damage before HP, blue bar overlay
- `consumesCasterStacks` field — spend N stacks of a buff on skill use, with `skipIfStatus` for free use during Limit Break
- `requiresMinStacks` field — gate skill visibility/enablement on stack count
- `lowest-hp-ally` target type — auto-targets living ally with lowest HP
- `fallen-ally` target type — targets dead allies only (for Raise)
- `revive` skill flag — sets dead target to 1 HP before healing applies
- `damageTrigger` field — controls when damage/healing/shielding resolves ("on-use" default, "turn-start" for passives)
- `offensiveStatOverride` — override which stat scales damage (for Holy using SPI)

### Roadmap

1. ~~Squall~~ — done
2. **Aerith** — in progress (see above)
3. **Vivi** (Arcanist) — Black Magic template, **Double Cast** mechanic (consume turn once, resolve two skill picks). NEW system.
4. **Terra** (Arcanist) — Trance reuses Zidane's pattern, Black Magic reuses Vivi's template
5. **Yuna** (Specialist) — Bar/En spells (uses existing eleRes/eleDmg buffs), summons (UNKNOWN system, biggest unknown)

## Development conventions

- **Read the file before editing it.** The Edit tool requires it; obey.
- **No emojis in code or files** unless explicitly requested.
- **Don't refactor for fun.** The user wants targeted changes, not "improvements." A bug fix doesn't need surrounding cleanup.
- **Don't create README/docs unless asked.** This document is the exception.
- **When in doubt about Next.js APIs, read `node_modules/next/dist/docs/`.** This codebase is on Next.js 16 with breaking changes from older versions.
- **Use the dedicated tools** — Read instead of cat, Edit instead of sed, Glob instead of find, Grep instead of grep/rg.
- **The Pass button is the only mid-round turn-advancement.** The "Next Turn" button was removed. End Round button only appears on the last turn.
- **Bench visibility** — characters with `showInBench: false` are hidden from staging. Used to hide unfinished characters during playtesting.

### Subtle landmines (stuff that has bitten us)

- **`currentHpMap` stale closures**: `processStartOfTurn`, `resolveTargets`, and the variable-repeat loop all read from `currentHpMapRef.current` (a ref kept in sync with state on every render), NOT from the closure-captured `currentHpMap`. This is because `nextTurn()` is often called synchronously after a `setCurrentHpMap()` earlier in the same handler — the closure `currentHpMap` is still the pre-kill version. If you write new battle logic that needs to know "is this character dead RIGHT NOW," use the ref. The component-level `defeatedCharIds` set is updated by a `useEffect` and lags by 1+ renders.
- **First turn of round 1 needs an explicit `processStartOfTurn` call**: there's a dedicated `useEffect` (gated by `firstTurnFiredRef`) that fires it when `phase === "battle" && round === 1 && currentTurnIndex === 0 && turnOrder.length > 0`. Without it, passive turn-start effects (e.g. Lightning's cycled imbue innate) miss their first activation. `startBattle` does NOT call it directly because state hasn't committed yet.
- **`roundEnding` flag locks the action bar during the 1.5s end-of-round delay**: `endRound()` flips `roundEnding = true` synchronously, then schedules the modal open via `setTimeout(1500)`. `nextTurn()`, `endRound()`, and `onApplyAndUse()` all early-return if `roundEnding` is true, plus the Pass / End Round buttons are visually disabled. Cleared in `beginNextRound()`. Without this, the last character's player can spam Pass / cast skills during the delay before the modal pops.
- **Variable-repeat targeting**: random-enemy skills re-roll per hit (Zidane pattern); all other targeting locks onto the original primary target for every repeat (Squall's Renzokuken pattern). The branch is in the variable-repeat loop in `onApplyAndUse` keyed on `_level.targetType !== "random-enemy"`.
- **`column-pierce-enemy` only hits the cell directly behind**, not the whole lane. The previous implementation pierced through everything in the lane behind the target — that was a bug, fixed during Squall configuration.

## User preferences (collaboration style)

- The user is the designer and is comfortable with system architecture decisions but wants the assistant to **propose options with tradeoffs**, not just dive in. They make the call, the assistant builds.
- **Don't over-engineer**. When the user says "do X", they often mean a focused minimal version, not a generalized framework.
- **Brainstorm with conviction**. The user explicitly asks for opinions and recommendations. Give them direct picks with reasoning, not wishy-washy "either could work."
- **Reuse mechanics over inventing new ones**. When designing a character, try to express their kit through existing primitives first; only add new ones when truly necessary.
- **Explain the why, briefly**. The user wants to understand the design tradeoff, not just see a list of changes.

## Where we left off (most recent context)

- **Aerith configuration in progress** — innates (Cetra's Prayer, Aegis Ward) and basics (Basic Attack, Mend) configured. Limit conditionals (Healing Wind, Seal Evil, Planet Protector, Great Gospel) designed with dual-gated visibility. Working on abilities — Pulse of Life designed, considering limit stack riders on healing abilities for alternative limit generation without Cetra's Prayer.
- **Squall configuration complete** — all chain abilities, standalone abilities, and innates designed and configured.
- **System primitives built across all sessions**:
  - Movement types: `push-back-one`, `pull-forward-one`, `recoil-self-one`, `switch-self-adjacent`
  - Movement timing: `MovementAction.timing` (`before-damage` / `after-damage`)
  - Splash patterns: `row-behind-target`
  - Skill fields: `ignoreRowDefense`, `guaranteedHit`, `activeWhileDefeated`, `revive`, `bonusShieldDamage` (future shieldbreaker), `offensiveStatOverride`, `damageTrigger` (on-use / turn-start)
  - Stack system: `requiresMinStacks`, `consumesCasterStacks` (with `skipIfStatus` for Limit Break free-use)
  - Effect tags: `multi-strike`, `guaranteed-hit`, `invincible`, `auto-revive`
  - Tag param types: `"skill"` (searchable skill picker dropdown)
  - Triggers: `round-start` on `energyGenerate` (wired into both `startBattle` and `advanceToTurn`)
  - Target types: `lowest-hp-ally`, `fallen-ally`
  - Damage categories: `shielding` (absorbs damage before HP, blue bar overlay, tracked in battle stats)
  - Healing/shielding formula: `BASE_POWER × (SPI / 50) × tierMultiplier` — divisor 50 tuned for base stats around 50
- **UI improvements shipped across sessions**:
  - SkillForm collapsible sections with blue dot indicators
  - Active character panel: buffs/debuffs pills, unaffordable skills greyed out, shield bar overlay
  - Details panel: buff display, skill affordability, shield bar overlay
  - Template spells: affordability check, dead character filtering, AOE targeting (no dropdown), `fallen-ally` support
  - Variable repeat: clickable energy circles replacing slider, capped by available energy
  - Battle stats: collapsible table with Total/Direct/AOE/Indirect/True/Healing/Shields/Taken/Energy/Skills
  - End-of-round modal: energy pool with click-to-convert rainbow
  - Grid characters: defeated greyed out + grayscale, HP border tint (yellow <50%, red <25%), MISS/DODGE/IMMUNE floats
  - Shield visual: blue overlay bar on HP in grid chips, active character panel, and details panel
- **Bug fixes shipped across sessions**: template spell energy cost, defeated cover, choose-mode steal counter, round-1 energy gen, multi-strike cover redirect, template AOE targeting, healing on dead targets blocked
- **Database snapshot import/export shipped** — `db/snapshot.json` workflow for cross-machine sync.
- **Leveling system playtested but not yet tuned** — character leveling (rainbow → +10% combat stats, max Lv 3) and skill points (1 SP/round per living char).
- **Future shop feature** is on the table for the End-of-Round Phase modal — scaffolding is ready.

## Quick orientation for a new Claude

If you're picking this up cold:

1. Skim `src/lib/types.ts` first — every data shape is here
2. Then `src/lib/damage-calc.ts` — pure function, easy to read, shows what fields actually do
3. Then search `src/app/battlefield/page.tsx` for `onApplyAndUse` — that's where 80% of the runtime logic lives
4. Then `src/components/SkillForm.tsx` to see how skill fields get edited
5. Look at how an existing character is configured (Lightning's Elemental Strike is a good example — variant group, status conditions, multi-level scaling) before designing a new one
6. The user designs the character; you build the missing system primitives. Always ask which primitives are needed before starting work.
