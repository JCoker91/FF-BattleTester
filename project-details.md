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
- Passive flag: `passive` (while-equipped effects auto-apply)
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

Tags are wired into runtime in damage-calc.ts (faster-target-bonus, healing-received, imbue) and in battlefield/page.tsx (everything else — the buff application path, processStartOfTurn, the cover/counter/effect resolution loops, etc.).

### Energy system

5 colors (red, blue, green, purple, yellow) + rainbow as a wildcard. Energy is **shared per team**, not per character — generated per round based on each character's `energyGeneration` config. When a character casts a skill, the cost is deducted from the team pool (rainbow can substitute for any color shortfall).

Rainbow conversion: 2 of any color → 1 rainbow via the conversion modal (click an energy in the pool).

`variableRepeat` skills: cost is per-repeat, color can be specific or `"any"` (player picks the mix at use time via per-color steppers).

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
   - Movements (push-back, pull-forward, teleport-self with player picker)
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
- **Squall (planned)** — Slash → Breaking Slash → Blasting Zone via chain status

**Important rule**: variant siblings with `statusConditionId` set are hidden from the equip UI. Only the base (no status condition) can be equipped; the variants swap in automatically.

### Combat animations (`globals.css`)

- **Attacker slingshot** (`sling-left` / `sling-right`) — pull back, lunge forward, return. 650ms with springy easing. Direction depends on caster's side.
- **Defender recoil** (`recoil-left` / `recoil-right`) — snap away from attacker, elastic return. 550ms.
- **Damage float** — number rises ~80px over 1400ms with smooth cubic-bezier, fades via separate fade keyframe (avoids the "stepping" artifact). Multiple floats per character stagger 260ms via `floatScheduleRef` so they don't overlap.
- **Self-buff flash** — green drop-shadow pulse + jitter, 700ms. Triggered when caster applies a non-debuff effect to themselves.
- **Panel fade-in** — active character panel re-mounts on turn change with `key={activeCharId}` and a 260ms fade.

Pass button has a 180ms delay before advancing the turn so the panel transition reads cleanly.

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

User is configuring these manually in the UI; do not configure them via code.

### Roadmap (after Lightning)

1. **Squall** (Buster) — chain combat (Slash → Breaking Slash → Blasting Zone via status-condition variant group), anti-back-row blast pattern. NEEDS: `row-behind-target` splash pattern.
2. **Aerith** (Specialist) — pure healing focus, white magic content
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

## User preferences (collaboration style)

- The user is the designer and is comfortable with system architecture decisions but wants the assistant to **propose options with tradeoffs**, not just dive in. They make the call, the assistant builds.
- **Don't over-engineer**. When the user says "do X", they often mean a focused minimal version, not a generalized framework.
- **Brainstorm with conviction**. The user explicitly asks for opinions and recommendations. Give them direct picks with reasoning, not wishy-washy "either could work."
- **Reuse mechanics over inventing new ones**. When designing a character, try to express their kit through existing primitives first; only add new ones when truly necessary.
- **Explain the why, briefly**. The user wants to understand the design tradeoff, not just see a list of changes.

## Where we left off (most recent context)

- Lightning's full kit is designed and the user is configuring her conditional skills (Searing Edge / Glacial Lance / Thunderfall) in the UI
- Just removed the Next Turn button (Pass replaces it) and added the bench visibility toggle
- About to start brainstorming Squall but the user requested this handoff doc first
- **Next system to build for Squall**: `row-behind-target` splash pattern. Add to `resolveSplashTargets` in battlefield/page.tsx + `SplashTargetPattern` type in types.ts + SkillForm dropdown option.

## Quick orientation for a new Claude

If you're picking this up cold:

1. Skim `src/lib/types.ts` first — every data shape is here
2. Then `src/lib/damage-calc.ts` — pure function, easy to read, shows what fields actually do
3. Then search `src/app/battlefield/page.tsx` for `onApplyAndUse` — that's where 80% of the runtime logic lives
4. Then `src/components/SkillForm.tsx` to see how skill fields get edited
5. Look at how an existing character is configured (Lightning's Elemental Strike is a good example — variant group, status conditions, multi-level scaling) before designing a new one
6. The user designs the character; you build the missing system primitives. Always ask which primitives are needed before starting work.
