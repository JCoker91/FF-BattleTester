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
  "front-row-enemy": "Front Row Enemy",
  "random-enemy": "Random Enemy",
  "aoe-enemy": "AOE Enemy",
  "self-row-enemy": "Self-Row Enemy",
  "target-ally": "Target Ally",
  "target-ally-or-self": "Target Ally or Self",
  "random-ally": "Random Ally",
  "adjacent-ally": "Adjacent Ally",
  "aoe-team": "AOE Team",
  "self": "Self",
  "no-target": "No Target",
};

export interface SkillEffect {
  effectId: string; // → StatusEffect.id
  targetType: TargetType; // who receives this effect
  modifier: number; // % modifier
  duration: number; // turns
  chance?: number; // success chance %, defaults to 100
}

export interface SkillLevel {
  description: string;
  cost: EnergyCost[];
  costNote?: string; // describes variable/flexible cost behavior
  templateId?: string | null;
  instant?: boolean;
  damageCategory?: "physical" | "magical" | "true" | "healing";
  damageTier?: string;
  element?: Element;
  targetType?: TargetType;
  effects?: SkillEffect[]; // buff/debuff applications
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
  type: "number" | "enum" | "string[]";
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
  stats: string[]; // ["atk", "mAtk", "def", "spi", "spd"] or ["none"] for statuses
  defaultModifier?: number;
  stackable?: boolean;
  maxStacks?: number;
  onMaxStacks?: string; // StatusEffect ID to grant when max stacks reached
  resistable?: boolean; // if true, characters can have resistance
  tags?: EffectTag[]; // tagged effects
}

export interface CharacterSkill {
  id: string;
  characterId: string;
  skillId: string;
  formId: string | null; // null = available in all forms
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

  const resolveSkill = (baseSkillId: string | null): Skill | null => {
    if (!baseSkillId) return null;
    const baseSkill = getSkill(baseSkillId);
    if (!baseSkill) return null;
    const baseAssign = getAssignment(baseSkillId);
    if (!baseAssign) return null;
    // If there's a variant for the active form, use it
    if (baseAssign.variantGroupId && activeFormId) {
      const variantAssign = assignments.find(
        (a) =>
          a.variantGroupId === baseAssign.variantGroupId &&
          a.skillId !== baseSkillId &&
          a.formId === activeFormId
      );
      if (variantAssign) {
        const variantSkill = getSkill(variantAssign.skillId);
        if (variantSkill) return variantSkill;
      }
    }
    // If the assignment is form-restricted and doesn't match, hide it
    if (baseAssign.formId && baseAssign.formId !== activeFormId) return null;
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
  stackable?: boolean; // inherited from StatusEffect
  maxStacks?: number; // inherited from StatusEffect
  stacks?: number; // current stack count (default 1)
  onMaxStacks?: string; // StatusEffect ID to grant when max stacks reached
}

export interface DamageResult {
  rawDamage: number;
  atkDefRatio: number;
  tierMultiplier: number;
  elementalModifier: number;
  finalDamage: number;
  isHealing: boolean;
  breakdown: string[];
}
