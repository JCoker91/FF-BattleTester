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

export interface SkillLevel {
  description: string;
  cost: EnergyCost[];
}

export const SKILL_TYPES = ["innate", "basic", "ability"] as const;
export type SkillType = (typeof SKILL_TYPES)[number];

export const SKILL_TYPE_LABELS: Record<SkillType, string> = {
  innate: "Innate",
  basic: "Basic",
  ability: "Ability",
};

export interface Skill {
  id: string;
  name: string;
  characterId: string; // which character owns this skill
  skillType: SkillType;
  levels: [SkillLevel, SkillLevel, SkillLevel];
}

export interface CharacterStats {
  hp: number;
  atk: number;
  mAtk: number;
  def: number;
  res: number;
  spd: number;
}

export interface EnergyGeneration {
  color: EnergyColor;
  amount: number;
}

export interface Character {
  id: string;
  name: string;
  series: string;
  type: CharacterType;
  energyGeneration: EnergyGeneration[];
  stats: CharacterStats;
  equippedInnateId: string | null;
  equippedBasicId: string | null;
  equippedAbilityIds: string[]; // up to 3 abilities equipped for battle
  photoUrl?: string;
  summary?: string;
}

export interface BattlefieldPosition {
  row: number; // 0-2
  col: number; // 0-2
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
