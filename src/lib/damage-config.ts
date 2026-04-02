export const DAMAGE_TIERS = ["random", "minor", "low", "moderate", "high", "severe", "massive"] as const;
export type DamageTier = (typeof DAMAGE_TIERS)[number];

export const DAMAGE_TIER_LABELS: Record<DamageTier, string> = {
  random: "Random",
  minor: "Minor",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
  massive: "Massive",
};

export const DAMAGE_MULTIPLIERS: Record<DamageTier, number> = {
  random: 1.0, // placeholder — resolved at calc time
  minor: 0.3,
  low: 0.5,
  moderate: 1.0,
  high: 1.5,
  severe: 2.0,
  massive: 2.5,
};

export const DAMAGE_CATEGORIES = ["physical", "magical", "true", "healing"] as const;
export type DamageCategory = (typeof DAMAGE_CATEGORIES)[number];

export const DAMAGE_CATEGORY_LABELS: Record<DamageCategory, string> = {
  physical: "Physical",
  magical: "Magical",
  true: "True",
  healing: "Healing",
};

export const BASE_POWER = 10;
