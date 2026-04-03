import {
  CharacterStats,
  ElementalValues,
  Element,
  SkillLevel,
  BuffDebuff,
  DamageResult,
  DEFAULT_ELEMENTAL,
} from "./types";
import { BASE_POWER, DAMAGE_MULTIPLIERS, DamageTier } from "./damage-config";

interface CombatantStats {
  stats: CharacterStats;
  elementalResistance: ElementalValues;
  elementalDamage: ElementalValues;
  buffs: BuffDebuff[];
}

/**
 * Get the effective value of a stat after applying all matching buffs/debuffs.
 * Buffs are additive percentages: +25 and -10 on ATK 50 = 50 * (1 + 0.15) = 57.5
 */
function getEffectiveStat(baseValue: number, stat: string, buffs: BuffDebuff[]): number {
  const totalModifier = buffs
    .filter((b) => b.stats.includes(stat))
    .reduce((sum, b) => sum + b.modifier * (b.stacks ?? 1), 0);
  // Clamp modifier to -90% to +200%
  const clamped = Math.max(-90, Math.min(200, totalModifier));
  return Math.max(1, baseValue * (1 + clamped / 100));
}

/**
 * Get effective elemental value after buffs.
 * e.g. stat key "eleRes.fire" modifies fire resistance
 */
function getEffectiveElemental(
  baseValues: ElementalValues,
  element: Element,
  prefix: "eleRes" | "eleDmg",
  buffs: BuffDebuff[]
): number {
  const baseValue = baseValues[element] ?? 100;
  const buffKey = `${prefix}.${element}`;
  const totalModifier = buffs
    .filter((b) => b.stats.includes(buffKey))
    .reduce((sum, b) => sum + b.modifier * (b.stacks ?? 1), 0);
  return Math.max(0, baseValue + totalModifier);
}

/**
 * Calculate damage or healing from a skill level.
 */
export function calculateDamage(
  attacker: CombatantStats,
  defender: CombatantStats,
  skillLevel: SkillLevel
): DamageResult {
  const breakdown: string[] = [];
  const category = skillLevel.damageCategory;
  const ROLLABLE_TIERS: DamageTier[] = ["minor", "low", "moderate", "high", "severe", "massive"];
  let tier = (skillLevel.damageTier ?? "moderate") as DamageTier;
  if (tier === "random") {
    tier = ROLLABLE_TIERS[Math.floor(Math.random() * ROLLABLE_TIERS.length)];
    breakdown.push(`Random tier rolled: ${tier}`);
  }
  const tierMult = DAMAGE_MULTIPLIERS[tier] ?? 1.0;
  const element = skillLevel.element ?? null;
  const isHealing = category === "healing";

  if (!category) {
    return {
      rawDamage: 0,
      atkDefRatio: 0,
      tierMultiplier: tierMult,
      elementalModifier: 0,
      finalDamage: 0,
      isHealing: false,
      breakdown: ["No damage category set on this skill level."],
    };
  }

  // Determine offensive and defensive stats
  let offensiveStat: number;
  let defensiveStat: number;

  const isTrue = category === "true";

  if (isHealing) {
    // Healing uses SPI, no defense involved
    offensiveStat = getEffectiveStat(attacker.stats.spi, "spi", attacker.buffs);
    defensiveStat = 1;
    breakdown.push(`Healer SPI: ${attacker.stats.spi} → ${offensiveStat.toFixed(1)} (after buffs)`);
  } else if (isTrue) {
    // True damage ignores defense entirely
    offensiveStat = 1;
    defensiveStat = 1;
    breakdown.push(`True damage — ignores defense`);
  } else if (category === "physical") {
    offensiveStat = getEffectiveStat(attacker.stats.atk, "atk", attacker.buffs);
    defensiveStat = getEffectiveStat(defender.stats.def, "def", defender.buffs);
    breakdown.push(`ATK: ${attacker.stats.atk} → ${offensiveStat.toFixed(1)} (after buffs)`);
    breakdown.push(`DEF: ${defender.stats.def} → ${defensiveStat.toFixed(1)} (after buffs)`);
  } else {
    // magical
    offensiveStat = getEffectiveStat(attacker.stats.mAtk, "mAtk", attacker.buffs);
    defensiveStat = getEffectiveStat(defender.stats.spi, "spi", defender.buffs);
    breakdown.push(`MATK: ${attacker.stats.mAtk} → ${offensiveStat.toFixed(1)} (after buffs)`);
    breakdown.push(`SPI: ${defender.stats.spi} → ${defensiveStat.toFixed(1)} (after buffs)`);
  }

  // Apply ignore defense / ignore spirit (reduces effective DEF or SPI for this hit only)
  const ignorePct = category === "physical" ? (skillLevel.ignoreDefense ?? 0) : category === "magical" ? (skillLevel.ignoreSpirit ?? 0) : 0;
  if (ignorePct > 0) {
    const label = category === "physical" ? "DEF" : "SPI";
    const before = defensiveStat;
    defensiveStat = Math.max(1, defensiveStat * (1 - ignorePct / 100));
    breakdown.push(`Ignore ${label}: ${ignorePct}% — ${label} ${before.toFixed(1)} → ${defensiveStat.toFixed(1)}`);
  }

  // ATK/DEF ratio (true damage uses flat 1.0 ratio)
  const ratio = isHealing ? offensiveStat / 50 : isTrue ? 1.0 : offensiveStat / defensiveStat;
  breakdown.push(`Ratio: ${ratio.toFixed(2)}`);

  // Base damage
  const rawDamage = BASE_POWER * ratio * tierMult;
  breakdown.push(`Base: ${BASE_POWER} × ${ratio.toFixed(2)} × ${tierMult} (${tier}) = ${rawDamage.toFixed(1)}`);

  // Elemental modifier (skip for healing)
  let elementalModifier = 0;
  let finalDamage = rawDamage;

  if (element && !isHealing) {
    const attackerElemDmg = getEffectiveElemental(
      attacker.elementalDamage,
      element,
      "eleDmg",
      attacker.buffs
    );
    const defenderElemRes = getEffectiveElemental(
      defender.elementalResistance,
      element,
      "eleRes",
      defender.buffs
    );
    elementalModifier = (attackerElemDmg - defenderElemRes) / 100;
    finalDamage = rawDamage * (1 + elementalModifier);
    breakdown.push(
      `Elemental (${element}): ${attackerElemDmg}% dmg - ${defenderElemRes}% res = ${elementalModifier > 0 ? "+" : ""}${(elementalModifier * 100).toFixed(0)}%`
    );
    breakdown.push(`Final: ${rawDamage.toFixed(1)} × ${(1 + elementalModifier).toFixed(2)} = ${finalDamage.toFixed(1)}`);
  }

  // Variance: ±10% random
  const variance = 0.9 + Math.random() * 0.2;
  finalDamage = finalDamage * variance;
  breakdown.push(`Variance: ×${variance.toFixed(2)} = ${finalDamage.toFixed(1)}`);

  // Round up to integer
  finalDamage = Math.ceil(finalDamage);

  return {
    rawDamage: Math.ceil(rawDamage),
    atkDefRatio: Math.round(ratio * 100) / 100,
    tierMultiplier: tierMult,
    elementalModifier: Math.round(elementalModifier * 100),
    finalDamage: Math.max(isHealing ? finalDamage : 1, finalDamage), // min 1 damage for attacks
    isHealing,
    breakdown,
  };
}
