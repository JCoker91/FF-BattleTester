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
  currentHp?: number; // current HP for HP-based scaling (defaults to max HP if not provided)
  stolenEnergyCount?: number; // total energy stolen by this character so far this battle
  col?: number; // grid column: 0 = front, 1 = middle, 2 = back
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
    const pool = (skillLevel.randomTierPool && skillLevel.randomTierPool.length > 0
      ? (skillLevel.randomTierPool.filter((t) => ROLLABLE_TIERS.includes(t as DamageTier)) as DamageTier[])
      : ROLLABLE_TIERS);
    tier = pool[Math.floor(Math.random() * pool.length)];
    breakdown.push(`Random tier rolled: ${tier}`);
  }
  const tierMult = DAMAGE_MULTIPLIERS[tier] ?? 1.0;
  let element = skillLevel.element ?? null;
  const isHealing = category === "healing";
  const isShielding = category === "shielding";

  // Imbue override: physical attacks with no element set pick up the attacker's imbue.
  if (category === "physical" && !element) {
    for (const b of attacker.buffs) {
      if (!b.tags) continue;
      let matched: Element | null = null;
      for (const t of b.tags) {
        if (t.type === "fire-imbue") { matched = "fire"; break; }
        if (t.type === "ice-imbue") { matched = "ice"; break; }
        if (t.type === "thunder-imbue") { matched = "thunder"; break; }
      }
      if (matched) { element = matched; break; }
    }
    if (element) breakdown.push(`Imbue: physical attack gains ${element} element.`);
  }

  if (!category) {
    return {
      rawDamage: 0,
      atkDefRatio: 0,
      tierMultiplier: tierMult,
      elementalModifier: 0,
      finalDamage: 0,
      isHealing: false,
      isShielding: false,
      element,
      breakdown: ["No damage category set on this skill level."],
    };
  }

  // Determine offensive and defensive stats
  let offensiveStat: number;
  let defensiveStat: number;

  const isTrue = category === "true";

  // Offensive stat override: if set, use the specified stat instead of the category default
  const offStatKey = skillLevel.offensiveStatOverride;

  if (isHealing || isShielding) {
    const healStat = offStatKey ?? "spi";
    offensiveStat = getEffectiveStat(attacker.stats[healStat as keyof CharacterStats] as number, healStat, attacker.buffs);
    defensiveStat = 1;
    breakdown.push(`${isShielding ? "Shield" : "Healer"} ${healStat.toUpperCase()}: ${(attacker.stats[healStat as keyof CharacterStats])} → ${offensiveStat.toFixed(1)} (after buffs)`);
  } else if (isTrue) {
    // True damage ignores defense entirely
    if (offStatKey) {
      offensiveStat = getEffectiveStat(attacker.stats[offStatKey as keyof CharacterStats] as number, offStatKey, attacker.buffs);
      defensiveStat = 1;
      breakdown.push(`True damage (${offStatKey.toUpperCase()}-based): ${(attacker.stats[offStatKey as keyof CharacterStats])} → ${offensiveStat.toFixed(1)} (after buffs)`);
    } else {
      offensiveStat = 1;
      defensiveStat = 1;
      breakdown.push(`True damage — ignores defense`);
    }
  } else if (category === "physical") {
    const atkStat = offStatKey ?? "atk";
    offensiveStat = getEffectiveStat(attacker.stats[atkStat as keyof CharacterStats] as number, atkStat, attacker.buffs);
    defensiveStat = getEffectiveStat(defender.stats.def, "def", defender.buffs);
    breakdown.push(`${atkStat.toUpperCase()}: ${(attacker.stats[atkStat as keyof CharacterStats])} → ${offensiveStat.toFixed(1)} (after buffs)`);
    breakdown.push(`DEF: ${defender.stats.def} → ${defensiveStat.toFixed(1)} (after buffs)`);
  } else {
    // magical
    const matkStat = offStatKey ?? "mAtk";
    offensiveStat = getEffectiveStat(attacker.stats[matkStat as keyof CharacterStats] as number, matkStat, attacker.buffs);
    defensiveStat = getEffectiveStat(defender.stats.spi, "spi", defender.buffs);
    breakdown.push(`${matkStat.toUpperCase()}: ${(attacker.stats[matkStat as keyof CharacterStats])} → ${offensiveStat.toFixed(1)} (after buffs)`);
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
  const ratio = (isHealing || isShielding) ? offensiveStat / 50 : isTrue ? 1.0 : offensiveStat / defensiveStat;
  breakdown.push(`Ratio: ${ratio.toFixed(2)}`);

  // Base damage
  let rawDamage = BASE_POWER * ratio * tierMult;
  breakdown.push(`Base: ${BASE_POWER} × ${ratio.toFixed(2)} × ${tierMult} (${tier}) = ${rawDamage.toFixed(1)}`);

  // HP-based bonus scalings (skip for healing)
  if (!isHealing) {
    // Caster missing HP scaling (1:1 with missing HP %, capped)
    if (skillLevel.casterMissingHpScaling && skillLevel.casterMissingHpScaling > 0) {
      const aMaxHp = attacker.stats.hp;
      const aCurHp = attacker.currentHp ?? aMaxHp;
      const missingPct = Math.max(0, ((aMaxHp - aCurHp) / aMaxHp) * 100);
      const bonusPct = Math.min(missingPct, skillLevel.casterMissingHpScaling);
      if (bonusPct > 0) {
        const before = rawDamage;
        rawDamage = rawDamage * (1 + bonusPct / 100);
        breakdown.push(`Missing HP bonus: +${bonusPct.toFixed(0)}% — ${before.toFixed(1)} → ${rawDamage.toFixed(1)}`);
      }
    }
    // Giant Slayer (more damage to high HP targets)
    if (skillLevel.giantSlayerMaxBonus && skillLevel.giantSlayerMaxBonus > 0) {
      const dMaxHp = defender.stats.hp;
      const dCurHp = defender.currentHp ?? dMaxHp;
      const targetHpPct = Math.max(0, Math.min(100, (dCurHp / dMaxHp) * 100));
      const bonusPct = (targetHpPct / 100) * skillLevel.giantSlayerMaxBonus;
      if (bonusPct > 0) {
        const before = rawDamage;
        rawDamage = rawDamage * (1 + bonusPct / 100);
        breakdown.push(`Giant Slayer: +${bonusPct.toFixed(0)}% — ${before.toFixed(1)} → ${rawDamage.toFixed(1)}`);
      }
    }
    // Execute (more damage to low HP targets)
    if (skillLevel.executeBonus && skillLevel.executeBonus.maxBonus > 0) {
      const dMaxHp = defender.stats.hp;
      const dCurHp = defender.currentHp ?? dMaxHp;
      const targetHpPct = Math.max(0, Math.min(100, (dCurHp / dMaxHp) * 100));
      const { threshold, maxBonus } = skillLevel.executeBonus;
      let bonusPct = 0;
      if (targetHpPct <= threshold) {
        bonusPct = maxBonus;
      } else if (threshold < 100) {
        bonusPct = maxBonus * ((100 - targetHpPct) / (100 - threshold));
      }
      if (bonusPct > 0) {
        const before = rawDamage;
        rawDamage = rawDamage * (1 + bonusPct / 100);
        breakdown.push(`Execute: +${bonusPct.toFixed(0)}% — ${before.toFixed(1)} → ${rawDamage.toFixed(1)}`);
      }
    }
    // Bonus HP damage (% of target's max or current HP, processed through ratio so defenses still apply)
    if (skillLevel.bonusHpDamage && skillLevel.bonusHpDamage.percent > 0) {
      const dMaxHp = defender.stats.hp;
      const dCurHp = defender.currentHp ?? dMaxHp;
      const hpBase = skillLevel.bonusHpDamage.source === "current" ? dCurHp : dMaxHp;
      const bonusBase = hpBase * (skillLevel.bonusHpDamage.percent / 100);
      const bonusDamage = bonusBase * ratio;
      const before = rawDamage;
      rawDamage = rawDamage + bonusDamage;
      breakdown.push(`Bonus ${skillLevel.bonusHpDamage.percent}% ${skillLevel.bonusHpDamage.source} HP: +${bonusDamage.toFixed(1)} (${hpBase} × ${(skillLevel.bonusHpDamage.percent / 100).toFixed(2)} × ${ratio.toFixed(2)}) — ${before.toFixed(1)} → ${rawDamage.toFixed(1)}`);
    }
    // Bonus damage when defender has a specific status active
    if (skillLevel.bonusDamageVsStatus && skillLevel.bonusDamageVsStatus.percent > 0) {
      const targetStatusId = skillLevel.bonusDamageVsStatus.statusEffectId;
      const hasStatus = defender.buffs.some((b) => b.effectId === targetStatusId);
      if (hasStatus) {
        const before = rawDamage;
        rawDamage = rawDamage * (1 + skillLevel.bonusDamageVsStatus.percent / 100);
        breakdown.push(`Bonus vs status: +${skillLevel.bonusDamageVsStatus.percent}% — ${before.toFixed(1)} → ${rawDamage.toFixed(1)}`);
      }
    }
    // Stolen energy scaling — bonus damage based on caster's total stolen energy
    if (skillLevel.stolenEnergyScaling && skillLevel.stolenEnergyScaling.perStack > 0) {
      const stolen = attacker.stolenEnergyCount ?? 0;
      const stacks = Math.min(stolen, skillLevel.stolenEnergyScaling.maxStacks);
      const bonusPct = stacks * skillLevel.stolenEnergyScaling.perStack;
      if (bonusPct > 0) {
        const before = rawDamage;
        rawDamage = rawDamage * (1 + bonusPct / 100);
        breakdown.push(`Stolen energy bonus: ${stacks} stacks × ${skillLevel.stolenEnergyScaling.perStack}% = +${bonusPct}% — ${before.toFixed(1)} → ${rawDamage.toFixed(1)}`);
      }
    }
  }

  // Faster Target Bonus: bonus damage when attacker SPD > defender SPD
  if (!isHealing) {
    const atkSpd = getEffectiveStat(attacker.stats.spd, "spd", attacker.buffs);
    const defSpd = getEffectiveStat(defender.stats.spd, "spd", defender.buffs);
    if (atkSpd > defSpd) {
      let bonusPct = 0;
      for (const b of attacker.buffs) {
        if (!b.tags) continue;
        for (const t of b.tags) {
          if (t.type !== "faster-target-bonus") continue;
          const p = (t.params.percent as number) ?? 10;
          if (p > bonusPct) bonusPct = p;
        }
      }
      if (bonusPct > 0) {
        const before = rawDamage;
        rawDamage = rawDamage * (1 + bonusPct / 100);
        breakdown.push(`Faster Target: +${bonusPct}% (SPD ${atkSpd.toFixed(0)} > ${defSpd.toFixed(0)}) — ${before.toFixed(1)} → ${rawDamage.toFixed(1)}`);
      }
    }
  }

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

  // Category resistance (physical/magical) — dmgCatRes.physical, dmgCatRes.magical
  if (!isHealing && (category === "physical" || category === "magical")) {
    const catKey = `dmgCatRes.${category}`;
    const catModifier = defender.buffs
      .filter((b) => b.stats.includes(catKey))
      .reduce((sum, b) => sum + b.modifier * (b.stacks ?? 1), 0);
    if (catModifier !== 0) {
      const reduction = catModifier / 100;
      const before = finalDamage;
      finalDamage = finalDamage * (1 - reduction);
      breakdown.push(`${category} Res: ${catModifier > 0 ? "+" : ""}${catModifier}% — ${before.toFixed(1)} → ${finalDamage.toFixed(1)}`);
    }
  }

  // Source resistance (direct/aoe/indirect) — dmgSrcRes.direct, dmgSrcRes.aoe, dmgSrcRes.indirect
  if (!isHealing && skillLevel.targetType) {
    const aoeTypes = new Set([
      "aoe-enemy", "aoe-team", "self-row-enemy",
      "all-front-row-enemy", "all-middle-row-enemy", "all-back-row-enemy",
      "front-two-rows-enemy", "back-two-rows-enemy", "same-line-enemy",
    ]);
    const directTypes = new Set(["target-enemy", "front-row-enemy", "random-enemy", "column-pierce-enemy", "target-ally", "target-ally-or-self", "random-ally", "adjacent-ally"]);
    const srcCat = skillLevel.damageSourceOverride
      ? skillLevel.damageSourceOverride
      : aoeTypes.has(skillLevel.targetType) ? "aoe" : directTypes.has(skillLevel.targetType) ? "direct" : "indirect";
    const srcKey = `dmgSrcRes.${srcCat}`;
    const srcModifier = defender.buffs
      .filter((b) => b.stats.includes(srcKey))
      .reduce((sum, b) => sum + b.modifier * (b.stacks ?? 1), 0);
    if (srcModifier !== 0) {
      const reduction = srcModifier / 100;
      const before = finalDamage;
      finalDamage = finalDamage * (1 - reduction);
      breakdown.push(`${srcCat} Res: ${srcModifier > 0 ? "+" : ""}${srcModifier}% — ${before.toFixed(1)} → ${finalDamage.toFixed(1)}`);
    }
  }

  // Row positioning modifiers (universal): front +20% dealt/taken, back -20% taken
  if (!isHealing) {
    // Caster row: front (col 0) +20% dealt, back (col 2) no global change
    if (attacker.col === 0) {
      const before = finalDamage;
      finalDamage = finalDamage * 1.2;
      breakdown.push(`Front row attacker: +20% — ${before.toFixed(1)} → ${finalDamage.toFixed(1)}`);
    }
    // Melee penalty: back-row caster of a melee skill takes -20% damage dealt
    if (attacker.col === 2 && skillLevel.rangeTags?.includes("melee")) {
      const before = finalDamage;
      finalDamage = finalDamage * 0.8;
      breakdown.push(`Back row melee penalty: -20% — ${before.toFixed(1)} → ${finalDamage.toFixed(1)}`);
    }
    // Defender row: front (col 0) +20% taken, back (col 2) -20% taken
    if (defender.col === 0) {
      const before = finalDamage;
      finalDamage = finalDamage * 1.2;
      breakdown.push(`Front row defender: +20% taken — ${before.toFixed(1)} → ${finalDamage.toFixed(1)}`);
    } else if (defender.col === 2 && !skillLevel.ignoreRowDefense) {
      const before = finalDamage;
      finalDamage = finalDamage * 0.8;
      breakdown.push(`Back row defender: -20% taken — ${before.toFixed(1)} → ${finalDamage.toFixed(1)}`);
    } else if (defender.col === 2 && skillLevel.ignoreRowDefense) {
      breakdown.push(`Back row defender: -20% bypassed (ignoreRowDefense)`);
    }
  }

  // Healing-received modifier: defender-side buffs/debuffs that scale incoming healing.
  // Sum all matching tag percents (negatives reduce, positives amplify).
  if (isHealing) {
    let healingMod = 0;
    for (const b of defender.buffs) {
      if (!b.tags) continue;
      for (const t of b.tags) {
        if (t.type !== "healing-received") continue;
        const p = (t.params.percent as number) ?? 0;
        healingMod += p * (b.stacks ?? 1);
      }
    }
    if (healingMod !== 0) {
      const before = finalDamage;
      finalDamage = Math.max(0, finalDamage * (1 + healingMod / 100));
      breakdown.push(`Healing received: ${healingMod > 0 ? "+" : ""}${healingMod}% — ${before.toFixed(1)} → ${finalDamage.toFixed(1)}`);
    }
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
    finalDamage: Math.max((isHealing || isShielding) ? finalDamage : 1, finalDamage), // min 1 damage for attacks
    isHealing: isHealing || isShielding, // shielding uses the same "positive effect" path as healing for entry flow
    isShielding,
    element,
    breakdown,
  };
}
