export const ENERGY_COLORS = ["red", "blue", "green", "purple", "yellow"] as const;
export type EnergyColor = (typeof ENERGY_COLORS)[number];

export const CHARACTER_TYPES = [
  "Agent",
  "Specialist",
  "Buster",
  "Vanguard",
  "Arcanist",
] as const;
export type CharacterType = (typeof CHARACTER_TYPES)[number];

export interface EnergyCost {
  color: EnergyColor;
  amount: number;
}

export const TARGET_TYPES = [
  "target-enemy",
  "front-row-enemy",
  "random-enemy",
  "aoe-enemy",
  "self-row-enemy",
  "all-front-row-enemy",
  "all-middle-row-enemy",
  "all-back-row-enemy",
  "front-two-rows-enemy",
  "back-two-rows-enemy",
  "same-line-enemy",
  "column-pierce-enemy",
  "target-ally",
  "target-ally-or-self",
  "random-ally",
  "adjacent-ally",
  "aoe-team",
  "self",
  "no-target",
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  "target-enemy": "Target Enemy",
  "front-row-enemy": "Front Row Enemy (single)",
  "random-enemy": "Random Enemy",
  "aoe-enemy": "AOE Enemy (all)",
  "self-row-enemy": "Self-Row Enemy",
  "all-front-row-enemy": "All Front Row Enemies",
  "all-middle-row-enemy": "All Middle Row Enemies",
  "all-back-row-enemy": "All Back Row Enemies",
  "front-two-rows-enemy": "Front + Middle Rows",
  "back-two-rows-enemy": "Middle + Back Rows",
  "same-line-enemy": "Enemies in Caster's Line",
  "column-pierce-enemy": "Column Pierce (front + behind)",
  "target-ally": "Target Ally",
  "target-ally-or-self": "Target Ally or Self",
  "random-ally": "Random Ally",
  "adjacent-ally": "Adjacent Ally",
  "aoe-team": "AOE Team",
  "self": "Self",
  "no-target": "No Target",
};

export const EFFECT_TRIGGERS = ["on-use", "while-equipped", "on-attack-hit", "turn-start", "round-start", "on-hp-below", "on-hp-above"] as const;
export type EffectTrigger = (typeof EFFECT_TRIGGERS)[number];

export const EFFECT_TRIGGER_LABELS: Record<EffectTrigger, string> = {
  "on-use": "On Use",
  "while-equipped": "While Equipped",
  "on-attack-hit": "On Attack Hit",
  "turn-start": "Turn Start",
  "round-start": "Round Start",
  "on-hp-below": "On HP Below %",
  "on-hp-above": "On HP At/Above %",
};

export interface SkillEffect {
  effectId: string; // → StatusEffect.id
  targetType: TargetType; // who receives this effect
  modifier: number; // % modifier
  duration: number; // turns
  chance?: number; // success chance %, defaults to 100
  trigger?: EffectTrigger; // when this effect fires, defaults to "on-use"
  triggerValue?: number; // threshold for on-hp-below/on-hp-above (percentage)
  once?: boolean; // if true, only fires once per battle
  untilNextTurn?: boolean; // "until next turn": buff does not tick on the caster's current turn even if the skill is instant — it survives until the caster's next turn then expires
}

export interface RandomEffectPool {
  pickCount: number; // how many effects to randomly select from the pool (no duplicates)
  effects: SkillEffect[]; // candidate effects
}

export interface ResistanceGrant {
  type: "status" | "elemental"; // what kind of resistance
  targetId: string; // StatusEffect.id (for status) or Element name (for elemental)
  value: number; // % resistance to add (e.g. +50 = 50% more resistance)
}

export interface DispelAction {
  category: "buff" | "debuff" | "any"; // what category of statuses to remove
  count: number; // how many to remove, -1 for all
  targetType: TargetType; // who gets dispelled
}

export const MOVEMENT_TYPES = ["push-back", "push-back-one", "pull-forward", "pull-forward-one", "teleport-self", "recoil-self-one", "switch-self-adjacent"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  "push-back": "Push to Back Row",
  "push-back-one": "Push Back 1 Space",
  "pull-forward": "Pull to Front Row",
  "pull-forward-one": "Pull Forward 1 Space",
  "teleport-self": "Teleport Self to Empty Space",
  "recoil-self-one": "Recoil Self 1 Space Back",
  "switch-self-adjacent": "Switch Self to Adjacent Space (player picks)",
};

export const MOVEMENT_TIMINGS = ["before-damage", "after-damage"] as const;
export type MovementTiming = (typeof MOVEMENT_TIMINGS)[number];

export const MOVEMENT_TIMING_LABELS: Record<MovementTiming, string> = {
  "before-damage": "Before Damage",
  "after-damage": "After Damage",
};

export interface MovementAction {
  type: MovementType;
  targetType: TargetType; // not used for teleport-self / recoil-self-one / switch-self-adjacent (implicit self)
  trigger?: EffectTrigger; // when this movement fires, defaults to "on-use"
  destinationSide?: "ally" | "enemy"; // for teleport-self: which team's grid to teleport to
  timing?: MovementTiming; // when during skill resolution this movement fires, defaults to "after-damage". Note: picker-based movements (teleport-self, switch-self-adjacent) always resolve asynchronously via user click regardless of timing.
}

export interface EnergyStealAction {
  count: number;
  mode: "random" | "choose"; // random pulls random colors; choose lets player pick
  trigger?: EffectTrigger; // defaults to "on-use"
}

export interface EnergyGenerateAction {
  count: number;
  mode: "random" | "choose" | "specific"; // specific = always the configured color
  color?: EnergyColor; // for specific mode
  trigger?: EffectTrigger; // defaults to "on-use"
}

export interface SkillLevel {
  description: string;
  cost: EnergyCost[];
  costNote?: string; // describes variable/flexible cost behavior
  templateId?: string | null;
  instant?: boolean;
  passive?: boolean; // "while equipped" — effects auto-apply permanently while skill is equipped
  activeWhileDefeated?: boolean; // if true, passive/while-equipped effects persist even when the character is defeated (default: false)
  damageCategory?: "physical" | "magical" | "true" | "healing";
  rangeTags?: ("melee" | "ranged" | "magic")[]; // optional delivery tags; melee triggers back-row damage penalty
  damageTier?: string;
  randomTierPool?: string[]; // when damageTier is "random", restrict the pool to these tiers
  damageSourceOverride?: "direct" | "aoe" | "indirect"; // override the inferred direct/aoe category (e.g. mark a single-target skill as indirect)
  element?: Element;
  targetType?: TargetType;
  ignoreDefense?: number; // % of target's DEF to ignore (0-100), physical attacks only
  ignoreSpirit?: number; // % of target's SPI to ignore (0-100), magical attacks only
  ignoreRowDefense?: boolean; // when true, the defender's back-row -20% taken modifier is bypassed (anti-back-row sniping skills)
  guaranteedHit?: boolean; // when true, this skill bypasses miss-chance, dodge-chance, and cover redirect
  effects?: SkillEffect[]; // buff/debuff applications
  randomEffectPools?: RandomEffectPool[]; // pools of candidate effects, randomly picked at use time
  chooseEffectPools?: RandomEffectPool[]; // pools of candidate effects, player picks at use time
  cycleEffectPools?: RandomEffectPool[]; // pools of candidate effects, cycled through in order on each trigger (turn-start passive use)
  resistanceGrants?: ResistanceGrant[]; // passive resistance bonuses (status or elemental)
  dispels?: DispelAction[]; // remove buffs/debuffs from targets
  movements?: MovementAction[]; // grid position changes
  energySteal?: EnergyStealAction; // steal energy from enemy team
  energyGenerate?: EnergyGenerateAction; // generate energy for own team
  stolenEnergyScaling?: { perStack: number; maxStacks: number; resetOnUse: boolean }; // damage bonus per stolen energy by this caster
  hpCost?: number; // % of caster's max HP dealt as true self-damage when using this skill
  casterMissingHpScaling?: number; // cap on % bonus damage scaled 1:1 with caster's missing HP %
  giantSlayerMaxBonus?: number; // max % bonus damage at target full HP, scales linearly to 0 at 0% HP
  executeBonus?: { threshold: number; maxBonus: number }; // bonus % damage scaling up as target HP drops below threshold
  bonusHpDamage?: { percent: number; source: "max" | "current" }; // adds % of target HP as additional damage (same category, defended normally)
  bonusDamageVsStatus?: { statusEffectId: string; percent: number }; // bonus % damage when the defender has the named status effect active
  splashHit?: SplashHit; // secondary damage payload that hits additional targets after the primary hit lands
  requiresAnyStatus?: string[]; // skill is disabled in the action bar unless the caster has at least one of these status effects active
  consumesCasterImbue?: boolean; // after damage applies, strip all imbue-tagged buffs from the caster
}

export type SplashTargetPattern =
  | "adjacent-of-target" // 4-directional neighbors of the primary target (same row ±1 col, or same col ±1 row)
  | "all-other-enemies" // every enemy on the opposing team except the primary target
  | "row-behind-target"; // every unit in the depth lane immediately behind the primary target (same side, col === primary.col + 1, any lateral row)

export interface SplashHit {
  damageTier: string; // "minor" | "low" | "moderate" | "high" | "severe" | "massive" — uses the same multipliers
  damageCategory: "physical" | "magical" | "true";
  damageSourceOverride?: "direct" | "aoe" | "indirect"; // defaults to "indirect" — splash is rarely "direct"
  targetPattern: SplashTargetPattern;
  inheritElement?: boolean; // if true, splash inherits the primary attack's resolved element (default true)
  variableRepeat?: { color: EnergyColor | "any"; max: number }; // ramping cost: player chooses 1..max extra energies of this color to spend ("any" lets the player pick the color at use time), skill damage repeats once per energy spent (random-enemy re-rolls per hit)
}

export const SKILL_TYPES = ["innate", "basic", "ability", "conditional"] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

export const SKILL_TYPE_LABELS: Record<SkillType, string> = {
  innate: "Innate",
  basic: "Basic",
  ability: "Ability",
  conditional: "Conditional",
};

export interface Skill {
  id: string;
  name: string;
  description: string;
  skillType: SkillType;
  leveled: boolean;
  levels: [SkillLevel, SkillLevel, SkillLevel];
}

export const CONDITION_TYPES = ["form", "buff", "debuff", "status", "hp-below", "hp-above"] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  "form": "Form",
  "buff": "Has Buff",
  "debuff": "Has Debuff",
  "status": "Has Status",
  "hp-below": "HP Below",
  "hp-above": "HP Above",
};

export interface SkillCondition {
  type: ConditionType;
  value: string; // formId, statusEffect ID, "any" for debuff, or percentage (e.g. "50")
}

// --- Tagged effect system ---

export interface EffectTag {
  type: string; // references EffectTagType.name
  params: Record<string, unknown>;
}

export interface ParamDef {
  type: "number" | "enum" | "string[]" | "skill";
  label: string;
  default?: unknown;
  options?: string[]; // for enum type
}

export interface EffectTagType {
  id: string;
  name: string; // unique slug: "dot", "miss-chance", etc.
  label: string;
  description: string;
  paramSchema: Record<string, ParamDef>;
  sortOrder: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  category: "buff" | "debuff" | "status";
  polarity?: "positive" | "negative"; // for status category — is this a good or bad effect? (buffs default positive, debuffs default negative)
  stats: string[]; // ["atk", "mAtk", "def", "spi", "spd"] or ["none"] for statuses
  defaultModifier?: number;
  stackable?: boolean;
  maxStacks?: number;
  onMaxStacks?: string; // StatusEffect ID to grant when max stacks reached
  resistable?: boolean; // if true, characters can have resistance
  tags?: EffectTag[]; // tagged effects
  formId?: string; // if set, applying this status auto-switches the character to this form
  dispellable?: boolean; // defaults to true — if false, cannot be removed by dispel effects
}

export interface CharacterSkill {
  id: string;
  characterId: string;
  skillId: string;
  formId: string | null; // null = available in all forms
  statusConditionId?: string | null; // if set, this variant only swaps in / is available when this status is active on the caster
  variantGroupId: string | null; // character-specific variant linking
  conditions?: SkillCondition[]; // additional conditions for conditional skills (AND logic)
}

export interface TemplateAction {
  id: string;
  templateId: string;
  skillId: string; // references a Skill from the skills table
  sortOrder: number;
}

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
}

export interface CharacterStats {
  hp: number;
  atk: number;
  mAtk: number;
  def: number;
  spi: number;
  spd: number;
}

export const ELEMENTS = ["fire", "ice", "thunder", "wind", "earth", "dark", "light"] as const;
export type Element = (typeof ELEMENTS)[number];

export const ELEMENT_LABELS: Record<Element, string> = {
  fire: "Fire",
  ice: "Ice",
  thunder: "Thunder",
  wind: "Wind",
  earth: "Earth",
  dark: "Dark",
  light: "Light",
};

export const ELEMENT_ICONS: Record<Element, string> = {
  fire: "🔥",
  ice: "❄️",
  thunder: "⚡",
  wind: "🌀",
  earth: "🪨",
  dark: "🌑",
  light: "✨",
};

export type ElementalValues = Record<Element, number>;

export const DEFAULT_ELEMENTAL: ElementalValues = {
  fire: 100, ice: 100, thunder: 100, wind: 100, earth: 100, dark: 100, light: 100,
};

export interface EnergyGeneration {
  color: EnergyColor;
  amount: number;
}

export type StatOverrides = Partial<Omit<CharacterStats, "hp">>;

export interface Form {
  id: string;
  characterId: string;
  name: string;
  sortOrder: number;
  photoUrl?: string;
  typeOverride?: CharacterType;
  energyOverride?: EnergyGeneration[];
  statOverrides?: StatOverrides;
  elementalResOverride?: Partial<ElementalValues>;
  elementalDmgOverride?: Partial<ElementalValues>;
  statusResistanceOverride?: Record<string, number>; // effectId → avoidance% override
  startable?: boolean; // if false, cannot be selected as starting form in staging (default true)
  summary?: string;
}

export interface FormLoadout {
  innateId: string | null;
  basicId: string | null;
  abilityIds: string[]; // up to 3
}

export interface Character {
  id: string;
  name: string;
  series: string;
  type: CharacterType;
  energyGeneration: EnergyGeneration[];
  stats: CharacterStats;
  elementalResistance: ElementalValues;
  elementalDamage: ElementalValues;
  equippedLoadout: FormLoadout;
  statusResistance: Record<string, number>; // effectId → avoidance% (0 = fully susceptible, 100 = immune)
  photoUrl?: string;
  summary?: string;
  gender?: "male" | "female" | "other";
  showInBench?: boolean; // when false, the character is hidden from the battlefield staging bench
}

export interface BattleState {
  buffs: BuffDebuff[];
  currentHp: number;
  maxHp: number;
}

/**
 * Resolve what skills are visible for a given form.
 * Takes the base loadout and swaps in variants for the active form.
 * Returns the resolved innate, basic, abilities, and conditionals.
 * When battleState is provided, conditional conditions (buff, hp-below, hp-above) are evaluated.
 */
export function resolveFormView(
  char: Character,
  activeFormId: string | null,
  allSkills: Skill[],
  charAssignments: CharacterSkill[],
  battleState?: BattleState
): { innate: Skill | null; basic: Skill | null; abilities: Skill[]; conditionals: Skill[] } {
  const lo = char.equippedLoadout;
  // Get skill IDs assigned to this character
  const assignments = charAssignments.filter((a) => a.characterId === char.id);
  const getSkill = (skillId: string) => allSkills.find((s) => s.id === skillId);
  const getAssignment = (skillId: string) => assignments.find((a) => a.skillId === skillId);

  const activeBuffIds = new Set((battleState?.buffs ?? []).map((b) => b.effectId));

  const resolveSkill = (baseSkillId: string | null): Skill | null => {
    if (!baseSkillId) return null;
    const baseSkill = getSkill(baseSkillId);
    if (!baseSkill) return null;
    const baseAssign = getAssignment(baseSkillId);
    if (!baseAssign) return null;
    if (baseAssign.variantGroupId) {
      // Prefer status-based variants first (highest priority — they reflect dynamic battle state)
      const statusVariant = assignments.find(
        (a) =>
          a.variantGroupId === baseAssign.variantGroupId &&
          a.skillId !== baseSkillId &&
          a.statusConditionId &&
          activeBuffIds.has(a.statusConditionId)
      );
      if (statusVariant) {
        const v = getSkill(statusVariant.skillId);
        if (v) return v;
      }
      // Fall back to form-based variants
      if (activeFormId) {
        const formVariant = assignments.find(
          (a) =>
            a.variantGroupId === baseAssign.variantGroupId &&
            a.skillId !== baseSkillId &&
            a.formId === activeFormId
        );
        if (formVariant) {
          const v = getSkill(formVariant.skillId);
          if (v) return v;
        }
      }
    }
    // If the assignment is form-restricted and doesn't match, hide it
    if (baseAssign.formId && baseAssign.formId !== activeFormId) return null;
    // If the assignment is status-restricted and the status isn't active, hide it
    if (baseAssign.statusConditionId && !activeBuffIds.has(baseAssign.statusConditionId)) return null;
    return baseSkill;
  };

  const innate = resolveSkill(lo.innateId);
  const basic = resolveSkill(lo.basicId);

  const abilities: Skill[] = [];
  for (const abilityId of lo.abilityIds) {
    const resolved = resolveSkill(abilityId);
    if (resolved) abilities.push(resolved);
  }

  // Conditionals: auto-active for the active form
  const allEquippedIds = new Set<string>([
    ...(lo.innateId ? [lo.innateId] : []),
    ...(lo.basicId ? [lo.basicId] : []),
    ...lo.abilityIds,
  ]);

  const conditionals = assignments
    .filter((a) => {
      const skill = getSkill(a.skillId);
      if (!skill || skill.skillType !== "conditional") return false;
      // Form check (legacy formId field)
      if (a.formId !== null && a.formId !== activeFormId) return false;
      // Status check: if a status condition is set, that status must be active
      if (a.statusConditionId && !activeBuffIds.has(a.statusConditionId)) return false;
      // Variant group check
      if (a.variantGroupId) {
        const hasVariantMatch = assignments.some(
          (sibling) =>
            sibling.variantGroupId === a.variantGroupId &&
            sibling.skillId !== a.skillId &&
            allEquippedIds.has(sibling.skillId)
        );
        if (!hasVariantMatch) return false;
      }
      // Evaluate additional conditions (all must pass = AND logic)
      if (a.conditions && a.conditions.length > 0) {
        for (const cond of a.conditions) {
          switch (cond.type) {
            case "form":
              if (activeFormId !== cond.value) return false;
              break;
            case "buff":
              // Only evaluate during battle
              if (!battleState) return true; // show in non-battle contexts
              if (!battleState.buffs.some((b) => b.effectId === cond.value)) return false;
              break;
            case "debuff":
              if (!battleState) return true;
              if (cond.value === "any") {
                if (!battleState.buffs.some((b) => b.category === "debuff")) return false;
              } else {
                if (!battleState.buffs.some((b) => b.effectId === cond.value)) return false;
              }
              break;
            case "status":
              if (!battleState) return true;
              if (cond.value === "any") {
                if (!battleState.buffs.some((b) => b.category === "status")) return false;
              } else {
                if (!battleState.buffs.some((b) => b.effectId === cond.value)) return false;
              }
              break;
            case "hp-below":
              if (!battleState) return true;
              if ((battleState.currentHp / battleState.maxHp) * 100 >= parseFloat(cond.value)) return false;
              break;
            case "hp-above":
              if (!battleState) return true;
              if ((battleState.currentHp / battleState.maxHp) * 100 <= parseFloat(cond.value)) return false;
              break;
          }
        }
      }
      return true;
    })
    .map((a) => getSkill(a.skillId)!)
    .filter(Boolean);

  return { innate, basic, abilities, conditionals };
}

/**
 * Toggle equip/unequip on the base loadout.
 */
export function toggleEquipLoadout(
  loadout: FormLoadout,
  skillId: string,
  skillType: SkillType
): FormLoadout {
  const lo = { ...loadout };
  if (skillType === "innate") {
    lo.innateId = lo.innateId === skillId ? null : skillId;
  } else if (skillType === "basic") {
    lo.basicId = lo.basicId === skillId ? null : skillId;
  } else if (skillType === "ability") {
    if (lo.abilityIds.includes(skillId)) {
      lo.abilityIds = lo.abilityIds.filter((id) => id !== skillId);
    } else if (lo.abilityIds.length < 3) {
      lo.abilityIds = [...lo.abilityIds, skillId];
    }
  }
  return lo;
}

export interface GlossaryEntry {
  id: string;
  keyword: string; // unique slug, e.g. "trance", "poison"
  label: string; // display name, e.g. "Trance"
  description: string; // tooltip text
}

export interface BattlefieldPosition {
  row: number;
  col: number;
}

export interface PlacedCharacter {
  characterId: string;
  position: BattlefieldPosition;
}

export interface Team {
  id: string;
  name: string;
  side: "left" | "right";
  placements: PlacedCharacter[];
}

// --- Battle types ---

export interface BuffDebuff {
  id: string;
  effectId: string; // → StatusEffect.id
  effectName: string; // denormalized from StatusEffect for display
  category: "buff" | "debuff" | "status"; // denormalized from StatusEffect
  stats: string[]; // resolved from StatusEffect — e.g. ["atk", "def"] or ["none"]
  modifier: number; // percentage per stack, e.g. +25 or -30
  duration: number; // turns remaining: -1 = permanent, >0 = turns left, 0 = expired
  tags?: EffectTag[]; // tagged effects from StatusEffect
  source: string; // skill name — matching key for stacking
  sourceCharId?: string; // who applied this buff (needed for force-target, block-target)
  stackable?: boolean; // inherited from StatusEffect
  maxStacks?: number; // inherited from StatusEffect
  stacks?: number; // current stack count (default 1)
  onMaxStacks?: string; // StatusEffect ID to grant when max stacks reached
  appliedTurn?: number; // turn index when this buff was applied (skip ticking on same turn)
  untilNextTurn?: boolean; // expires at the start of the caster's next turn (duration is ignored)
}

export interface DamageResult {
  rawDamage: number;
  atkDefRatio: number;
  tierMultiplier: number;
  elementalModifier: number;
  finalDamage: number;
  isHealing: boolean;
  element?: Element | null; // resolved element after imbue, etc.
  breakdown: string[];
}
