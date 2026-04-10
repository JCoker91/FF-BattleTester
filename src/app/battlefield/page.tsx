"use client";

import { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useStore } from "@/lib/store";
import { Character, CharacterType, CHARACTER_TYPES, CharacterSkill, Skill, SkillLevel, SkillEffect, SkillTemplate, TemplateAction, Team, PlacedCharacter, EnergyColor, ENERGY_COLORS, EnergyGeneration, SKILL_TYPE_LABELS, ELEMENTS, ELEMENT_ICONS, ELEMENT_LABELS, TARGET_TYPE_LABELS, TargetType, Form, BuffDebuff, BattleState, DamageResult, StatusEffect, ResistanceGrant, Element, resolveFormView, toggleEquipLoadout } from "@/lib/types";
import { DAMAGE_TIER_LABELS, DAMAGE_CATEGORY_LABELS, DamageTier } from "@/lib/damage-config";
import { calculateDamage } from "@/lib/damage-calc";
import { resolveTargets, TargetResolution } from "@/lib/targeting";
import { EnergyBadge, EnergyCostDisplay } from "@/components/EnergyBadge";
import { Tooltip, GlossaryText } from "@/components/Tooltip";

const COL_LABELS = ["Front", "Mid", "Back"];
const COLS = [0, 1, 2];
const ROWS = [0, 1, 2];
const ALL_STATS = ["atk", "mAtk", "def", "spi", "spd"] as const;

/**
 * Apply buff stacking rules when adding a new buff.
 * Returns updated buff array and an optional trigger key if max stacks reached.
 */
function applyBuffStacking(
  existing: BuffDebuff[],
  incoming: Omit<BuffDebuff, "id">
): { buffs: BuffDebuff[]; triggered: string | null } {
  // For stackable effects, merge across sources by effectId only.
  // For non-stackable, keep separate stacks per (effectId, source) pair.
  const match = incoming.stackable
    ? existing.find((b) => b.effectId === incoming.effectId)
    : existing.find((b) => b.effectId === incoming.effectId && b.source === incoming.source);

  if (!match) {
    // New buff
    return {
      buffs: [...existing, { ...incoming, id: crypto.randomUUID(), stacks: incoming.stacks ?? 1 }],
      triggered: null,
    };
  }

  if (match.stackable && match.maxStacks) {
    const incomingStacks = incoming.stacks ?? 1;
    const cappedTotal = Math.min(match.maxStacks, (match.stacks ?? 1) + incomingStacks);
    if (cappedTotal >= match.maxStacks && match.onMaxStacks) {
      // Max stacks reached — remove this buff and trigger special behavior
      return {
        buffs: existing.filter((b) => b.id !== match.id),
        triggered: match.onMaxStacks,
      };
    }
    return {
      buffs: existing.map((b) =>
        b.id === match.id ? { ...b, stacks: cappedTotal, duration: incoming.duration > 0 ? Math.max(b.duration, incoming.duration) : b.duration } : b
      ),
      triggered: null,
    };
  }

  // Non-stackable or already at max: take the stronger modifier and higher duration
  // For buffs (positive), stronger = higher. For debuffs (negative), stronger = more negative.
  const strongerModifier = incoming.modifier >= 0
    ? Math.max(match.modifier, incoming.modifier)   // buff: take higher
    : Math.min(match.modifier, incoming.modifier);   // debuff: take more negative
  return {
    buffs: existing.map((b) =>
      b.id === match.id ? {
        ...b,
        modifier: strongerModifier,
        duration: incoming.duration > 0 ? Math.max(b.duration, incoming.duration) : b.duration,
        appliedTurn: incoming.appliedTurn ?? b.appliedTurn,
      } : b
    ),
    triggered: null,
  };
}

/** Classify a target type as direct, aoe, or indirect for filter matching. */
function getAttackCategory(targetType?: TargetType, override?: "direct" | "aoe" | "indirect"): "direct" | "aoe" | "indirect" {
  if (override) return override;
  if (!targetType) return "indirect";
  const aoeTypes = new Set([
    "aoe-enemy", "aoe-team", "self-row-enemy",
    "all-front-row-enemy", "all-middle-row-enemy", "all-back-row-enemy",
    "front-two-rows-enemy", "back-two-rows-enemy", "same-line-enemy",
  ]);
  const directTypes = new Set(["target-enemy", "front-row-enemy", "random-enemy", "column-pierce-enemy", "target-ally", "target-ally-or-self", "random-ally", "adjacent-ally"]);
  if (aoeTypes.has(targetType)) return "aoe";
  if (directTypes.has(targetType)) return "direct";
  return "indirect";
}

/**
 * Apply force-target override: if the attacker has a force-target buff from an enemy,
 * direct attacks must target that enemy. Returns the forced target char ID or null.
 */
function getForceTarget(attackerBuffs: BuffDebuff[], attackCategory: "direct" | "aoe" | "indirect"): string | null {
  // Find the most recent force-target buff (last one wins)
  for (let i = attackerBuffs.length - 1; i >= 0; i--) {
    const b = attackerBuffs[i];
    if (!b.tags || !b.sourceCharId) continue;
    for (const tag of b.tags) {
      if (tag.type !== "force-target") continue;
      const filter = (tag.params.filter as string) ?? "direct";
      if (filter === "any" || filter === attackCategory) {
        return b.sourceCharId;
      }
    }
  }
  return null;
}

/** Compute the total buff modifier for a stat, including multi-stat buffs and stacks. */
function getBuffModifier(buffs: BuffDebuff[], stat: string): number {
  return buffs
    .filter((b) => b.stats.includes(stat))
    .reduce((sum, b) => sum + b.modifier * (b.stacks ?? 1), 0);
}

function StatusResistanceDisplay({
  characterId,
  getCharacter,
  activeForm,
  passiveGrants,
}: {
  characterId: string;
  getCharacter: (id: string) => Character | undefined;
  activeForm?: Form;
  passiveGrants?: ResistanceGrant[];
}) {
  const { statusEffects } = useStore();
  const char = getCharacter(characterId);
  if (!char) return null;
  const resistable = statusEffects.filter((se) => se.resistable);
  if (resistable.length === 0) return null;
  return (
    <div>
      <span className="text-gray-500 font-medium text-[10px] uppercase">Status Resistance</span>
      <div className="grid grid-cols-4 gap-1 mt-1">
        {resistable.map((se) => {
          const base = char.statusResistance[se.id] ?? 0;
          const formOverride = activeForm?.statusResistanceOverride?.[se.id];
          const baseVal = formOverride ?? base;
          const passiveBonus = passiveGrants ? getPassiveStatusResistance(passiveGrants, se.id) : 0;
          const val = Math.min(100, baseVal + passiveBonus);
          return (
            <div key={se.id} className="text-center bg-gray-800 rounded p-1">
              <div className={`text-[10px] font-bold ${val >= 100 ? "text-green-400" : val > 0 ? "text-yellow-400" : "text-gray-400"}`}>
                {val}%
              </div>
              <div className="text-[7px] text-gray-600 -mt-0.5 truncate">{se.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Collect all passive resistance grants from a character's equipped skills.
 * Returns grants from skills whose active level has `passive: true`.
 */
function getPassiveResistanceGrants(
  char: Character,
  activeFormId: string | null,
  allSkills: Skill[],
  charAssignments: CharacterSkill[],
  skillLevelMap: Record<string, number>,
): ResistanceGrant[] {
  const resolved = resolveFormView(char, activeFormId, allSkills, charAssignments);
  const allResolved = [resolved.innate, resolved.basic, ...resolved.abilities, ...resolved.conditionals].filter(Boolean) as Skill[];
  const grants: ResistanceGrant[] = [];
  for (const skill of allResolved) {
    const canLevel = (skill.skillType === "ability" && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);
    const lvlIdx = canLevel ? (skillLevelMap[skill.id] ?? 1) - 1 : 0;
    const level = skill.levels[lvlIdx];
    if (level?.passive && level.resistanceGrants) {
      grants.push(...level.resistanceGrants);
    }
  }
  return grants;
}

/**
 * Get the total passive status resistance bonus for a given status effect.
 */
function getPassiveStatusResistance(grants: ResistanceGrant[], effectId: string): number {
  return grants
    .filter((g) => g.type === "status" && g.targetId === effectId)
    .reduce((sum, g) => sum + g.value, 0);
}

/**
 * Apply passive elemental resistance grants to a base elemental resistance object.
 */
function applyPassiveElementalGrants(
  baseElemRes: Record<string, number>,
  grants: ResistanceGrant[],
): Record<string, number> {
  const eleGrants = grants.filter((g) => g.type === "elemental");
  if (eleGrants.length === 0) return baseElemRes;
  const result = { ...baseElemRes };
  for (const g of eleGrants) {
    result[g.targetId] = (result[g.targetId] ?? 100) + g.value;
  }
  return result;
}

function RangeTagIcons({ tags, size = "sm" }: { tags?: ("melee" | "ranged" | "magic")[]; size?: "sm" | "md" }) {
  if (!tags || tags.length === 0) return null;
  const sizeClass = size === "md" ? "text-xs px-1" : "text-[10px] px-0.5";
  return (
    <span className="inline-flex gap-0.5">
      {tags.includes("melee") && (
        <span title="Melee" className={`${sizeClass} text-orange-300`}>⚔</span>
      )}
      {tags.includes("ranged") && (
        <span title="Ranged" className={`${sizeClass} text-cyan-300`}>🏹</span>
      )}
      {tags.includes("magic") && (
        <span title="Magic" className={`${sizeClass} text-purple-300`}>✨</span>
      )}
    </span>
  );
}

function SkillEffectDisplay({ effect }: { effect: SkillEffect }) {
  const { statusEffects } = useStore();
  const se = statusEffects.find((s) => s.id === effect.effectId);
  if (!se) return <span className="text-[10px] text-gray-500">Unknown effect</span>;
  const modText = !se.stats.includes("none") ? ` ${effect.modifier > 0 ? "+" : ""}${effect.modifier}%` : "";
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className={se.category === "buff" ? "text-green-400" : se.category === "status" ? "text-yellow-400" : "text-red-400"}>{se.name}{modText}</span>
      <span className="text-gray-600">{effect.duration === -1 ? "Perm" : `${effect.duration}t`}</span>
      <span className="text-gray-500">{TARGET_TYPE_LABELS[effect.targetType]}</span>
      {effect.chance !== undefined && effect.chance < 100 && (
        <span className="text-amber-400">{effect.chance}%</span>
      )}
    </div>
  );
}

function CharacterChip({
  character,
  isDragging,
  flipImage,
  isSelected,
  currentHp,
  maxHp,
  photoOverride,
}: {
  character: Character;
  isDragging?: boolean;
  flipImage?: boolean;
  isSelected?: boolean;
  currentHp?: number;
  maxHp?: number;
  photoOverride?: string;
}) {
  const showHp = currentHp !== undefined && maxHp !== undefined;
  const hpPct = showHp ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const isDefeated = showHp && currentHp <= 0;
  const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500";
  const hpBorderColor = !showHp || isDefeated ? "" : hpPct > 50 ? "" : hpPct > 25 ? "border-yellow-500/60" : "border-red-500/60";
  const photo = photoOverride ?? character.photoUrl;

  return (
    <div
      className={`px-2 py-1.5 rounded text-xs font-medium border select-none flex items-center gap-1.5 transition-colors duration-150 ${
        isDefeated ? "bg-gray-900 border-gray-800 opacity-50 grayscale"
        : hpBorderColor ? `bg-gray-700 ${hpBorderColor}`
        : "bg-gray-700 border-gray-600"
      } ${isDragging ? "opacity-50" : ""} ${isSelected ? "border-blue-400 ring-1 ring-blue-400/50" : ""} text-white`}
    >
      {photo ? (
        <img
          src={photo}
          alt={character.name}
          className={`w-7 h-7 rounded-full object-cover shrink-0${flipImage ? " -scale-x-100" : ""}${isDefeated ? " grayscale" : ""}`}
        />
      ) : (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isDefeated ? "bg-gray-800" : "bg-gray-600"}`}>
          {character.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={`font-bold truncate ${isDefeated ? "text-gray-500" : ""}`}>{character.name}</div>
        {showHp ? (
          isDefeated ? (
            <div className="text-[9px] text-red-400/70 font-semibold mt-0.5">DEFEATED</div>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <div className="flex-1 h-2 bg-gray-600 rounded-full overflow-hidden">
                <div
                  className={`h-full ${hpColor} transition-all duration-300 rounded-full`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <span className="text-[9px] text-gray-400 shrink-0 tabular-nums">
                {currentHp}/{maxHp}
              </span>
            </div>
          )
        ) : (
          <div className="flex gap-0.5 mt-0.5">
            {character.energyGeneration.map((eg) =>
              Array.from({ length: eg.amount }).map((_, j) => (
                <EnergyBadge key={`${eg.color}-${j}`} color={eg.color} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCharacter({
  character,
  source,
  flipImage,
  isSelected,
  currentHp,
  maxHp,
  photoOverride,
  onSelect,
}: {
  character: Character;
  source: string;
  flipImage?: boolean;
  isSelected?: boolean;
  currentHp?: number;
  maxHp?: number;
  photoOverride?: string;
  onSelect?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${source}::${character.id}`,
    data: { character, source },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`transition-transform duration-100 ${isDragging ? "cursor-grabbing" : "cursor-pointer hover:scale-110"}`}
      onClick={onSelect}
    >
      <CharacterChip character={character} isDragging={isDragging} flipImage={flipImage} isSelected={isSelected} currentHp={currentHp} maxHp={maxHp} photoOverride={photoOverride} />
    </div>
  );
}

function GridCell({
  id,
  character,
  side,
  row,
  col,
  selectedCharId,
  hpMap,
  formPhotoMap,
  onSelectCharacter,
  onHoverCharacter,
  switchHighlight,
  onSwitchClick,
  animClass,
  damageFloats,
}: {
  id: string;
  character?: Character;
  side: "left" | "right";
  row: number;
  col: number;
  selectedCharId?: string | null;
  hpMap?: Record<string, number>;
  formPhotoMap?: Record<string, string>; // charId -> photo url
  onSelectCharacter?: (id: string) => void;
  onHoverCharacter?: (id: string | null) => void;
  switchHighlight?: boolean;
  onSwitchClick?: () => void;
  animClass?: string;
  damageFloats?: { id: string; text: string; color: string }[];
}) {
  const charHp = character && hpMap ? {
    currentHp: hpMap[character.id] ?? character.stats.hp,
    maxHp: character.stats.hp,
  } : {};
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      onClick={() => switchHighlight && onSwitchClick?.()}
      className={`w-24 h-20 border rounded flex items-center justify-center transition-colors ${
        switchHighlight
          ? "border-green-400 bg-green-500/20 cursor-pointer ring-2 ring-green-400/50"
          : isOver
          ? "border-blue-400 bg-blue-500/10"
          : "border-gray-700 bg-gray-800/50"
      }`}
      onMouseEnter={() => character && onHoverCharacter?.(character.id)}
      onMouseLeave={() => onHoverCharacter?.(null)}
      style={{ position: "relative" }}
    >
      {character ? (
        <div data-char-id={character.id} className={animClass ? `animate-${animClass}` : undefined} style={{ position: "relative" }}>
          <DraggableCharacter
            character={character}
            source={`${side}-${row}-${col}`}
            flipImage={side === "left"}
            isSelected={selectedCharId === character.id}
            {...charHp}
            photoOverride={character && formPhotoMap ? formPhotoMap[character.id] : undefined}
            onSelect={() => onSelectCharacter?.(character.id)}
          />
          {damageFloats && damageFloats.length > 0 && (
            <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none", zIndex: 30 }}>
              {damageFloats.map((d) => (
                <div
                  key={d.id}
                  className={`animate-damage-float text-base font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${d.color}`}
                  style={{ position: "absolute", left: 0, top: 0, whiteSpace: "nowrap" }}
                >
                  {d.text}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span className="text-[10px] text-gray-600">
          {COL_LABELS[col]}
        </span>
      )}
    </div>
  );
}

function EnergyPool({
  teams,
  getCharacter,
  getEnergyForChar,
  currentEnergy,
  activeSide,
  onClickEnergy,
}: {
  teams: Team[];
  getCharacter: (id: string) => Character | undefined;
  getEnergyForChar?: (charId: string) => EnergyGeneration[];
  currentEnergy?: Record<string, Record<string, number>>;
  activeSide?: string; // which side's character is on turn — only show convert UI for that side
  onClickEnergy?: (side: string, color: EnergyColor) => void;
}) {
  const pools: { sideKey: string; sideName: string; energy: Record<EnergyColor, number>; rainbow: number }[] = teams.map((team) => {
    if (currentEnergy && currentEnergy[team.side]) {
      const e = currentEnergy[team.side];
      return {
        sideKey: team.side,
        sideName: team.name,
        energy: {
          red: e.red ?? 0,
          blue: e.blue ?? 0,
          green: e.green ?? 0,
          purple: e.purple ?? 0,
          yellow: e.yellow ?? 0,
        } as Record<EnergyColor, number>,
        rainbow: e.rainbow ?? 0,
      };
    }
    const energy: Record<EnergyColor, number> = { red: 0, blue: 0, green: 0, purple: 0, yellow: 0 };
    team.placements.forEach((p) => {
      const charEnergy = getEnergyForChar
        ? getEnergyForChar(p.characterId)
        : getCharacter(p.characterId)?.energyGeneration ?? [];
      charEnergy.forEach((eg) => {
        energy[eg.color] += eg.amount;
      });
    });
    return { sideKey: team.side, sideName: team.name, energy, rainbow: 0 };
  });

  return (
    <div className="flex gap-8 justify-center">
      {pools.map((pool) => {
        const isActive = activeSide === pool.sideKey && !!onClickEnergy;
        return (
          <div key={pool.sideKey} className="text-center">
            <div className="text-xs font-medium text-gray-400 mb-1">
              {pool.sideName} Energy
            </div>
            <div className="flex gap-1 justify-center items-center flex-wrap">
              {(Object.entries(pool.energy) as [EnergyColor, number][]).map(
                ([color, amount]) =>
                  amount > 0 && (
                    <button
                      key={color}
                      onClick={() => isActive && onClickEnergy?.(pool.sideKey, color)}
                      disabled={!isActive}
                      title={isActive ? `Click to convert ${color} energy` : undefined}
                      className={`flex items-center gap-0.5 px-1 py-0.5 rounded transition-colors ${
                        isActive ? "hover:bg-gray-700 cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <EnergyBadge color={color} size="md" />
                      <span className="text-xs text-gray-300 font-bold">{amount}</span>
                    </button>
                  )
              )}
              {pool.rainbow > 0 && (
                <span className="flex items-center gap-0.5 ml-1 px-1 py-0.5 rounded bg-gradient-to-r from-purple-600/30 via-pink-600/30 to-yellow-600/30 border border-pink-400/40">
                  <span className="text-xs">🌈</span>
                  <span className="text-xs text-pink-200 font-bold">{pool.rainbow}/5</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type BattlePhase = "staging" | "battle";

// Character leveling: each level adds +10% to ATK / MATK / DEF / SPI / SPD (NOT HP).
// Pure helper so child components can use it without re-implementing.
function applyCharLevelStats<T extends { atk: number; mAtk: number; def: number; spi: number; spd: number }>(
  stats: T,
  level: number
): T {
  if (!level || level <= 0) return stats;
  const m = 1 + 0.1 * level;
  return {
    ...stats,
    atk: Math.round(stats.atk * m),
    mAtk: Math.round(stats.mAtk * m),
    def: Math.round(stats.def * m),
    spi: Math.round(stats.spi * m),
    spd: Math.round(stats.spd * m),
  };
}

// Skill point cost to bring an ability skill from current level to next level.
// L1 -> L2 = 1 SP, L2 -> L3 = 2 SP. Returns null if at max.
function skillUpgradeCost(currentLevel: number): number | null {
  if (currentLevel >= 3) return null;
  return currentLevel; // 1 -> 2 = 1 SP, 2 -> 3 = 2 SP
}

// Rainbow cost to bring a character from current level to next level.
// L0 -> L1 = 1, L1 -> L2 = 2, L2 -> L3 = 3. Returns null if at max.
function characterUpgradeCost(currentLevel: number): number | null {
  if (currentLevel >= 3) return null;
  return currentLevel + 1;
}

interface TurnEntry {
  characterId: string;
  side: "left" | "right";
  speed: number;
}

function computeTurnOrder(
  teams: Team[],
  getCharacter: (id: string) => Character | undefined,
  speedOverrides: Record<string, number>
): TurnEntry[] {
  const entries: TurnEntry[] = [];
  for (const team of teams) {
    for (const p of team.placements) {
      const char = getCharacter(p.characterId);
      if (!char) continue;
      const speed =
        speedOverrides[char.id] !== undefined
          ? speedOverrides[char.id]
          : char.stats.spd;
      entries.push({ characterId: char.id, side: team.side as "left" | "right", speed });
    }
  }
  // Sort by speed descending; ties broken randomly
  entries.sort((a, b) => {
    if (b.speed !== a.speed) return b.speed - a.speed;
    return Math.random() - 0.5;
  });
  return entries;
}

function TurnOrderBar({
  turnOrder,
  currentTurnIndex,
  hoveredCharId,
  getCharacter,
  formPhotoMap,
  currentHpMap,
}: {
  turnOrder: TurnEntry[];
  currentTurnIndex: number;
  hoveredCharId: string | null;
  getCharacter: (id: string) => Character | undefined;
  formPhotoMap?: Record<string, string>;
  currentHpMap?: Record<string, number>;
}) {
  return (
    <div className="flex gap-1 items-center justify-center flex-wrap h-[72px]">
      {turnOrder.map((entry, i) => {
        const char = getCharacter(entry.characterId);
        if (!char) return null;
        const photo = formPhotoMap?.[char.id] ?? char.photoUrl;
        const isCurrent = i === currentTurnIndex;
        const isHovered = hoveredCharId === entry.characterId;
        const isPast = i < currentTurnIndex;
        const enlarged = isCurrent || isHovered;
        const isDefeated = (currentHpMap?.[entry.characterId] ?? 1) <= 0;
        return (
          <div
            key={`${entry.characterId}-${i}`}
            className={`flex flex-col items-center w-14 shrink-0 ${
              isPast ? "opacity-40" : ""
            } ${isDefeated ? "opacity-50" : ""}`}
          >
            <div className="w-8 h-8 flex items-center justify-center relative">
              {photo ? (
                <img
                  src={photo}
                  alt={char.name}
                  className={`w-8 h-8 rounded-full object-cover border-2 transition-transform duration-150 origin-center ${
                    enlarged ? "scale-150" : "scale-100"
                  } ${
                    isDefeated
                      ? "border-red-700 grayscale"
                      : isHovered
                      ? "border-blue-400"
                      : isCurrent
                      ? "border-yellow-400"
                      : entry.side === "left"
                      ? "border-gray-600"
                      : "border-gray-500"
                  }`}
                />
              ) : (
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-transform duration-150 origin-center ${
                    enlarged ? "scale-150" : "scale-100"
                  } ${
                    isDefeated
                      ? "border-red-700 bg-red-900/20 text-red-500"
                      : isHovered
                      ? "border-blue-400 bg-blue-400/20 text-blue-300"
                      : isCurrent
                      ? "border-yellow-400 bg-yellow-400/20 text-yellow-300"
                      : "border-gray-600 bg-gray-700 text-gray-400"
                  }`}
                >
                  {char.name.charAt(0)}
                </div>
              )}
              {isDefeated && (
                <span className="absolute inset-0 flex items-center justify-center text-red-500 font-black text-2xl pointer-events-none" style={{ textShadow: "0 0 4px black" }}>
                  ✕
                </span>
              )}
            </div>
            <span
              className={`text-[9px] mt-1 truncate max-w-[3.5rem] text-center leading-none ${
                isDefeated
                  ? "text-red-500 line-through"
                  : isCurrent
                  ? "text-yellow-300 font-bold"
                  : isHovered
                  ? "text-blue-300 font-medium"
                  : "text-gray-500"
              }`}
            >
              {char.name}
            </span>
            <span className="text-[8px] text-gray-600 leading-none mt-0.5">
              {entry.speed} spd
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function BattlefieldPage() {
  const { characters, skills, characterSkills, teams, forms, templates, templateActions, statusEffects, updateTeam, updateCharacter, getCharacter, getSkill, getFormsForCharacter } = useStore();
  const [activeChar, setActiveChar] = useState<Character | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
  const [benchFilter, setBenchFilter] = useState<CharacterType | null>(null);

  // Battle state
  const [phase, setPhase] = useState<BattlePhase>("staging");
  const [round, setRound] = useState(1);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [turnOrder, setTurnOrder] = useState<TurnEntry[]>([]);
  const [speedOverrides, setSpeedOverrides] = useState<Record<string, number>>({});
  const [currentHpMap, setCurrentHpMap] = useState<Record<string, number>>({});
  const [buffsMap, setBuffsMap] = useState<Record<string, BuffDebuff[]>>({});
  const [viewedCharId, setViewedCharId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<"stats" | "skills">("stats");
  const [stagingFormMap, setStagingFormMap] = useState<Record<string, string>>({}); // charId -> selected starting formId
  const [switchMode, setSwitchMode] = useState(false); // when active, clicking grid cells performs swap/move
  const [switchUsedByChar, setSwitchUsedByChar] = useState<Set<string>>(new Set()); // chars who've already used switch this turn
  const [energyChooseRequest, setEnergyChooseRequest] = useState<
    | { kind: "steal"; count: number; sourceSide: string; destSide: string; attackerName: string; casterId: string }
    | { kind: "generate"; count: number; destSide: string; attackerName: string }
    | null
  >(null);
  const [convertEnergyModal, setConvertEnergyModal] = useState<{ side: string; color: EnergyColor } | null>(null);
  const [stolenEnergyByChar, setStolenEnergyByChar] = useState<Record<string, number>>({}); // charId → total energy stolen this battle
  const [battleStats, setBattleStats] = useState<Record<string, { damageDone: number; directDmg: number; aoeDmg: number; indirectDmg: number; trueDmg: number; healingDone: number; damageTaken: number; energySpent: number; skillsUsed: number }>>({});
  const emptyStats = { damageDone: 0, directDmg: 0, aoeDmg: 0, indirectDmg: 0, trueDmg: 0, healingDone: 0, damageTaken: 0, energySpent: 0, skillsUsed: 0 };
  const addBattleStat = (charId: string, field: string, amount: number) => {
    setBattleStats((prev) => {
      const cur = prev[charId] ?? { ...emptyStats };
      return { ...prev, [charId]: { ...cur, [field]: (cur[field as keyof typeof cur] ?? 0) + amount } };
    });
  };
  const [teleportRequest, setTeleportRequest] = useState<{ charId: string; destSide: string; instant?: boolean } | null>(null);
  const [adjacentMoveRequest, setAdjacentMoveRequest] = useState<{ charId: string; instant?: boolean } | null>(null);
  // Tracks instant skills used this round: charId -> Set of skillIds
  const [instantUsedMap, setInstantUsedMap] = useState<Record<string, string[]>>({});
  // Floating combat text (damage, heal, status label) per character
  type CombatFloat = { id: string; charId: string; text: string; color: string };
  const [damageFloats, setDamageFloats] = useState<CombatFloat[]>([]);
  // Per-char scheduling cursor so stacked floats don't overlap — absolute ms timestamp
  const floatScheduleRef = useRef<Record<string, number>>({});
  // FLIP-style position transitions for characters moving between grid cells
  const lastRectsRef = useRef<Record<string, { left: number; top: number }>>({});
  // Ref to the middle column — its height drives the side columns' heights
  const middleColRef = useRef<HTMLDivElement | null>(null);
  const [middleColHeight, setMiddleColHeight] = useState<number | null>(null);
  // Animation state: charId -> css class ("sling-right" etc.)
  const [animMap, setAnimMap] = useState<Record<string, string>>({});
  const spawnFloat = useCallback((charId: string, text: string, color: string) => {
    const now = Date.now();
    const next = Math.max(now, floatScheduleRef.current[charId] ?? 0);
    const delay = next - now;
    floatScheduleRef.current[charId] = next + 260;
    const id = crypto.randomUUID();
    const show = () => {
      setDamageFloats((prev) => [...prev, { id, charId, text, color }]);
      setTimeout(() => {
        setDamageFloats((prev) => prev.filter((d) => d.id !== id));
      }, 1400);
    };
    if (delay > 0) setTimeout(show, delay); else show();
  }, []);
  const spawnDamageFloat = useCallback((charId: string, amount: number, isHealing: boolean) => {
    if (amount <= 0) return;
    spawnFloat(charId, `${isHealing ? "+" : "-"}${amount}`, isHealing ? "text-green-300" : "text-red-400");
  }, [spawnFloat]);
  const spawnStatusFloat = useCallback((charId: string, stats: string[], modifier: number, category: string, effectName: string, stackable?: boolean) => {
    // Stackable buffs or statless effects show the effect name
    if (stackable || stats.length === 0 || stats.includes("none")) {
      const color = category === "buff" ? "text-green-300" : category === "debuff" ? "text-red-300" : "text-yellow-300";
      spawnFloat(charId, effectName, color);
      return;
    }
    // Otherwise show one float per stat
    const sign = modifier > 0 ? "+" : modifier < 0 ? "-" : "";
    const color = modifier > 0 ? "text-green-300" : modifier < 0 ? "text-red-300" : "text-yellow-300";
    for (const s of stats) {
      spawnFloat(charId, `${s.toUpperCase()}${sign}`, color);
    }
  }, [spawnFloat]);
  const triggerAnim = useCallback((charId: string, cls: string, durationMs: number) => {
    setAnimMap((prev) => ({ ...prev, [charId]: cls }));
    setTimeout(() => {
      setAnimMap((prev) => {
        if (prev[charId] !== cls) return prev;
        const next = { ...prev };
        delete next[charId];
        return next;
      });
    }, durationMs + 20);
  }, []);
  const [battleFormMap, setBattleFormMap] = useState<Record<string, string>>({}); // charId -> active formId
  // Cycle indices for cycleEffectPools: keyed by `${charId}|${skillId}|${poolIndex}` -> next index to apply
  const [cycleIndexMap, setCycleIndexMap] = useState<Record<string, number>>({});
  const [skillLevelMap, setSkillLevelMap] = useState<Record<string, number>>({}); // skillId -> current level (1-3, default 1)
  const [characterLevelMap, setCharacterLevelMap] = useState<Record<string, number>>({}); // charId -> char level (0-3)
  const [skillPointsMap, setSkillPointsMap] = useState<Record<string, number>>({}); // charId -> unspent skill points
  const [endOfRoundPhaseOpen, setEndOfRoundPhaseOpen] = useState(false); // shows the leveling/shop modal between rounds
  // True the moment endRound() is called and stays true through the modal-display delay
  // and the modal itself. Locks the action bar so the last character can't keep acting
  // (Pass spam, instant skills, etc.) during the 1.5s window before the modal pops.
  const [roundEnding, setRoundEnding] = useState(false);
  const [expandedTemplateSkillId, setExpandedTemplateSkillId] = useState<string | null>(null);
  const [selectedTemplateActionId, setSelectedTemplateActionId] = useState<string | null>(null);
  const [templatePreviewTargetId, setTemplatePreviewTargetId] = useState<string>("");
  const [teamEnergy, setTeamEnergy] = useState<Record<string, Record<string, number>>>({});
  type LogKind =
    | "round"
    | "damage"
    | "heal"
    | "buff"
    | "debuff"
    | "status"
    | "defeat"
    | "revive"
    | "miss"
    | "skill"
    | "system";
  interface BattleLogEntry {
    id: number;
    text: string;
    kind: LogKind;
    groupId: number; // entries that came in the same batch share a groupId for visual grouping
  }
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([]);
  const [firedOnceEffects, setFiredOnceEffects] = useState<Set<string>>(new Set()); // "charId:skillId:effectIdx"
  const [defeatedCharIds, setDefeatedCharIds] = useState<Set<string>>(new Set());
  // Live ref to currentHpMap so functions called from stale closures (e.g. nextTurn invoked
  // synchronously after a setCurrentHpMap call earlier in the same handler) can still read
  // the up-to-date HP. Used by processStartOfTurn to skip just-killed characters and by
  // resolveTargets to filter dead units out of targeting options.
  const currentHpMapRef = useRef<Record<string, number>>({});
  currentHpMapRef.current = currentHpMap;
  // One-shot guard so the first-turn useEffect only fires once per battle entry.
  const firstTurnFiredRef = useRef(false);

  const logIdRef = useRef(0);
  const logGroupRef = useRef(0);
  const lastLogTimeRef = useRef(0);

  const classifyLog = (entry: string): LogKind => {
    const t = entry.toLowerCase();
    if (t.startsWith("round ") && !t.includes("dealing") && !t.includes("uses")) return "round";
    if (t.includes("has been defeated") || t.includes("is defeated")) return "defeat";
    if (t.includes("has been revived") || t.includes("revived")) return "revive";
    if (t.includes("missed")) return "miss";
    if (t.includes("healing ") && t.includes(" hp")) return "heal";
    if (t.includes("damage")) return "damage";
    if (t.includes("applied to") || t.includes("gains ")) {
      if (t.includes("debuff") || t.includes("(-")) return "debuff";
      return "buff";
    }
    if (t.includes("loses ") || t.includes("activated") || t.includes("counters")) return "status";
    if (t.includes("uses ")) return "skill";
    return "system";
  };

  const addBattleLog = (entry: string) => {
    // Group entries that arrive within 80ms of each other (e.g. same turn cluster)
    const now = Date.now();
    if (now - lastLogTimeRef.current > 80) {
      logGroupRef.current += 1;
    }
    lastLogTimeRef.current = now;
    const newEntry: BattleLogEntry = {
      id: ++logIdRef.current,
      text: entry,
      kind: classifyLog(entry),
      groupId: logGroupRef.current,
    };
    setBattleLog((prev) => [...prev, newEntry]);
  };

  // Auto-switch forms when form-linked statuses are applied or removed
  useEffect(() => {
    if (phase !== "battle") return;
    // Build a set of all form IDs that are linked to any status effect
    const formLinkedFormIds = new Set(statusEffects.filter((se) => se.formId).map((se) => se.formId!));

    setBattleFormMap((prev) => {
      const next = { ...prev };
      let changed = false;
      // Check all characters in the battle form map
      for (const charId of Object.keys(next)) {
        const charBuffs = buffsMap[charId] ?? [];
        // Find the most recent form-linked status (last applied wins)
        let formFromStatus: string | null = null;
        for (const b of charBuffs) {
          const se = statusEffects.find((s) => s.id === b.effectId);
          if (se?.formId) formFromStatus = se.formId;
        }
        if (formFromStatus) {
          // Has a form-linked status — switch to that form
          if (next[charId] !== formFromStatus) {
            next[charId] = formFromStatus;
            changed = true;
          }
        } else if (formLinkedFormIds.has(next[charId])) {
          // Currently on a form that is status-linked, but no longer has the status — revert
          const charForms = getFormsForCharacter(charId);
          const defaultForm = charForms.find((f) => f.startable !== false) ?? charForms[0];
          if (defaultForm && next[charId] !== defaultForm.id) {
            next[charId] = defaultForm.id;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [buffsMap, phase, statusEffects, getFormsForCharacter]);

  // Helper: get effective speed for a character (form override + buffs)
  const getEffectiveSpeed = useCallback((charId: string): number => {
    const char = getCharacter(charId);
    if (!char) return 0;
    const fId = battleFormMap[charId] ?? null;
    const charForms = getFormsForCharacter(charId);
    const form = charForms.find((f) => f.id === fId);
    const rawBaseSpd = form?.statOverrides?.spd ?? char.stats.spd;
    const charLv = characterLevelMap[charId] ?? 0;
    const baseSpd = charLv > 0 ? Math.round(rawBaseSpd * (1 + 0.1 * charLv)) : rawBaseSpd;
    const buffMod = getBuffModifier(buffsMap[charId] ?? [], "spd");
    const clamped = Math.max(-90, Math.min(200, buffMod));
    // Check for set-stat tag override on spd
    for (const b of buffsMap[charId] ?? []) {
      if (!b.tags) continue;
      for (const t of b.tags) {
        if (t.type === "set-stat" && t.params.stat === "spd") {
          return (t.params.value as number) ?? baseSpd;
        }
      }
    }
    return Math.max(1, Math.round(baseSpd * (1 + clamped / 100)));
  }, [getCharacter, battleFormMap, getFormsForCharacter, buffsMap, characterLevelMap]);

  // Reset switch mode when turn changes
  useEffect(() => { setSwitchMode(false); setSwitchUsedByChar(new Set()); }, [currentTurnIndex, round]);

  // Observe the middle column size and propagate its height to the side columns so
  // the battle log & details panel match the battlefield + active character panel.
  useEffect(() => {
    const el = middleColRef.current;
    if (!el) return;
    const update = () => setMiddleColHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  // FLIP animation: when characters move between grid cells, smoothly transition from their old position to the new one.
  useLayoutEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-char-id]");
    const newRects: Record<string, { left: number; top: number }> = {};
    nodes.forEach((node) => {
      const id = node.getAttribute("data-char-id");
      if (!id) return;
      const rect = node.getBoundingClientRect();
      newRects[id] = { left: rect.left, top: rect.top };
    });
    const prev = lastRectsRef.current;
    nodes.forEach((node) => {
      const id = node.getAttribute("data-char-id");
      if (!id) return;
      const last = prev[id];
      const curr = newRects[id];
      if (!last || !curr) return;
      const dx = last.left - curr.left;
      const dy = last.top - curr.top;
      // Ignore sub-cell drift from unrelated layout shifts (e.g. HP bars resizing, log growing).
      // Grid cells are ~96px wide so any real move is much larger than this threshold.
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      // "Invert": jump the element back to where it was, then transition it to zero.
      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      // Force reflow so the transition picks up the new transform.
      void node.offsetHeight;
      node.style.transition = "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)";
      node.style.transform = "translate(0, 0)";
      const clear = () => {
        node.style.transition = "";
        node.style.transform = "";
        node.removeEventListener("transitionend", clear);
      };
      node.addEventListener("transitionend", clear);
    });
    lastRectsRef.current = newRects;
  }, [teams]);

  // Auto-skip defeated characters when their turn comes up
  useEffect(() => {
    if (phase !== "battle") return;
    const activeId = turnOrder[currentTurnIndex]?.characterId;
    if (!activeId) return;
    if ((currentHpMap[activeId] ?? 1) <= 0) {
      // Defeated — skip after a brief moment
      const timer = setTimeout(() => {
        addBattleLog(`${getCharacter(activeId)?.name ?? "Unknown"} is defeated and cannot act.`);
        if (currentTurnIndex >= turnOrder.length - 1) {
          advanceToTurn(0, true);
        } else {
          advanceToTurn(currentTurnIndex + 1);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurnIndex, phase, turnOrder]);

  // Detect new deaths and log them
  useEffect(() => {
    if (phase !== "battle") return;
    const newDeaths: string[] = [];
    const revived: string[] = [];
    for (const team of teams) {
      for (const p of team.placements) {
        const hp = currentHpMap[p.characterId];
        if (hp === undefined) continue;
        const isDead = hp <= 0;
        const wasDead = defeatedCharIds.has(p.characterId);
        if (isDead && !wasDead) newDeaths.push(p.characterId);
        else if (!isDead && wasDead) revived.push(p.characterId);
      }
    }
    if (newDeaths.length === 0 && revived.length === 0) return;
    setDefeatedCharIds((prev) => {
      const next = new Set(prev);
      for (const id of newDeaths) next.add(id);
      for (const id of revived) next.delete(id);
      return next;
    });
    for (const id of newDeaths) {
      const name = getCharacter(id)?.name ?? "Unknown";
      addBattleLog(`${name} has been defeated!`);
    }
    for (const id of revived) {
      const name = getCharacter(id)?.name ?? "Unknown";
      addBattleLog(`${name} has been revived!`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHpMap, phase]);

  // Live re-sort the upcoming turns when speed changes mid-round
  useEffect(() => {
    if (phase !== "battle") return;
    setTurnOrder((prev) => {
      if (prev.length === 0) return prev;
      // Split into "already acted" (0..currentTurnIndex inclusive) and "remaining" (after current)
      const acted = prev.slice(0, currentTurnIndex + 1);
      const remaining = prev.slice(currentTurnIndex + 1);
      if (remaining.length === 0) return prev;
      // Re-sort remaining by current effective speed
      const resorted = [...remaining]
        .map((entry) => ({ ...entry, speed: getEffectiveSpeed(entry.characterId) }))
        .sort((a, b) => b.speed - a.speed);
      // Check if anything actually changed before triggering update
      const changed = resorted.some((e, i) => e.characterId !== remaining[i].characterId || e.speed !== remaining[i].speed);
      if (!changed) return prev;
      return [...acted, ...resorted];
    });
  }, [buffsMap, battleFormMap, phase, currentTurnIndex, getEffectiveSpeed]);

  // Helper: apply a buff from a passive skill effect, handling form conflicts
  const applyPassiveEffectBuff = (charId: string, eff: SkillEffect, skill: Skill, se: StatusEffect) => {
    const buff: Omit<BuffDebuff, "id"> = {
      effectId: se.id,
      effectName: se.name,
      category: se.category,
      stats: se.stats,
      modifier: !se.stats.includes("none") ? eff.modifier : 0,
      duration: eff.duration,
      source: skill.name,
      sourceCharId: charId,
      appliedTurn: round * 100 + currentTurnIndex,
      ...(se.tags ? { tags: se.tags } : {}),
      ...(se.stackable ? { stackable: true, maxStacks: se.maxStacks, stacks: 1, ...(se.onMaxStacks ? { onMaxStacks: se.onMaxStacks } : {}) } : {}),
    };
    setBuffsMap((prev) => {
      let existing = prev[charId] ?? [];
      // If this is a form-linked status, remove any other form-linked statuses first
      if (se.formId) {
        existing = existing.filter((b) => {
          const bSe = statusEffects.find((s) => s.id === b.effectId);
          return !bSe?.formId || bSe.id === se.id;
        });
      }
      const { buffs: updated } = applyBuffStacking(existing, buff);
      return { ...prev, [charId]: updated };
    });
    addBattleLog(`${getCharacter(charId)?.name ?? "Unknown"} gains ${se.name} from ${skill.name}.`);
  };

  // Monitor HP changes and fire on-hp-below / on-hp-above triggers from passive skills
  useEffect(() => {
    if (phase !== "battle") return;
    for (const team of teams) {
      for (const p of team.placements) {
        const charId = p.characterId;
        const char = getCharacter(charId);
        if (!char) continue;
        const hp = currentHpMap[charId];
        if (hp === undefined) continue; // not initialized yet
        const maxHp = char.stats.hp;
        const hpPct = (hp / maxHp) * 100;
        const formId = battleFormMap[charId] ?? null;
        const charAssigns = characterSkills.filter((cs) => cs.characterId === charId);
        const resolved = resolveFormView(char, formId, skills, charAssigns);
        const allResolved = [resolved.innate, resolved.basic, ...resolved.abilities, ...resolved.conditionals].filter(Boolean) as Skill[];
        for (const skill of allResolved) {
          const canLevel = (skill.skillType === "ability" && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);
          const lvlIdx = canLevel ? (skillLevelMap[skill.id] ?? 1) - 1 : 0;
          const level = skill.levels[lvlIdx];
          if (!level?.passive || !level.effects) continue;
          level.effects.forEach((eff, effIdx) => {
            if (eff.trigger !== "on-hp-below" && eff.trigger !== "on-hp-above") return;
            const threshold = eff.triggerValue ?? 50;
            const shouldFire = eff.trigger === "on-hp-below" ? hpPct < threshold : hpPct >= threshold;
            const se = statusEffects.find((s) => s.id === eff.effectId);
            if (!se) return;
            const charBuffs = buffsMap[charId] ?? [];
            const hasBuff = charBuffs.some((b) => b.effectId === se.id && b.source === skill.name);

            if (shouldFire) {
              // Check once-per-battle
              const onceKey = `${charId}:${skill.id}:${effIdx}`;
              if (eff.once && firedOnceEffects.has(onceKey)) return;
              if (hasBuff) return; // already active
              if (eff.once) {
                setFiredOnceEffects((prev) => new Set(prev).add(onceKey));
              }
              applyPassiveEffectBuff(charId, eff, skill, se);
            } else if (!eff.once && hasBuff) {
              // Condition no longer met — remove the buff (only for non-once effects)
              setBuffsMap((prev) => ({
                ...prev,
                [charId]: (prev[charId] ?? []).filter((b) => !(b.effectId === se.id && b.source === skill.name)),
              }));
              addBattleLog(`${char.name} loses ${se.name} (${skill.name} condition no longer met).`);
            }
          });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHpMap, phase]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Characters currently placed on either team
  const placedIds = new Set(
    teams.flatMap((t) => t.placements.map((p) => p.characterId))
  );
  const bench = characters.filter((c) => !placedIds.has(c.id) && c.showInBench !== false);

  const getCharAtPos = (
    team: Team,
    row: number,
    col: number
  ): Character | undefined => {
    const placement = team.placements.find(
      (p) => p.position.row === row && p.position.col === col
    );
    return placement ? getCharacter(placement.characterId) : undefined;
  };

  // Get the grid column for a character (0 = front, 1 = mid, 2 = back), or undefined if not on grid
  const getCharCol = (charId: string): number | undefined => {
    for (const team of teams) {
      const p = team.placements.find((pp) => pp.characterId === charId);
      if (p) return p.position.col;
    }
    return undefined;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { character: Character } | undefined;
    if (data) setActiveChar(data.character);
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveChar(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { character: Character; source: string }
        | undefined;
      if (!activeData) return;

      const charId = activeData.character.id;
      const overId = over.id as string;

      const removeFromCurrentTeam = () => {
        teams.forEach((team) => {
          const filtered = team.placements.filter(
            (p) => p.characterId !== charId
          );
          if (filtered.length !== team.placements.length) {
            updateTeam({ ...team, placements: filtered });
          }
        });
      };

      if (overId === "bench") {
        removeFromCurrentTeam();
        return;
      }

      const match = overId.match(/^(left|right)-(\d)-(\d)$/);
      if (!match) return;

      const [, side, rowStr, colStr] = match;
      const row = parseInt(rowStr);
      const col = parseInt(colStr);
      const targetTeam = teams.find((t) => t.side === side);
      if (!targetTeam) return;

      const occupant = targetTeam.placements.find(
        (p) => p.position.row === row && p.position.col === col
      );

      const updatedTeams = teams.map((team) => ({
        ...team,
        placements: team.placements.filter((p) => p.characterId !== charId),
      }));

      const finalTeams = updatedTeams.map((team) => {
        if (team.id !== targetTeam.id) return team;

        let placements = occupant
          ? team.placements.filter(
              (p) =>
                !(p.position.row === row && p.position.col === col)
            )
          : team.placements;

        if (placements.length >= 5) return team;

        const newPlacement: PlacedCharacter = {
          characterId: charId,
          position: { row, col },
        };
        return { ...team, placements: [...placements, newPlacement] };
      });

      finalTeams.forEach((t) => updateTeam(t));
    },
    [teams, updateTeam]
  );

  // Generate energy for both teams based on current form energy generation
  const generateTeamEnergy = (formMapToUse: Record<string, string>) => {
    const energy: Record<string, Record<string, number>> = { left: {}, right: {} };
    for (const color of ENERGY_COLORS) {
      energy.left[color] = 0;
      energy.right[color] = 0;
    }
    for (const team of teams) {
      for (const p of team.placements) {
        const char = getCharacter(p.characterId);
        if (!char) continue;
        const formId = formMapToUse[p.characterId];
        const charForms = getFormsForCharacter(p.characterId);
        const form = charForms.find((f) => f.id === formId);
        const energyGen = form?.energyOverride ?? char.energyGeneration;
        for (const eg of energyGen) {
          energy[team.side][eg.color] = (energy[team.side][eg.color] ?? 0) + eg.amount;
        }
      }
    }
    return energy;
  };

  const startBattle = () => {
    // Initialize HP for all placed characters
    const hpMap: Record<string, number> = {};
    for (const team of teams) {
      for (const p of team.placements) {
        const char = getCharacter(p.characterId);
        if (char) hpMap[char.id] = char.stats.hp;
      }
    }
    setCurrentHpMap(hpMap);
    const order = computeTurnOrder(teams, getCharacter, {});
    setTurnOrder(order);
    setRound(1);
    setCurrentTurnIndex(0);
    setSpeedOverrides({});
    setSelectedCharId(null);
    setViewedCharId(null);
    // Initialize form map: use staging selection or first startable form
    const formMap: Record<string, string> = {};
    for (const team of teams) {
      for (const p of team.placements) {
        const charForms = getFormsForCharacter(p.characterId);
        const stagingChoice = stagingFormMap[p.characterId];
        const startableForm = charForms.find((f) => f.id === stagingChoice && f.startable !== false)
          ?? charForms.find((f) => f.startable !== false)
          ?? charForms[0];
        if (startableForm) formMap[p.characterId] = startableForm.id;
      }
    }
    setBattleFormMap(formMap);
    setCycleIndexMap({});
    setSkillLevelMap({});
    setCharacterLevelMap({});
    setSkillPointsMap({});
    setEndOfRoundPhaseOpen(false);
    setRoundEnding(false);
    // Generate base energy + round-start skill energy for round 1
    const initialEnergy = generateTeamEnergy(formMap);
    for (const team of teams) {
      for (const p of team.placements) {
        const char = getCharacter(p.characterId);
        if (!char) continue;
        const lo = char.equippedLoadout;
        const equippedIds = [lo.innateId, lo.basicId, ...lo.abilityIds].filter(Boolean) as string[];
        for (const sid of equippedIds) {
          const skill = skills.find((s) => s.id === sid);
          if (!skill) continue;
          const level = skill.levels[0]; // round 1 = always level 1
          if (!level?.energyGenerate) continue;
          if ((level.energyGenerate.trigger ?? "on-use") !== "round-start") continue;
          const eg = level.energyGenerate;
          if (eg.mode === "specific" && eg.color) {
            initialEnergy[team.side][eg.color] = (initialEnergy[team.side][eg.color] ?? 0) + eg.count;
          } else if (eg.mode === "random") {
            for (let i = 0; i < eg.count; i++) {
              const pick = ENERGY_COLORS[Math.floor(Math.random() * ENERGY_COLORS.length)];
              initialEnergy[team.side][pick] = (initialEnergy[team.side][pick] ?? 0) + 1;
            }
          }
        }
      }
    }
    setTeamEnergy(initialEnergy);
    setBattleLog([]);
    setFiredOnceEffects(new Set());
    setDefeatedCharIds(new Set());
    setStolenEnergyByChar({});
    setBattleStats({});
    setInstantUsedMap({});
    // Apply "while equipped" passive buffs at battle start
    const initialBuffs: Record<string, BuffDebuff[]> = {};
    for (const team of teams) {
      for (const p of team.placements) {
        const char = getCharacter(p.characterId);
        if (!char) continue;
        const fId = formMap[p.characterId] ?? null;
        const assigns = characterSkills.filter((cs) => cs.characterId === p.characterId);
        const resolved = resolveFormView(char, fId, skills, assigns);
        const equipped = [resolved.innate, resolved.basic, ...resolved.abilities, ...resolved.conditionals].filter(Boolean) as Skill[];
        const charBuffs: BuffDebuff[] = [];
        for (const skill of equipped) {
          const canLvl = (skill.skillType === "ability" && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);
          const li = canLvl ? (1) - 1 : 0; // start at level 1
          const level = skill.levels[li];
          if (!level?.passive || !level.effects) continue;
          for (const eff of level.effects) {
            const t = eff.trigger ?? "on-use";
            // "while-equipped" effects on passive skills = auto-apply as permanent
            if (t !== "while-equipped") continue;
            const se = statusEffects.find((s) => s.id === eff.effectId);
            if (!se) continue;
            charBuffs.push({
              id: crypto.randomUUID(),
              effectId: se.id,
              effectName: se.name,
              category: se.category,
              stats: se.stats,
              modifier: !se.stats.includes("none") ? eff.modifier : 0,
              duration: -1, // permanent while equipped
              source: skill.name,
              sourceCharId: p.characterId,
              ...(se.tags ? { tags: se.tags } : {}),
            });
          }
        }
        if (charBuffs.length > 0) initialBuffs[p.characterId] = charBuffs;
      }
    }
    setBuffsMap(initialBuffs);
    setPhase("battle");
  };

  const endBattle = () => {
    setPhase("staging");
    setTurnOrder([]);
    setRound(1);
    setCurrentTurnIndex(0);
    setSpeedOverrides({});
    setCurrentHpMap({});
    setBuffsMap({});
    setSkillLevelMap({});
    setCharacterLevelMap({});
    setSkillPointsMap({});
    setEndOfRoundPhaseOpen(false);
    setRoundEnding(false);
    setTeamEnergy({});
    setHoveredCharId(null);
    setViewedCharId(null);
    setBattleFormMap({});
    setCycleIndexMap({});
    setSwitchUsedByChar(new Set());
  };

  // Tick buffs for a specific character (called when their turn ends)
  // Global turn identifier: buffs applied on this turn won't tick down until a future turn
  const globalTurnId = round * 100 + currentTurnIndex;

  const tickBuffsForCharacter = (charId: string) => {
    setBuffsMap((prev) => {
      const charBuffs = prev[charId];
      if (!charBuffs || charBuffs.length === 0) return prev;
      const updated = charBuffs
        .map((b) => {
          if (b.duration <= 0) return b; // permanent or already expired
          if (b.appliedTurn === globalTurnId) return b; // applied this turn, skip ticking
          return { ...b, duration: b.duration - 1 };
        })
        .filter((b) => b.duration !== 0);
      return { ...prev, [charId]: updated };
    });
  };

  // Process effect tags at start of turn. Returns true if the character should skip their turn.
  const processStartOfTurn = (charId: string): boolean => {
    // "Until next turn" expiry: when a character starts a new turn, drop any buffs
    // they cast marked untilNextTurn from a prior turn. Runs even if they're defeated.
    setBuffsMap((prev) => {
      let changed = false;
      const next: typeof prev = {};
      for (const [cid, list] of Object.entries(prev)) {
        const filtered = list.filter((b) => {
          if (!b.untilNextTurn) return true;
          if (b.sourceCharId !== charId) return true;
          if (b.appliedTurn === globalTurnId) return true; // just applied; don't clear yet
          changed = true;
          return false;
        });
        next[cid] = filtered;
      }
      return changed ? next : prev;
    });
    // Skip defeated characters entirely. Read from the live ref so just-killed chars
    // are detected even when this runs from a stale closure right after the kill.
    if ((currentHpMapRef.current[charId] ?? 1) <= 0) {
      return true;
    }
    const charBuffs = buffsMap[charId] ?? [];
    const char = getCharacter(charId);
    if (!char) return false;
    let skipTurn = false;
    for (const b of charBuffs) {
      if (!b.tags) continue;
      for (const tag of b.tags) {
        const p = tag.params;
        if (tag.type === "dot") {
          const pct = ((p.percent as number) ?? 10) / 100;
          const dmg = Math.ceil(char.stats.hp * pct);
          const cur = currentHpMap[charId] ?? char.stats.hp;
          setCurrentHpMap((prev) => ({ ...prev, [charId]: Math.max(0, cur - dmg) }));
          spawnDamageFloat(charId, dmg, false);
          addBattleLog(`${char.name} takes ${dmg} ${(p.damageType as string) ?? "true"} damage from ${b.effectName}.`);
        } else if (tag.type === "hot") {
          const pct = ((p.percent as number) ?? 5) / 100;
          const heal = Math.ceil(char.stats.hp * pct);
          const cur = currentHpMap[charId] ?? char.stats.hp;
          setCurrentHpMap((prev) => ({ ...prev, [charId]: Math.min(char.stats.hp, cur + heal) }));
          spawnDamageFloat(charId, heal, true);
          addBattleLog(`${char.name} heals ${heal} HP from ${b.effectName}.`);
        } else if (tag.type === "skip-turn") {
          skipTurn = true;
          addBattleLog(`${char.name} is affected by ${b.effectName} and loses their turn!`);
        }
      }
    }

    // Apply turn-start effects from equipped passive skills
    const formId = battleFormMap[charId] ?? null;
    const charAssigns = characterSkills.filter((cs) => cs.characterId === charId);
    const resolved = resolveFormView(char, formId, skills, charAssigns);
    const equippedSkills = [resolved.innate, resolved.basic, ...resolved.abilities, ...resolved.conditionals].filter(Boolean) as Skill[];
    for (const skill of equippedSkills) {
      const canLevel = (skill.skillType === "ability" && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);
      const lvlIdx = canLevel ? (skillLevelMap[skill.id] ?? 1) - 1 : 0;
      const level = skill.levels[lvlIdx];
      if (!level?.passive) continue;
      const turnStartEffects = (level.effects ?? []).filter((eff) => eff.trigger === "turn-start");
      for (const eff of turnStartEffects) {
        const se = statusEffects.find((s) => s.id === eff.effectId);
        if (!se) continue;
        // Roll chance
        if (eff.chance !== undefined && eff.chance < 100) {
          const roll = Math.random() * 100;
          if (roll >= eff.chance) {
            addBattleLog(`${char.name}'s ${skill.name}: ${se.name} missed! (${eff.chance}% chance)`);
            continue;
          }
        }
        // Resolve targets
        const effTargets = resolveTargets(eff.targetType, charId, teams, getCharacter, currentHpMapRef.current);
        const targetIds = effTargets.targets.map((t) => t.characterId);
        const resolvedIds = targetIds.length > 0 ? targetIds : [charId];
        const buff: Omit<BuffDebuff, "id"> = {
          effectId: se.id,
          effectName: se.name,
          category: se.category,
          stats: se.stats,
          modifier: !se.stats.includes("none") ? eff.modifier : 0,
          duration: eff.duration,
          source: skill.name,
          sourceCharId: charId,
          appliedTurn: globalTurnId,
          ...(se.tags ? { tags: se.tags } : {}),
          ...(se.stackable ? { stackable: true, maxStacks: se.maxStacks, stacks: 1, ...(se.onMaxStacks ? { onMaxStacks: se.onMaxStacks } : {}) } : {}),
        };
        for (const tid of resolvedIds) {
          setBuffsMap((prev) => {
            const existing = prev[tid] ?? [];
            const { buffs: updated, triggered } = applyBuffStacking(existing, buff);
            if (triggered) {
              const grantEffect = statusEffects.find((s) => s.id === triggered);
              if (grantEffect) {
                const grantBuff: BuffDebuff = {
                  id: crypto.randomUUID(), effectId: grantEffect.id, effectName: grantEffect.name,
                  category: grantEffect.category, stats: grantEffect.stats,
                  modifier: grantEffect.defaultModifier ?? 0, duration: 1, source: grantEffect.name,
                  appliedTurn: globalTurnId,
                  ...(grantEffect.tags ? { tags: grantEffect.tags } : {}),
                };
                addBattleLog(`${getCharacter(tid)?.name ?? "Unknown"} reaches max stacks! ${grantEffect.name} activated!`);
                return { ...prev, [tid]: [...updated, grantBuff] };
              }
            }
            return { ...prev, [tid]: updated };
          });
          const tName = getCharacter(tid)?.name ?? "Unknown";
          const modText = !se.stats.includes("none") ? ` (${eff.modifier > 0 ? "+" : ""}${eff.modifier}%)` : "";
          addBattleLog(`${char.name}'s ${skill.name}: ${se.name}${modText} applied to ${tName}.`);
        }
      }

      // Process cycleEffectPools — pick the next effect in sequence per pool
      const cyclePools = level.cycleEffectPools ?? [];
      cyclePools.forEach((pool, poolIdx) => {
        if (pool.effects.length === 0) return;
        const cycleKey = `${charId}|${skill.id}|${poolIdx}`;
        const curIdx = cycleIndexMap[cycleKey] ?? 0;
        const eff = pool.effects[curIdx % pool.effects.length];
        // Advance index for next time
        setCycleIndexMap((prev) => ({ ...prev, [cycleKey]: (curIdx + 1) % pool.effects.length }));
        const se = statusEffects.find((s) => s.id === eff.effectId);
        if (!se) return;
        // Cycle pool effects are mutually exclusive: remove any previously-applied buff
        // whose effect is in the same pool (via effectId match).
        const poolEffectIds = new Set(pool.effects.map((e) => e.effectId));
        // Resolve targets
        const effTargets = resolveTargets(eff.targetType, charId, teams, getCharacter, currentHpMapRef.current);
        const targetIds = effTargets.targets.map((t) => t.characterId);
        const resolvedIds = targetIds.length > 0 ? targetIds : [charId];
        const buff: Omit<BuffDebuff, "id"> = {
          effectId: se.id,
          effectName: se.name,
          category: se.category,
          stats: se.stats,
          modifier: !se.stats.includes("none") ? eff.modifier : 0,
          duration: eff.duration,
          source: skill.name,
          sourceCharId: charId,
          appliedTurn: globalTurnId,
          ...(se.tags ? { tags: se.tags } : {}),
          ...(se.stackable ? { stackable: true, maxStacks: se.maxStacks, stacks: 1, ...(se.onMaxStacks ? { onMaxStacks: se.onMaxStacks } : {}) } : {}),
        };
        for (const tid of resolvedIds) {
          setBuffsMap((prev) => {
            // Strip any existing buff whose effect is in the same cycle pool
            const existing = (prev[tid] ?? []).filter((b) => !poolEffectIds.has(b.effectId));
            const { buffs: updated } = applyBuffStacking(existing, buff);
            return { ...prev, [tid]: updated };
          });
          const tName = getCharacter(tid)?.name ?? "Unknown";
          const modText = !se.stats.includes("none") ? ` (${eff.modifier > 0 ? "+" : ""}${eff.modifier}%)` : "";
          addBattleLog(`${char.name}'s ${skill.name}: ${se.name}${modText} applied to ${tName}${eff.duration === -1 ? "" : ` for ${eff.duration} turns`}.`);
        }
      });
    }

    return skipTurn;
  };

  // Bug fix: startBattle never called processStartOfTurn for the first character of round 1,
  // so passive turn-start effects (e.g. Lightning's cycled imbue innate) missed their first
  // activation. This effect runs once per battle entry as soon as the turn order is populated.
  useEffect(() => {
    if (phase !== "battle") {
      firstTurnFiredRef.current = false;
      return;
    }
    if (firstTurnFiredRef.current) return;
    if (round !== 1 || currentTurnIndex !== 0) return;
    if (turnOrder.length === 0) return;
    const firstCharId = turnOrder[0]?.characterId;
    if (!firstCharId) return;
    firstTurnFiredRef.current = true;
    const shouldSkip = processStartOfTurn(firstCharId);
    if (shouldSkip) {
      tickBuffsForCharacter(firstCharId);
      // Defer the skip-advance so React commits the current render first.
      setTimeout(() => {
        if (turnOrder.length <= 1) {
          advanceToTurn(0, true);
        } else {
          advanceToTurn(1);
        }
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, currentTurnIndex, turnOrder]);

  const advanceToTurn = (nextIdx: number, nextRound?: boolean) => {
    if (nextRound) {
      // Use effective speeds (form overrides + buffs) for the new round's turn order
      const baseOrder = computeTurnOrder(teams, getCharacter, speedOverrides);
      const order = baseOrder
        .map((entry) => ({ ...entry, speed: getEffectiveSpeed(entry.characterId) }))
        .sort((a, b) => b.speed - a.speed);
      setTurnOrder(order);
      setRound((prev) => prev + 1);
      setCurrentTurnIndex(0);
      setInstantUsedMap({});
      // Preserve rainbow energy across rounds (it's not discarded)
      setTeamEnergy((prevEnergy) => {
        const fresh = generateTeamEnergy(battleFormMap);
        for (const side of ["left", "right"]) {
          fresh[side].rainbow = prevEnergy[side]?.rainbow ?? 0;
        }
        // Round-start energy generation from equipped skills (e.g. Red Draw innate).
        // Only living characters contribute.
        const hpSnap = currentHpMapRef.current;
        for (const team of teams) {
          for (const p of team.placements) {
            if ((hpSnap[p.characterId] ?? 0) <= 0) continue;
            const char = getCharacter(p.characterId);
            if (!char) continue;
            const lo = char.equippedLoadout;
            const equippedIds = [lo.innateId, lo.basicId, ...lo.abilityIds].filter(Boolean) as string[];
            for (const sid of equippedIds) {
              const skill = skills.find((s) => s.id === sid);
              if (!skill) continue;
              const canLevel = (skill.skillType === "ability" && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);
              const lvl = canLevel ? (skillLevelMap[sid] ?? 1) : 1;
              const level = skill.levels[lvl - 1];
              if (!level?.energyGenerate) continue;
              if ((level.energyGenerate.trigger ?? "on-use") !== "round-start") continue;
              const eg = level.energyGenerate;
              if (eg.mode === "specific" && eg.color) {
                fresh[team.side][eg.color] = (fresh[team.side][eg.color] ?? 0) + eg.count;
              } else if (eg.mode === "random") {
                for (let i = 0; i < eg.count; i++) {
                  const pick = ENERGY_COLORS[Math.floor(Math.random() * ENERGY_COLORS.length)];
                  fresh[team.side][pick] = (fresh[team.side][pick] ?? 0) + 1;
                }
              }
              // "choose" mode is not supported at round-start (no picker); falls back to random
            }
          }
        }
        return fresh;
      });
      // Process start of turn for first character
      const firstCharId = order[0]?.characterId;
      if (firstCharId) {
        const shouldSkip = processStartOfTurn(firstCharId);
        if (shouldSkip) {
          tickBuffsForCharacter(firstCharId);
          // Skip turn — advance after a brief moment
          setTimeout(() => {
            if (order.length <= 1) {
              advanceToTurn(0, true);
            } else {
              setCurrentTurnIndex(1);
              const nextCharId = order[1]?.characterId;
              if (nextCharId) {
                const alsoSkip = processStartOfTurn(nextCharId);
                if (alsoSkip) tickBuffsForCharacter(nextCharId);
              }
            }
          }, 100);
        }
      }
    } else {
      setCurrentTurnIndex(nextIdx);
      setExpandedTemplateSkillId(null);
      // Process start of turn for the new active character
      const nextCharId = turnOrder[nextIdx]?.characterId;
      if (nextCharId) {
        const shouldSkip = processStartOfTurn(nextCharId);
        if (shouldSkip) {
          tickBuffsForCharacter(nextCharId);
          setTimeout(() => {
            if (nextIdx >= turnOrder.length - 1) {
              advanceToTurn(0, true);
            } else {
              advanceToTurn(nextIdx + 1);
            }
          }, 100);
        }
      }
    }
  };

  const nextTurn = () => {
    if (roundEnding) return; // input locked while round transition is in flight
    // Tick buffs for the character whose turn just ended
    const endingCharId = turnOrder[currentTurnIndex]?.characterId;
    if (endingCharId) tickBuffsForCharacter(endingCharId);
    advanceToTurn(currentTurnIndex + 1);
  };

  const endRound = () => {
    if (roundEnding) return; // already in transition; ignore re-entry from spam clicks
    setRoundEnding(true);
    // Tick buffs for the last character whose turn just ended
    const endingCharId = turnOrder[currentTurnIndex]?.characterId;
    if (endingCharId) tickBuffsForCharacter(endingCharId);
    // Award +1 skill point to every living character on both teams.
    // Defeated characters do not earn SP.
    setSkillPointsMap((prev) => {
      const next = { ...prev };
      for (const team of teams) {
        for (const p of team.placements) {
          if (defeatedCharIds.has(p.characterId)) continue;
          next[p.characterId] = (next[p.characterId] ?? 0) + 1;
        }
      }
      return next;
    });
    // Open the end-of-round phase modal. The next round only starts
    // when the player clicks "Begin Next Round" inside the modal.
    // Delay so damage floats / animations from the final action of the round
    // have time to play before the modal covers the battlefield.
    setTimeout(() => {
      setEndOfRoundPhaseOpen(true);
    }, 1500);
  };

  const beginNextRound = () => {
    setEndOfRoundPhaseOpen(false);
    setRoundEnding(false);
    advanceToTurn(0, true);
  };

  // Spend energy for a skill — uses base color first, then dips into rainbow
  const useSkillEnergy = (skillId: string) => {
    if (!activeCharId) return;
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    const canLevel = (skill.skillType === "ability" && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);
    const currentLevel = canLevel ? (skillLevelMap[skillId] ?? 1) : 1;
    const levelIdx = currentLevel - 1;
    const cost = skill.levels[levelIdx]?.cost ?? [];
    if (cost.length === 0) return;

    const charSide = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
    if (!charSide) return;

    setTeamEnergy((prev) => {
      const sideEnergy = { ...(prev[charSide] ?? {}) };
      for (const c of cost) {
        const have = sideEnergy[c.color] ?? 0;
        if (have >= c.amount) {
          sideEnergy[c.color] = have - c.amount;
        } else {
          // Use what we have of the color, then dip into rainbow
          sideEnergy[c.color] = 0;
          const shortfall = c.amount - have;
          sideEnergy.rainbow = Math.max(0, (sideEnergy.rainbow ?? 0) - shortfall);
        }
      }
      return { ...prev, [charSide]: sideEnergy };
    });
    // Track energy spent
    const totalSpent = cost.reduce((sum, c) => sum + c.amount, 0);
    if (totalSpent > 0) {
      addBattleStat(activeCharId, "energySpent", totalSpent);
      addBattleStat(activeCharId, "skillsUsed", 1);
    }
  };

  const canAffordSkill = (skillId: string): boolean => {
    if (!activeCharId) return false;
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return false;
    const canLevel = (skill.skillType === "ability" && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);
    const currentLevel = canLevel ? (skillLevelMap[skillId] ?? 1) : 1;
    const levelIdx = currentLevel - 1;
    const cost = skill.levels[levelIdx]?.cost ?? [];
    if (cost.length === 0) return true;

    const charSide = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
    if (!charSide) return false;
    const sideEnergy = teamEnergy[charSide] ?? {};
    // Total rainbow shortfall must not exceed available rainbow
    let rainbowNeeded = 0;
    for (const c of cost) {
      const have = sideEnergy[c.color] ?? 0;
      if (have < c.amount) rainbowNeeded += c.amount - have;
    }
    return rainbowNeeded <= (sideEnergy.rainbow ?? 0);
  };

  const isLastTurn = currentTurnIndex >= turnOrder.length - 1;
  const activeCharId = turnOrder[currentTurnIndex]?.characterId ?? null;
  const currentTurnChar = activeCharId ? getCharacter(activeCharId) : null;
  // The side panel shows the viewed char, or falls back to the active turn char
  const panelCharId = phase === "battle" ? (viewedCharId ?? activeCharId) : null;
  const isViewingNonActive = viewedCharId !== null && viewedCharId !== activeCharId;
  // During battle, highlight the panel character on the grid
  const gridSelectedId = phase === "battle" ? panelCharId : selectedCharId;

  // Switch mode: compute valid adjacent cells of the active character
  const switchAdjacentCells = useMemo(() => {
    if (!switchMode || !activeCharId || phase !== "battle") return new Set<string>();
    const activeTeam = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId));
    if (!activeTeam) return new Set<string>();
    const activePlacement = activeTeam.placements.find((p) => p.characterId === activeCharId);
    if (!activePlacement) return new Set<string>();
    const { row, col } = activePlacement.position;
    const adjacent = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ].filter((c) => c.row >= 0 && c.row <= 2 && c.col >= 0 && c.col <= 2);
    return new Set(adjacent.map((c) => `${activeTeam.side}-${c.row}-${c.col}`));
  }, [switchMode, activeCharId, phase, teams]);

  // Teleport mode: compute empty cells on the destination side
  const teleportEmptyCells = useMemo(() => {
    if (!teleportRequest || phase !== "battle") return new Set<string>();
    const casterTeam = teams.find((t) => t.placements.some((p) => p.characterId === teleportRequest.charId));
    if (!casterTeam) return new Set<string>();
    const targetTeam = teleportRequest.destSide === "ally" ? casterTeam : teams.find((t) => t.id !== casterTeam.id);
    if (!targetTeam) return new Set<string>();
    const occupied = new Set(targetTeam.placements.map((p) => `${p.position.row},${p.position.col}`));
    const cells = new Set<string>();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (!occupied.has(`${r},${c}`)) cells.add(`${targetTeam.side}-${r}-${c}`);
      }
    }
    return cells;
  }, [teleportRequest, phase, teams]);

  // Adjacent-move mode: 4-directional neighbors of caster on own team's grid.
  // Allowed cells: empty cells (walk into) + ally-occupied cells (swap with ally).
  const adjacentMoveCells = useMemo(() => {
    if (!adjacentMoveRequest || phase !== "battle") return new Set<string>();
    const casterTeam = teams.find((t) => t.placements.some((p) => p.characterId === adjacentMoveRequest.charId));
    if (!casterTeam) return new Set<string>();
    const casterPlacement = casterTeam.placements.find((p) => p.characterId === adjacentMoveRequest.charId);
    if (!casterPlacement) return new Set<string>();
    const { row, col } = casterPlacement.position;
    const neighbors: { r: number; c: number }[] = [
      { r: row - 1, c: col },
      { r: row + 1, c: col },
      { r: row, c: col - 1 },
      { r: row, c: col + 1 },
    ];
    const cells = new Set<string>();
    for (const n of neighbors) {
      if (n.r < 0 || n.r > 2 || n.c < 0 || n.c > 2) continue;
      cells.add(`${casterTeam.side}-${n.r}-${n.c}`);
    }
    return cells;
  }, [adjacentMoveRequest, phase, teams]);

  const handleAdjacentMoveClick = (cellId: string) => {
    if (!adjacentMoveRequest) return;
    if (!adjacentMoveCells.has(cellId)) return;
    const [, rowStr, colStr] = cellId.split("-");
    const row = parseInt(rowStr);
    const col = parseInt(colStr);
    const { charId } = adjacentMoveRequest;
    const casterTeam = teams.find((t) => t.placements.some((p) => p.characterId === charId));
    if (!casterTeam) return;
    const casterPlacement = casterTeam.placements.find((p) => p.characterId === charId);
    if (!casterPlacement) return;
    const occupant = casterTeam.placements.find((p) => p.position.row === row && p.position.col === col);
    let newPlacements: typeof casterTeam.placements;
    if (occupant && occupant.characterId !== charId) {
      // Swap with ally
      newPlacements = casterTeam.placements.map((p) => {
        if (p.characterId === charId) return { ...p, position: { row, col } };
        if (p.characterId === occupant.characterId) return { ...p, position: { row: casterPlacement.position.row, col: casterPlacement.position.col } };
        return p;
      });
      addBattleLog(`${getCharacter(charId)?.name ?? "Unknown"} swaps places with ${getCharacter(occupant.characterId)?.name ?? "Unknown"}.`);
    } else {
      newPlacements = casterTeam.placements.map((p) =>
        p.characterId === charId ? { ...p, position: { row, col } } : p
      );
      addBattleLog(`${getCharacter(charId)?.name ?? "Unknown"} moves to an adjacent space.`);
    }
    updateTeam({ ...casterTeam, placements: newPlacements });
    const wasInstant = adjacentMoveRequest.instant;
    setAdjacentMoveRequest(null);
    if (!wasInstant) {
      if (isLastTurn) { endRound(); } else { nextTurn(); }
    }
  };

  const handleTeleportClick = (cellId: string) => {
    if (!teleportRequest) return;
    if (!teleportEmptyCells.has(cellId)) return;
    const [side, rowStr, colStr] = cellId.split("-");
    const row = parseInt(rowStr);
    const col = parseInt(colStr);
    const { charId } = teleportRequest;
    const casterTeam = teams.find((t) => t.placements.some((p) => p.characterId === charId));
    if (!casterTeam) return;
    const destTeam = teams.find((t) => t.side === side);
    if (!destTeam) return;
    if (casterTeam.id === destTeam.id) {
      const newPlacements = casterTeam.placements.map((p) =>
        p.characterId === charId ? { ...p, position: { row, col } } : p
      );
      updateTeam({ ...casterTeam, placements: newPlacements });
    } else {
      const fromPlacements = casterTeam.placements.filter((p) => p.characterId !== charId);
      const toPlacements = [...destTeam.placements, { characterId: charId, position: { row, col } }];
      updateTeam({ ...casterTeam, placements: fromPlacements });
      updateTeam({ ...destTeam, placements: toPlacements });
    }
    const cName = getCharacter(charId)?.name ?? "Unknown";
    addBattleLog(`${cName} teleports to row ${row + 1}, ${["front", "mid", "back"][col]}.`);
    const wasInstant = teleportRequest.instant;
    setTeleportRequest(null);
    if (!wasInstant) {
      if (isLastTurn) { endRound(); } else { nextTurn(); }
    }
  };

  const handleSwitchClick = (cellId: string) => {
    if (!switchMode || !activeCharId) return;
    // Parse cell ID: "left-row-col" or "right-row-col"
    const [side, rowStr, colStr] = cellId.split("-");
    const row = parseInt(rowStr);
    const col = parseInt(colStr);
    const team = teams.find((t) => t.side === side);
    if (!team) return;
    const activeTeam = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId));
    if (!activeTeam || activeTeam.id !== team.id) return; // can only swap within own team
    const activePlacement = team.placements.find((p) => p.characterId === activeCharId);
    if (!activePlacement) return;
    const targetPlacement = team.placements.find((p) => p.position.row === row && p.position.col === col);
    let newPlacements: typeof team.placements;
    if (targetPlacement) {
      // Swap positions
      newPlacements = team.placements.map((p) => {
        if (p.characterId === activeCharId) return { ...p, position: { row, col } };
        if (p.characterId === targetPlacement.characterId) return { ...p, position: activePlacement.position };
        return p;
      });
      addBattleLog(`${getCharacter(activeCharId)?.name ?? "Unknown"} swaps places with ${getCharacter(targetPlacement.characterId)?.name ?? "Unknown"}.`);
    } else {
      // Move to empty cell
      newPlacements = team.placements.map((p) =>
        p.characterId === activeCharId ? { ...p, position: { row, col } } : p
      );
      addBattleLog(`${getCharacter(activeCharId)?.name ?? "Unknown"} moves to a new position.`);
    }
    updateTeam({ ...team, placements: newPlacements });
    setSwitchMode(false);
    // Switch is instant and free; mark the active character as having used their once-per-turn switch
    setSwitchUsedByChar((prev) => {
      const next = new Set(prev);
      next.add(activeCharId);
      return next;
    });
  };

  // Map of charId -> form photo url for battle phase
  const formPhotoMap = useMemo(() => {
    if (phase !== "battle") return undefined;
    const map: Record<string, string> = {};
    for (const [charId, formId] of Object.entries(battleFormMap)) {
      const charForms = getFormsForCharacter(charId);
      const form = charForms.find((f) => f.id === formId);
      if (form?.photoUrl) map[charId] = form.photoUrl;
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [phase, battleFormMap, getFormsForCharacter]);

  // Resolve energy generation for a character based on their active battle form
  const getEnergyForChar = useCallback((charId: string): EnergyGeneration[] => {
    const char = getCharacter(charId);
    if (!char) return [];
    if (phase !== "battle") return char.energyGeneration;
    const formId = battleFormMap[charId];
    if (!formId) return char.energyGeneration;
    const charForms = getFormsForCharacter(charId);
    const form = charForms.find((f) => f.id === formId);
    return form?.energyOverride ?? char.energyGeneration;
  }, [phase, battleFormMap, getFormsForCharacter, getCharacter]);

  // Grid rendering (shared between phases)
  const renderGrid = () => (
    <>
      <div className="flex items-center justify-center gap-4 mt-4">
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-2 font-medium">
            {teams[0].name}
          </div>
          <div className="flex gap-1">
            {[2, 1, 0].map((col) => (
              <div key={col} className="flex flex-col gap-1">
                {ROWS.map((row) => (
                  <GridCell
                    key={`left-${row}-${col}`}
                    id={`left-${row}-${col}`}
                    character={getCharAtPos(teams[0], row, col)}
                    side="left"
                    row={row}
                    col={col}
                    onSelectCharacter={(id) => {
                      if (phase === "battle") {
                        setViewedCharId(id);
                        setHoveredCharId(null);
                      } else {
                        setSelectedCharId(id);
                      }
                    }}
                    selectedCharId={gridSelectedId}
                    hpMap={phase === "battle" ? currentHpMap : undefined}
                    formPhotoMap={formPhotoMap}
                    onHoverCharacter={phase === "battle" ? setHoveredCharId : undefined}
                    animClass={phase === "battle" && getCharAtPos(teams[0], row, col) ? animMap[getCharAtPos(teams[0], row, col)!.id] : undefined}
                    damageFloats={phase === "battle" && getCharAtPos(teams[0], row, col) ? damageFloats.filter((d) => d.charId === getCharAtPos(teams[0], row, col)!.id) : undefined}
                    switchHighlight={switchAdjacentCells.has(`${teams[0].side}-${row}-${col}`) || teleportEmptyCells.has(`${teams[0].side}-${row}-${col}`) || adjacentMoveCells.has(`${teams[0].side}-${row}-${col}`)}
                    onSwitchClick={() => {
                      const cellId = `${teams[0].side}-${row}-${col}`;
                      if (teleportEmptyCells.has(cellId)) handleTeleportClick(cellId);
                      else if (adjacentMoveCells.has(cellId)) handleAdjacentMoveClick(cellId);
                      else handleSwitchClick(cellId);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="w-px h-64 bg-gray-700 mx-2" />

        <div className="text-center">
          <div className="text-xs text-gray-400 mb-2 font-medium">
            {teams[1].name}
          </div>
          <div className="flex gap-1">
            {COLS.map((col) => (
              <div key={col} className="flex flex-col gap-1">
                {ROWS.map((row) => (
                  <GridCell
                    key={`right-${row}-${col}`}
                    id={`right-${row}-${col}`}
                    character={getCharAtPos(teams[1], row, col)}
                    side="right"
                    row={row}
                    col={col}
                    onSelectCharacter={(id) => {
                      if (phase === "battle") {
                        setViewedCharId(id);
                        setHoveredCharId(null);
                      } else {
                        setSelectedCharId(id);
                      }
                    }}
                    selectedCharId={gridSelectedId}
                    hpMap={phase === "battle" ? currentHpMap : undefined}
                    formPhotoMap={formPhotoMap}
                    onHoverCharacter={phase === "battle" ? setHoveredCharId : undefined}
                    animClass={phase === "battle" && getCharAtPos(teams[1], row, col) ? animMap[getCharAtPos(teams[1], row, col)!.id] : undefined}
                    damageFloats={phase === "battle" && getCharAtPos(teams[1], row, col) ? damageFloats.filter((d) => d.charId === getCharAtPos(teams[1], row, col)!.id) : undefined}
                    switchHighlight={switchAdjacentCells.has(`${teams[1].side}-${row}-${col}`) || teleportEmptyCells.has(`${teams[1].side}-${row}-${col}`) || adjacentMoveCells.has(`${teams[1].side}-${row}-${col}`)}
                    onSwitchClick={() => {
                      const cellId = `${teams[1].side}-${row}-${col}`;
                      if (teleportEmptyCells.has(cellId)) handleTeleportClick(cellId);
                      else if (adjacentMoveCells.has(cellId)) handleAdjacentMoveClick(cellId);
                      else handleSwitchClick(cellId);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-4 mt-1">
        <div className="flex gap-1 w-[296px] justify-center">
          {["Back", "Mid", "Front"].map((label) => (
            <div key={label} className="w-24 text-center text-[10px] text-gray-600">
              {label}
            </div>
          ))}
        </div>
        <div className="w-px mx-2" />
        <div className="flex gap-1 w-[296px] justify-center">
          {["Front", "Mid", "Back"].map((label) => (
            <div key={label} className="w-24 text-center text-[10px] text-gray-600">
              {label}
            </div>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Battlefield</h1>
        <div className="flex gap-2">
          {phase === "staging" && (
            <>
              <button
                onClick={() => {
                  teams.forEach((t) =>
                    updateTeam({ ...t, placements: [] })
                  );
                }}
                className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
              >
                Clear All
              </button>
              <button
                onClick={startBattle}
                disabled={placedIds.size === 0}
                className={`text-xs px-4 py-1.5 rounded font-medium ${
                  placedIds.size === 0
                    ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-500 text-white"
                }`}
              >
                Fight
              </button>
            </>
          )}
          {phase === "battle" && (
            <button
              onClick={endBattle}
              className="text-xs px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium"
            >
              End Battle
            </button>
          )}
        </div>
      </div>

      {phase === "battle" && (
        <div className="space-y-3">
          {/* Round & Current Turn */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-yellow-400">
                Round {round}
              </span>
              {currentTurnChar && (
                <span className="text-sm text-gray-300">
                  Current turn:{" "}
                  <span className="text-white font-semibold">
                    {currentTurnChar.name}
                  </span>
                </span>
              )}
            </div>
            {isLastTurn && (
              <button
                onClick={endRound}
                disabled={roundEnding}
                className={`text-xs px-4 py-1.5 rounded text-white font-medium ${roundEnding ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-yellow-600 hover:bg-yellow-500"}`}
              >
                End Round
              </button>
            )}
          </div>

          {/* Turn Order Bar */}
          <TurnOrderBar
            turnOrder={turnOrder}
            currentTurnIndex={currentTurnIndex}
            hoveredCharId={hoveredCharId}
            getCharacter={getCharacter}
            formPhotoMap={formPhotoMap}
            currentHpMap={currentHpMap}
          />
        </div>
      )}

      {phase === "staging" ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0 space-y-6">
              <EnergyPool teams={teams} getCharacter={getCharacter} />
              {renderGrid()}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-medium text-gray-400">
                    Bench
                  </h2>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setBenchFilter(null)}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                        benchFilter === null
                          ? "bg-gray-600 text-white"
                          : "bg-gray-800 text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      All
                    </button>
                    {CHARACTER_TYPES.map((t) => (
                      <button
                        key={t}
                        onClick={() => setBenchFilter(benchFilter === t ? null : t)}
                        className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                          benchFilter === t
                            ? "bg-gray-600 text-white"
                            : "bg-gray-800 text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <BenchDropZone
                  bench={benchFilter ? bench.filter((c) => c.type === benchFilter) : bench}
                  selectedCharId={selectedCharId}
                  onSelectCharacter={setSelectedCharId}
                />
              </div>
            </div>

            {selectedCharId && (
              <div className="w-80 shrink-0">
                <CharacterDetailPanel
                  characterId={selectedCharId}
                  getCharacter={getCharacter}
                  skills={skills}
                  characterSkills={characterSkills}
                  isPlaced={placedIds.has(selectedCharId)}
                  onClose={() => setSelectedCharId(null)}
                  onSelectSkill={setSelectedSkill}
                  charForms={getFormsForCharacter(selectedCharId)}
                  selectedFormId={stagingFormMap[selectedCharId]}
                  onSelectForm={(fid) => setStagingFormMap((prev) => ({ ...prev, [selectedCharId!]: fid }))}
                  onToggleEquip={async (charId, skillId) => {
                    const char = getCharacter(charId);
                    if (!char) return;
                    const skill = skills.find((s) => s.id === skillId);
                    if (!skill) return;
                    const newLoadout = toggleEquipLoadout(char.equippedLoadout, skillId, skill.skillType);
                    await updateCharacter({ ...char, equippedLoadout: newLoadout });
                  }}
                />
              </div>
            )}
          </div>

          <DragOverlay>
            {activeChar && <CharacterChip character={activeChar} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex gap-4 items-start">
          {/* Column 1: Battle Log — height synced to column 2, scrolls internally */}
          <div
            className="shrink-0 w-[280px] bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col min-h-0"
            style={middleColHeight ? { height: middleColHeight } : undefined}
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 shrink-0">
              <span className="text-xs text-gray-400 font-medium">Battle Log</span>
              <button
                onClick={() => setBattleLog([])}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 scrollbar-thin">
              {(() => {
                // Group entries by groupId, render newest group first
                const reversed = [...battleLog].reverse();
                const groups: BattleLogEntry[][] = [];
                let currentGroup: BattleLogEntry[] = [];
                let currentGid: number | null = null;
                for (const entry of reversed) {
                  if (entry.groupId !== currentGid) {
                    if (currentGroup.length > 0) groups.push(currentGroup);
                    currentGroup = [entry];
                    currentGid = entry.groupId;
                  } else {
                    currentGroup.push(entry);
                  }
                }
                if (currentGroup.length > 0) groups.push(currentGroup);

                const colorFor = (kind: LogKind): string => {
                  switch (kind) {
                    case "round": return "text-yellow-300 font-semibold";
                    case "damage": return "text-red-300";
                    case "heal": return "text-green-300";
                    case "buff": return "text-blue-300";
                    case "debuff": return "text-purple-300";
                    case "status": return "text-cyan-300";
                    case "defeat": return "text-red-500 font-semibold";
                    case "revive": return "text-emerald-400 font-semibold";
                    case "miss": return "text-gray-500 italic";
                    case "skill": return "text-amber-200";
                    default: return "text-gray-400";
                  }
                };

                return groups.map((group, gi) => (
                  <div
                    key={group[0].id}
                    className={`animate-log-in py-1 px-1.5 rounded ${gi === 0 ? "bg-gray-800/40" : ""} ${gi !== groups.length - 1 ? "mb-1.5 border-b border-gray-800/60 pb-1.5" : ""}`}
                  >
                    {group.map((entry) => (
                      <p key={entry.id} className={`text-[11px] leading-snug ${colorFor(entry.kind)}`}>
                        {entry.text}
                      </p>
                    ))}
                  </div>
                ));
              })()}
              {battleLog.length === 0 && (
                <p className="text-[11px] text-gray-600 italic">No events yet.</p>
              )}
            </div>
          </div>
          {/* Column 2: Battlefield (top) + Active character (bottom) — fixed width; its height drives columns 1 and 3 */}
          <div ref={middleColRef} className="shrink-0 space-y-3 w-[720px]">
            {/* Battlefield grid */}
            <div>
              <EnergyPool
                teams={teams}
                getCharacter={getCharacter}
                getEnergyForChar={getEnergyForChar}
                currentEnergy={teamEnergy}
                activeSide={activeCharId ? teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side : undefined}
                onClickEnergy={(side, color) => setConvertEnergyModal({ side, color })}
              />
              {renderGrid()}
            </div>

            {/* Active character action bar */}
            {activeCharId && (() => {
              const aChar = getCharacter(activeCharId);
              if (!aChar) return null;
              const aFormId = battleFormMap[activeCharId] ?? null;
              const aCharForms = getFormsForCharacter(activeCharId);
              const aForm = aCharForms.find((f) => f.id === aFormId);
              const aPhoto = aForm?.photoUrl ?? aChar.photoUrl;
              const aType = aForm?.typeOverride ?? aChar.type;
              const aHp = currentHpMap[activeCharId] ?? aChar.stats.hp;
              const aMaxHp = aChar.stats.hp;
              const aBattleState: BattleState = { buffs: buffsMap[activeCharId] ?? [], currentHp: aHp, maxHp: aMaxHp };
              const aResolved = resolveFormView(aChar, aFormId, skills, characterSkills, aBattleState);
              const hpPct = Math.max(0, Math.min(100, (aHp / aMaxHp) * 100));
              const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500";

              // Check for status restrictions on the active character
              const activeBuffs = buffsMap[activeCharId] ?? [];
              const isStunned = activeBuffs.some((b) => b.tags?.some((t) => t.type === "skip-turn"));
              const isSwitchBlocked = activeBuffs.some((b) => b.tags?.some((t) => t.type === "restrict-switch"));
              const restrictedSkillTypes = (() => {
                for (const b of activeBuffs) {
                  if (!b.tags) continue;
                  for (const t of b.tags) {
                    if (t.type === "restrict-skills" && Array.isArray(t.params.allowed)) {
                      return new Set(t.params.allowed as string[]);
                    }
                  }
                }
                return null; // no restriction
              })();

              return (
                <div key={activeCharId} className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2 animate-panel-in">
                  {/* Character info row */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setViewedCharId(activeCharId); setDetailsTab("stats"); }}
                      className="flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {aPhoto ? (
                        <img src={aPhoto} alt={aChar.name} className="w-10 h-10 rounded-lg object-cover border border-gray-700" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-sm font-bold text-gray-600">{aChar.name.charAt(0)}</div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white">{aChar.name}</span>
                          <span className="text-[10px] bg-yellow-500/20 text-yellow-300 font-bold px-1.5 py-0.5 rounded uppercase">Active</span>
                          <span className="text-[10px] text-gray-500">{aType}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full ${hpColor} rounded-full`} style={{ width: `${hpPct}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-400 tabular-nums">{aHp}/{aMaxHp}</span>
                        </div>
                      </div>
                    </button>

                    {/* Form switcher */}
                    {aCharForms.length > 1 && (
                      <div className="flex gap-1 ml-auto shrink-0">
                        {aCharForms.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setBattleFormMap((prev) => ({ ...prev, [activeCharId]: f.id }))}
                            className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                              aFormId === f.id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            {f.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Active effects (buffs/debuffs) */}
                  {activeBuffs.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {activeBuffs.map((b) => {
                        const color = b.category === "buff" ? "bg-green-800/50 border-green-600/40 text-green-300"
                          : b.category === "debuff" ? "bg-red-800/50 border-red-600/40 text-red-300"
                          : "bg-purple-800/50 border-purple-600/40 text-purple-300";
                        return (
                          <span key={b.id} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-medium ${color}`} title={`${b.effectName}: ${b.modifier > 0 ? "+" : ""}${b.modifier}% ${b.stats.join(", ")} | ${b.duration === -1 ? "permanent" : b.untilNextTurn ? "until next turn" : `${b.duration}t`}${b.stacks && b.stacks > 1 ? ` x${b.stacks}` : ""}`}>
                            {b.effectName}
                            {b.stacks && b.stacks > 1 && <span className="text-[8px] opacity-70">x{b.stacks}</span>}
                            {b.duration > 0 && !b.untilNextTurn && <span className="text-[8px] opacity-50">{b.duration}t</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Skills panel: Innate + Basic stacked in column 1, abilities/conditionals wrap in column 2, Switch/Pass in column 3 */}
                  {(() => {
                    const renderSkillTile = ({ skill, type }: { skill: Skill; type: "innate" | "basic" | "ability" | "conditional" }) => {
                      const isConditional = type === "conditional";
                      const canLevel = (type === "ability" && skill.leveled !== false) || (isConditional && skill.leveled);
                      const skillAssign = characterSkills.find((cs) => cs.characterId === activeCharId && cs.skillId === skill.id);
                      const currentLevel = canLevel ? (skillLevelMap[skill.id] ?? (
                        // Check variant group for shared level
                        skillAssign?.variantGroupId
                          ? Math.max(1, ...characterSkills.filter((cs) => cs.variantGroupId === skillAssign.variantGroupId).map((cs) => skillLevelMap[cs.skillId] ?? 1))
                          : 1
                      )) : 1;
                      const levelIdx = currentLevel - 1;
                      const maxLevel = 3;
                      // Status restrictions: stunned = all disabled, silenced = only allowed types
                      const isInstantUsed = !!skill.levels[levelIdx]?.instant && (instantUsedMap[activeCharId] ?? []).includes(skill.id);
                      // requiresAnyStatus: skill is disabled unless the caster has at least one of the listed statuses active
                      const requiresList = skill.levels[levelIdx]?.requiresAnyStatus ?? [];
                      const requiresUnmet = requiresList.length > 0 && !(activeBuffs ?? []).some((b) => requiresList.includes(b.effectId));
                      const isDisabledByStatus = isStunned || (restrictedSkillTypes !== null && !restrictedSkillTypes.has(type)) || isInstantUsed || requiresUnmet;
                      const typeLabel = type === "conditional" ? "COND" : type.toUpperCase();
                      const typeColor = type === "innate" ? "text-purple-400" : type === "basic" ? "text-blue-400" : type === "ability" ? "text-green-400" : "text-amber-400";
                      const isLeveled = canLevel && currentLevel > 1;
                      const levelBorder = isLeveled
                        ? currentLevel === 3 ? "border-yellow-500/60 shadow-[0_0_6px_rgba(234,179,8,0.15)]" : "border-blue-500/50 shadow-[0_0_6px_rgba(59,130,246,0.1)]"
                        : "";
                      const bgClass = isConditional
                        ? `bg-amber-900/20 hover:bg-amber-900/30 ${isLeveled ? levelBorder : "border-amber-700/30"}`
                        : `bg-gray-800 hover:bg-gray-700 ${isLeveled ? levelBorder : "border-gray-700"}`;
                      const nameColor = isConditional ? "text-amber-200" : "text-white";
                      const hasTemplate = !!(skill.levels[levelIdx]?.templateId);
                      const isExpanded = expandedTemplateSkillId === skill.id;

                      const isUnaffordable = type !== "innate" && !canAffordSkill(skill.id);
                      const requiredNames = requiresUnmet ? requiresList.map((sid) => statusEffects.find((s) => s.id === sid)?.name).filter(Boolean).join(", ") : "";
                      const disabledTitle = isStunned
                        ? "Stunned"
                        : restrictedSkillTypes !== null && !restrictedSkillTypes.has(type)
                          ? "Silenced"
                          : isInstantUsed
                            ? "Already used this round (instant)"
                            : requiresUnmet
                              ? `Requires: ${requiredNames}`
                              : undefined;
                      return (
                        <div key={skill.id} title={disabledTitle} className={`w-24 border rounded text-left transition-colors flex flex-col ${isExpanded ? "ring-1 ring-blue-400/50" : ""} ${isDisabledByStatus ? "opacity-40 pointer-events-none" : isUnaffordable ? `${bgClass} opacity-40` : bgClass}`}>
                          <button
                            onClick={() => {
                              if (isDisabledByStatus) return;
                              if (hasTemplate) {
                                setExpandedTemplateSkillId(isExpanded ? null : skill.id);
                              } else {
                                setSelectedSkill(skill);
                              }
                            }}
                            disabled={isDisabledByStatus}
                            className="px-2 py-1 flex-1 flex flex-col"
                          >
                            <div className="flex items-center justify-between shrink-0">
                              <div className="flex items-center gap-1">
                                <span className={`text-[9px] ${typeColor} uppercase font-medium`}>{typeLabel}</span>
                                {skill.levels[levelIdx]?.instant && (
                                  <span className="text-[9px] text-yellow-400" title="Instant — does not consume turn">⚡</span>
                                )}
                              </div>
                              {canLevel && (
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3].map((lv) => (
                                    <div
                                      key={lv}
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        lv <= currentLevel
                                          ? currentLevel === 3 ? "bg-yellow-400" : "bg-blue-400"
                                          : "bg-gray-600"
                                      }`}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className={`text-[11px] ${nameColor} font-medium leading-tight line-clamp-2 flex-1`}>{skill.name}</div>
                            <div className="h-4 flex items-center justify-between shrink-0">
                              <div className="flex items-center">
                                {skill.levels[levelIdx]?.cost.length > 0 && <EnergyCostDisplay cost={skill.levels[levelIdx].cost} />}
                              </div>
                              {hasTemplate && (
                                <span className={`text-[8px] ${isExpanded ? "text-blue-300" : "text-gray-500"}`}>{isExpanded ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </button>
                          {/* Skill upgrades are now performed during the End-of-Round leveling phase. */}
                        </div>
                      );
                    };

                    const otherSkills: { skill: Skill; type: "ability" | "conditional" }[] = [
                      ...aResolved.abilities.map((s) => ({ skill: s, type: "ability" as const })),
                      ...aResolved.conditionals.map((s) => ({ skill: s, type: "conditional" as const })),
                    ];

                    return (
                      <div className="flex flex-col gap-1.5">
                        {/* Row 1: Innate */}
                        {aResolved.innate && (
                          <div className="flex gap-1.5">
                            {renderSkillTile({ skill: aResolved.innate, type: "innate" })}
                          </div>
                        )}
                        {/* Row 2: Basic + Switch + Pass (everything that costs no energy) */}
                        <div className="flex gap-1.5 items-stretch">
                          {aResolved.basic && renderSkillTile({ skill: aResolved.basic, type: "basic" })}
                          {(() => {
                            const switchUsed = activeCharId ? switchUsedByChar.has(activeCharId) : false;
                            return (
                              <button
                                onClick={() => setSwitchMode((m) => !m)}
                                disabled={isSwitchBlocked || isStunned || switchUsed}
                                title={isSwitchBlocked ? "Cannot switch — restricted by status" : isStunned ? "Cannot act — stunned" : switchUsed ? "Already used switch this turn" : "Free, instant. Once per turn."}
                                className={`w-24 border rounded text-center transition-colors ${
                                  isSwitchBlocked || isStunned || switchUsed
                                    ? "bg-gray-900 border-gray-800 cursor-not-allowed opacity-50"
                                    : switchMode
                                    ? "bg-green-600 border-green-500 hover:bg-green-700"
                                    : "bg-gray-800 hover:bg-gray-700 border-gray-700"
                                }`}
                              >
                                <span className={`text-[10px] font-medium ${switchMode ? "text-white" : "text-gray-400"}`}>
                                  {switchMode ? "Cancel" : "Switch"}
                                </span>
                              </button>
                            );
                          })()}
                          <button
                            onClick={() => {
                              if (roundEnding) return;
                              addBattleLog(`Round ${round}. ${aChar.name} passes their turn.`);
                              // Small delay so the pass feels deliberate and the panel fade-in reads cleanly
                              setTimeout(() => {
                                if (isLastTurn) { endRound(); } else { nextTurn(); }
                              }, 180);
                            }}
                            disabled={roundEnding}
                            className={`w-24 border rounded text-center transition-colors ${roundEnding ? "bg-gray-900 border-gray-800 opacity-40 cursor-not-allowed" : "bg-gray-800 hover:bg-gray-700 border-gray-700"}`}
                          >
                            <span className="text-[10px] text-gray-400 font-medium">Pass</span>
                          </button>
                        </div>
                        {/* Row 3: Abilities + Conditionals wrapping */}
                        {otherSkills.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {otherSkills.map(({ skill, type }) => renderSkillTile({ skill, type }))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Status restriction message */}
                  {isStunned && (
                    <div className="text-[10px] text-red-400 bg-red-900/20 rounded px-2 py-1 text-center">
                      Stunned — cannot take actions
                    </div>
                  )}
                  {!isStunned && restrictedSkillTypes !== null && (
                    <div className="text-[10px] text-amber-400 bg-amber-900/20 rounded px-2 py-1 text-center">
                      Silenced — can only use {Array.from(restrictedSkillTypes).join(", ")} skills
                    </div>
                  )}

                  {/* Expanded template actions */}
                  {expandedTemplateSkillId && (() => {
                    const expSkill = [...(aResolved.abilities), ...(aResolved.conditionals)].find((s) => s.id === expandedTemplateSkillId);
                    if (!expSkill) return null;
                    const expCanLevel = expSkill.skillType === "ability" || (expSkill.skillType === "conditional" && expSkill.leveled);
                    const expLevel = expCanLevel ? (skillLevelMap[expSkill.id] ?? 1) - 1 : 0;
                    const tid = expSkill.levels[expLevel]?.templateId;
                    if (!tid) return null;
                    const tmpl = templates.find((t) => t.id === tid);
                    const actions = templateActions.filter((a) => a.templateId === tid).sort((a, b) => a.sortOrder - b.sortOrder);
                    if (!tmpl || actions.length === 0) return null;
                    // Resolve skills for each action
                    const resolvedActions = actions.map((a) => ({ action: a, skill: skills.find((s) => s.id === a.skillId) })).filter((r) => r.skill);
                    const selectedAction = selectedTemplateActionId ? resolvedActions.find((r) => r.action.id === selectedTemplateActionId) : null;
                    const selSkill = selectedAction?.skill;

                    // Determine valid targets based on targetType
                    const targetType = selSkill?.levels[0]?.targetType;
                    const attackerSideLocal = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
                    const allPlaced = teams.flatMap((t) => t.placements.map((p) => ({ charId: p.characterId, side: t.side })));
                    const isAllyTarget = targetType && ["target-ally", "target-ally-or-self", "adjacent-ally", "aoe-team", "random-ally"].includes(targetType);
                    const isSelfTarget = targetType === "self" || targetType === "target-ally-or-self";
                    const isEnemyTarget = targetType && ["target-enemy", "front-row-enemy", "random-enemy", "aoe-enemy", "self-row-enemy"].includes(targetType);
                    let validTargets = allPlaced.filter((p) => {
                      if (isAllyTarget) return p.side === attackerSideLocal && (isSelfTarget || p.charId !== activeCharId);
                      if (isSelfTarget && targetType === "self") return p.charId === activeCharId;
                      if (isEnemyTarget) return p.side !== attackerSideLocal;
                      return p.charId !== activeCharId; // default: everyone except self
                    });
                    // Front-row-enemy: filter to the frontmost enemy per row
                    if (targetType === "front-row-enemy") {
                      const enemyPlacements = teams.filter((t) => t.side !== attackerSideLocal).flatMap((t) => t.placements);
                      const frontByRow = new Map<number, string>();
                      for (const p of enemyPlacements) {
                        const existing = frontByRow.get(p.position.row);
                        if (existing === undefined) {
                          frontByRow.set(p.position.row, p.characterId);
                        } else {
                          const existingPlacement = enemyPlacements.find((ep) => ep.characterId === existing);
                          if (existingPlacement && p.position.col < existingPlacement.position.col) {
                            frontByRow.set(p.position.row, p.characterId);
                          }
                        }
                      }
                      const frontIds = new Set(frontByRow.values());
                      validTargets = validTargets.filter((t) => frontIds.has(t.charId));
                    }
                    // For self-only or ally-or-self, include self
                    if (isSelfTarget && !validTargets.some((t) => t.charId === activeCharId)) {
                      validTargets.unshift({ charId: activeCharId, side: attackerSideLocal ?? "left" });
                    }
                    // Apply force-target override
                    const tmplAttackCat = getAttackCategory(targetType, expSkill.levels[expLevel]?.damageSourceOverride);
                    const tmplForced = getForceTarget(buffsMap[activeCharId] ?? [], tmplAttackCat);
                    if (tmplForced && isEnemyTarget && validTargets.some((t) => t.charId === tmplForced)) {
                      validTargets = validTargets.filter((t) => t.charId === tmplForced);
                    }

                    const previewTarget = templatePreviewTargetId || validTargets[0]?.charId || "";

                    // Check if the skill is AOE
                    const isAoeSkillCheck = targetType === "aoe-enemy" || targetType === "aoe-team" || targetType === "self-row-enemy";

                    // Helper to compute damage/healing against a specific target
                    const computeForTarget = (tid: string): DamageResult | null => {
                      if (!selSkill?.levels[0]?.damageCategory || !activeCharId) return null;
                      const aFormId2 = battleFormMap[activeCharId] ?? null;
                      const aForm2 = aFormId2 ? getFormsForCharacter(activeCharId).find((f) => f.id === aFormId2) : null;
                      const aChar2 = getCharacter(activeCharId);
                      const targetChar = getCharacter(tid);
                      if (!aChar2 || !targetChar) return null;
                      const aStats2 = applyCharLevelStats(aForm2?.statOverrides ? { ...aChar2.stats, ...aForm2.statOverrides } : aChar2.stats, characterLevelMap[aChar2.id] ?? 0);
                      const aElemDmg2 = aForm2?.elementalDmgOverride ? { ...aChar2.elementalDamage, ...aForm2.elementalDmgOverride } : aChar2.elementalDamage;
                      const dFormId2 = battleFormMap[tid] ?? null;
                      const dForm2 = dFormId2 ? getFormsForCharacter(tid).find((f) => f.id === dFormId2) : null;
                      const dStats2 = applyCharLevelStats(dForm2?.statOverrides ? { ...targetChar.stats, ...dForm2.statOverrides } : targetChar.stats, characterLevelMap[targetChar.id] ?? 0);
                      const dElemRes2Base = dForm2?.elementalResOverride ? { ...targetChar.elementalResistance, ...dForm2.elementalResOverride } : targetChar.elementalResistance;
                      const dPassiveGrants2 = getPassiveResistanceGrants(targetChar, dFormId2, skills, characterSkills.filter((cs) => cs.characterId === tid), skillLevelMap);
                      const dElemRes2 = applyPassiveElementalGrants(dElemRes2Base, dPassiveGrants2);
                      return calculateDamage(
                        { stats: aStats2, elementalResistance: aChar2.elementalResistance, elementalDamage: aElemDmg2, buffs: buffsMap[activeCharId] ?? [], currentHp: currentHpMap[activeCharId] ?? aChar2.stats.hp, stolenEnergyCount: stolenEnergyByChar[activeCharId] ?? 0, col: getCharCol(activeCharId) },
                        { stats: dStats2, elementalResistance: dElemRes2 as typeof targetChar.elementalResistance, elementalDamage: targetChar.elementalDamage, buffs: buffsMap[tid] ?? [], currentHp: currentHpMap[tid] ?? targetChar.stats.hp, col: getCharCol(tid) },
                        selSkill.levels[0]
                      );
                    };

                    // Compute damage preview for selected template action
                    const actionPreview: DamageResult | null = !isAoeSkillCheck && previewTarget ? computeForTarget(previewTarget) : null;
                    // Compute per-target previews for AOE
                    const aoePreviews: { tid: string; name: string; result: DamageResult | null }[] = isAoeSkillCheck
                      ? validTargets.map((t) => ({ tid: t.charId, name: getCharacter(t.charId)?.name ?? "Unknown", result: computeForTarget(t.charId) }))
                      : [];

                    return (
                      <div className="bg-gray-800/50 border border-gray-700 rounded p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-blue-400 font-medium">{tmpl.name}</span>
                          <button onClick={() => { setExpandedTemplateSkillId(null); setSelectedTemplateActionId(null); }} className="text-[10px] text-gray-500 hover:text-gray-300">×</button>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {resolvedActions.map(({ action, skill }) => {
                            const spellCost = skill!.levels[0].cost;
                            const canAffordSpell = canAffordSkill(skill!.id);
                            return (
                              <div key={action.id} className={`border rounded overflow-hidden transition-colors ${
                                selectedTemplateActionId === action.id ? "bg-gray-800 border-blue-500 ring-1 ring-blue-500/30"
                                : canAffordSpell ? "bg-gray-800 border-gray-700"
                                : "bg-gray-900/50 border-gray-800 opacity-40"
                              }`}>
                                <button
                                  onClick={() => setSelectedTemplateActionId(selectedTemplateActionId === action.id ? null : action.id)}
                                  className="w-full px-2 py-1 text-left hover:bg-gray-700 transition-colors"
                                >
                                  <div className={`text-[11px] font-medium ${canAffordSpell ? "text-white" : "text-gray-500"}`}>{skill!.name}</div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {spellCost.length > 0 && <EnergyCostDisplay cost={spellCost} />}
                                    {skill!.levels[0].damageCategory && (
                                      <span className="text-[8px] text-gray-500">
                                        {DAMAGE_TIER_LABELS[(skill!.levels[0].damageTier ?? "moderate") as DamageTier]} {DAMAGE_CATEGORY_LABELS[skill!.levels[0].damageCategory]}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Selected action detail + damage preview */}
                        {selSkill && (() => {
                          const selLevel = selSkill.levels[0];
                          const hasDamage = !!selLevel.damageCategory;
                          const hasEffects = (selLevel.effects ?? []).length > 0;
                          const hasDispels = (selLevel.dispels ?? []).length > 0;
                          const needsTarget = (selLevel.targetType && selLevel.targetType !== "no-target" && selLevel.targetType !== "self");
                          return (
                          <div className="bg-gray-900/50 rounded p-2 space-y-2">
                            <div className="text-xs text-white font-medium">{selSkill.name}</div>
                            {selSkill.description && <p className="text-[10px] text-gray-400"><GlossaryText text={selSkill.description} /></p>}
                            {selLevel.targetType && <span className="text-[9px] text-gray-500">{TARGET_TYPE_LABELS[selLevel.targetType]}</span>}

                            {/* Non-damage Apply and Use (for Dispel, etc.) */}
                            {!hasDamage && (hasEffects || hasDispels) && (
                              <div className="border-t border-gray-800 pt-2 space-y-1">
                                {needsTarget && (
                                  <select
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none"
                                    value={previewTarget}
                                    onChange={(e) => setTemplatePreviewTargetId(e.target.value)}
                                  >
                                    {validTargets.length === 0 && <option value="">No valid targets</option>}
                                    {validTargets.map((t) => {
                                      const c = getCharacter(t.charId);
                                      return <option key={t.charId} value={t.charId}>{c?.name ?? "Unknown"} {t.charId === activeCharId ? "(self)" : `(${t.side === attackerSideLocal ? "ally" : "enemy"})`}</option>;
                                    })}
                                  </select>
                                )}
                                {hasDispels && (
                                  <div className="space-y-0.5">
                                    {selLevel.dispels!.map((d, di) => (
                                      <div key={di} className="text-[10px] text-cyan-400">
                                        Remove {d.count === -1 ? "all" : d.count} {d.category === "buff" ? "positive effect" : d.category === "debuff" ? "negative effect" : "effect"}{d.count !== 1 ? "s" : ""} from {TARGET_TYPE_LABELS[d.targetType]}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <button
                                  onClick={() => {
                                    if (needsTarget && !previewTarget) return;
                                    // Build targetEntries from the preview target (no damage, empty amount)
                                    const entries = needsTarget && previewTarget
                                      ? [{ targetId: previewTarget, newHp: currentHpMap[previewTarget] ?? (getCharacter(previewTarget)?.stats.hp ?? 100), amount: 0, isHealing: false }]
                                      : [];
                                    // Apply via the same flow as Apply and Use
                                    setSelectedSkill(null);
                                    // Route through the SkillModal onApplyAndUse path — but we don't have a modal open, so do it manually
                                    // Use energy for the spell (not the parent template)
                                    if (selSkill) useSkillEnergy(selSkill.id);
                                    // Process dispels
                                    if (hasDispels && activeCharId) {
                                      const enemyTT = new Set(["target-enemy", "front-row-enemy", "random-enemy", "aoe-enemy", "self-row-enemy"]);
                                      const allyTT = new Set(["target-ally", "target-ally-or-self", "random-ally", "adjacent-ally", "aoe-team"]);
                                      for (const d of selLevel.dispels!) {
                                        let dTargetIds: string[];
                                        if (d.targetType === "self") dTargetIds = [activeCharId];
                                        else if (entries.length > 0 && ((enemyTT.has(d.targetType) && enemyTT.has(selLevel.targetType ?? "")) || (allyTT.has(d.targetType) && allyTT.has(selLevel.targetType ?? "")))) {
                                          dTargetIds = entries.map((e) => e.targetId);
                                        } else {
                                          const dr = resolveTargets(d.targetType, activeCharId, teams, getCharacter, currentHpMapRef.current);
                                          dTargetIds = dr.targets.map((t) => t.characterId);
                                        }
                                        for (const tid of dTargetIds) {
                                          const ex = buffsMap[tid] ?? [];
                                          const dispellable = ex.filter((b) => {
                                            const se = statusEffects.find((s) => s.id === b.effectId);
                                            if (se?.dispellable === false) return false;
                                            const polarity = b.category === "buff" ? "positive" : b.category === "debuff" ? "negative" : se?.polarity;
                                            if (d.category === "any") return true;
                                            if (d.category === "buff") return polarity === "positive";
                                            if (d.category === "debuff") return polarity === "negative";
                                            return false;
                                          });
                                          if (dispellable.length === 0) continue;
                                          const toRemove = d.count === -1 ? dispellable : [...dispellable].sort(() => Math.random() - 0.5).slice(0, d.count);
                                          const toRemoveIds = new Set(toRemove.map((b) => b.id));
                                          const tName = getCharacter(tid)?.name ?? "Unknown";
                                          addBattleLog(`${tName} loses ${toRemove.length} effect${toRemove.length > 1 ? "s" : ""}: ${toRemove.map((b) => b.effectName).join(", ")}.`);
                                          setBuffsMap((prev) => ({
                                            ...prev,
                                            [tid]: (prev[tid] ?? []).filter((b) => !toRemoveIds.has(b.id)),
                                          }));
                                        }
                                      }
                                    }
                                    // Process effects (buff/debuff applications)
                                    if (hasEffects && activeCharId) {
                                      const enemyTT2 = new Set(["target-enemy", "front-row-enemy", "random-enemy", "aoe-enemy", "self-row-enemy"]);
                                      const allyTT2 = new Set(["target-ally", "target-ally-or-self", "random-ally", "adjacent-ally", "aoe-team"]);
                                      const globalTid = round * 100 + currentTurnIndex;
                                      for (const eff of selLevel.effects!) {
                                        const se = statusEffects.find((s) => s.id === eff.effectId);
                                        if (!se) continue;
                                        // Only on-use effects apply here (others handled by passives)
                                        const trig = eff.trigger ?? "on-use";
                                        if (trig !== "on-use" && trig !== "on-attack-hit") continue;
                                        let effTargetIds: string[];
                                        if (eff.targetType === "self") effTargetIds = [activeCharId];
                                        else if (entries.length > 0 && ((enemyTT2.has(eff.targetType) && enemyTT2.has(selLevel.targetType ?? "")) || (allyTT2.has(eff.targetType) && allyTT2.has(selLevel.targetType ?? "")))) {
                                          effTargetIds = entries.map((e) => e.targetId);
                                        } else {
                                          const er = resolveTargets(eff.targetType, activeCharId, teams, getCharacter, currentHpMapRef.current);
                                          effTargetIds = er.targets.map((t) => t.characterId);
                                        }
                                        const buff: Omit<BuffDebuff, "id"> = {
                                          effectId: se.id,
                                          effectName: se.name,
                                          category: se.category,
                                          stats: se.stats,
                                          modifier: !se.stats.includes("none") ? eff.modifier : 0,
                                          duration: eff.duration,
                                          source: selSkill!.name,
                                          sourceCharId: activeCharId,
                                          appliedTurn: globalTid,
                                          ...(se.tags ? { tags: se.tags } : {}),
                                          ...(se.stackable ? { stackable: true, maxStacks: se.maxStacks, stacks: 1, ...(se.onMaxStacks ? { onMaxStacks: se.onMaxStacks } : {}) } : {}),
                                        };
                                        for (const tid of effTargetIds) {
                                          // Roll chance per target
                                          if (eff.chance !== undefined && eff.chance < 100) {
                                            const roll = Math.random() * 100;
                                            if (roll >= eff.chance) {
                                              addBattleLog(`${aChar.name}'s ${se.name} missed ${getCharacter(tid)?.name ?? "Unknown"}!`);
                                              continue;
                                            }
                                          }
                                          const tName = getCharacter(tid)?.name ?? "Unknown";
                                          const modText = !se.stats.includes("none") ? ` (${eff.modifier > 0 ? "+" : ""}${eff.modifier}%)` : "";
                                          addBattleLog(`${se.name}${modText} applied to ${tName}${eff.duration === -1 ? "" : ` for ${eff.duration} turns`}.`);
                                          setBuffsMap((prev) => {
                                            let existing = prev[tid] ?? [];
                                            if (se.formId) {
                                              existing = existing.filter((b) => {
                                                const bSe = statusEffects.find((s) => s.id === b.effectId);
                                                return !bSe?.formId || bSe.id === se.id;
                                              });
                                            }
                                            const { buffs: updated } = applyBuffStacking(existing, buff);
                                            return { ...prev, [tid]: updated };
                                          });
                                        }
                                      }
                                    }
                                    addBattleLog(`Round ${round}. ${aChar.name} uses ${selSkill!.name}.`);
                                    // Auto-advance turn
                                    if (expSkill.levels[expLevel]?.instant) {
                                      const cid = activeCharId!;
                                      const sid = expandedTemplateSkillId!;
                                      setInstantUsedMap((prev) => {
                                        const cur = prev[cid] ?? [];
                                        if (cur.includes(sid)) return prev;
                                        return { ...prev, [cid]: [...cur, sid] };
                                      });
                                    } else {
                                      if (isLastTurn) { endRound(); } else { nextTurn(); }
                                    }
                                  }}
                                  disabled={!canAffordSkill(selSkill!.id) || (needsTarget && !previewTarget)}
                                  className={`w-full mt-1 text-[10px] px-2 py-1 rounded text-white font-medium ${!canAffordSkill(selSkill!.id) ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500"}`}
                                >
                                  {!canAffordSkill(selSkill!.id) ? "Not Enough Energy" : "Apply and Use"}
                                </button>
                              </div>
                            )}

                            {hasDamage && (() => {
                              const isAoeSkill = targetType === "aoe-enemy" || targetType === "aoe-team" || targetType === "self-row-enemy";
                              return (
                              <div className="border-t border-gray-800 pt-2 space-y-1">
                                <span className="text-[9px] text-gray-500 uppercase">{isAoeSkill ? "AOE Preview" : "Damage Preview"}</span>
                                {!isAoeSkill && (
                                  <select
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none"
                                    value={previewTarget}
                                    onChange={(e) => setTemplatePreviewTargetId(e.target.value)}
                                  >
                                    {validTargets.length === 0 && <option value="">No valid targets</option>}
                                    {validTargets.map((t) => {
                                      const c = getCharacter(t.charId);
                                      return <option key={t.charId} value={t.charId}>{c?.name ?? "Unknown"} {t.charId === activeCharId ? "(self)" : `(${t.side === attackerSideLocal ? "ally" : "enemy"})`}</option>;
                                    })}
                                  </select>
                                )}
                                {isAoeSkill && aoePreviews.length > 0 && (() => {
                                  const totalAmount = aoePreviews.reduce((sum, p) => sum + (p.result?.finalDamage ?? 0), 0);
                                  const aoeIsHealing = aoePreviews[0]?.result?.isHealing ?? false;
                                  return (
                                    <div className="space-y-0.5">
                                      {aoePreviews.map((p) => (
                                        <div key={p.tid} className="flex items-center justify-between text-[10px] bg-gray-900/50 rounded px-1.5 py-0.5">
                                          <span className="text-gray-300 truncate">{p.name}</span>
                                          {p.result && (
                                            <span className={`font-bold ${p.result.isHealing ? "text-green-400" : "text-red-400"}`}>
                                              {p.result.isHealing ? "+" : "-"}{p.result.finalDamage}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                      {aoePreviews.length > 1 && (
                                        <div className="flex items-center justify-between px-1.5 pt-0.5 border-t border-gray-700/50">
                                          <span className="text-[10px] text-gray-500 font-medium">Total</span>
                                          <span className={`text-sm font-bold ${aoeIsHealing ? "text-green-400" : "text-red-400"}`}>
                                            {aoeIsHealing ? "+" : "-"}{totalAmount}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                {!isAoeSkill && actionPreview && (
                                  <div className="mt-1">
                                    <span className={`text-lg font-bold ${actionPreview.isHealing ? "text-green-400" : "text-red-400"}`}>
                                      {actionPreview.isHealing ? "+" : "-"}{actionPreview.finalDamage}
                                    </span>
                                    <div className="space-y-0.5 mt-1">
                                      {actionPreview.breakdown.map((line, i) => (
                                        <p key={i} className="text-[9px] text-gray-500">{line}</p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <button
                                  onClick={() => {
                                    if (!activeCharId || !selSkill) return;
                                    // Resolve targets
                                    const targetIds = isAoeSkill ? validTargets.map((t) => t.charId) : (previewTarget ? [previewTarget] : []);
                                    if (targetIds.length === 0) return;
                                    const attacker = getCharacter(activeCharId);
                                    if (!attacker) return;
                                    const aFormId3 = battleFormMap[activeCharId] ?? null;
                                    const aForm3 = aFormId3 ? getFormsForCharacter(activeCharId).find((f) => f.id === aFormId3) : null;
                                    const aStats3 = applyCharLevelStats(aForm3?.statOverrides ? { ...attacker.stats, ...aForm3.statOverrides } : attacker.stats, characterLevelMap[attacker.id] ?? 0);
                                    const aElemDmg3 = aForm3?.elementalDmgOverride ? { ...attacker.elementalDamage, ...aForm3.elementalDmgOverride } : attacker.elementalDamage;
                                    const attackerCombat3 = { stats: aStats3, elementalResistance: attacker.elementalResistance, elementalDamage: aElemDmg3, buffs: buffsMap[activeCharId] ?? [], currentHp: currentHpMap[activeCharId] ?? attacker.stats.hp, stolenEnergyCount: stolenEnergyByChar[activeCharId] ?? 0, col: getCharCol(activeCharId) };
                                    // Apply to each target with fresh calculation
                                    const resultPerTarget: { tid: string; amount: number; isHealing: boolean; newHp: number }[] = [];
                                    for (const tid of targetIds) {
                                      const targetChar = getCharacter(tid);
                                      if (!targetChar) continue;
                                      const dFormId3 = battleFormMap[tid] ?? null;
                                      const dForm3 = dFormId3 ? getFormsForCharacter(tid).find((f) => f.id === dFormId3) : null;
                                      const dStats3 = applyCharLevelStats(dForm3?.statOverrides ? { ...targetChar.stats, ...dForm3.statOverrides } : targetChar.stats, characterLevelMap[targetChar.id] ?? 0);
                                      const dElemRes3Base = dForm3?.elementalResOverride ? { ...targetChar.elementalResistance, ...dForm3.elementalResOverride } : targetChar.elementalResistance;
                                      const dPassiveGrants3 = getPassiveResistanceGrants(targetChar, dFormId3, skills, characterSkills.filter((cs) => cs.characterId === tid), skillLevelMap);
                                      const dElemRes3 = applyPassiveElementalGrants(dElemRes3Base, dPassiveGrants3);
                                      const result = calculateDamage(attackerCombat3, { stats: dStats3, elementalResistance: dElemRes3 as typeof targetChar.elementalResistance, elementalDamage: targetChar.elementalDamage, buffs: buffsMap[tid] ?? [], currentHp: currentHpMap[tid] ?? targetChar.stats.hp, col: getCharCol(tid) }, selSkill!.levels[0]);
                                      const maxHp = targetChar.stats.hp;
                                      const cur = currentHpMap[tid] ?? maxHp;
                                      const newHp = result.isHealing ? Math.min(maxHp, cur + result.finalDamage) : Math.max(0, cur - result.finalDamage);
                                      resultPerTarget.push({ tid, amount: result.finalDamage, isHealing: result.isHealing, newHp });
                                    }
                                    // Apply HP changes
                                    setCurrentHpMap((prev) => {
                                      const next = { ...prev };
                                      for (const r of resultPerTarget) next[r.tid] = r.newHp;
                                      return next;
                                    });
                                    for (const r of resultPerTarget) {
                                      if (r.amount > 0) spawnDamageFloat(r.tid, r.amount, r.isHealing);
                                    }
                                    // Use energy for the spell (not the parent template)
                                    if (selSkill) useSkillEnergy(selSkill.id);
                                    // Log
                                    if (resultPerTarget.length === 1) {
                                      const r = resultPerTarget[0];
                                      const tName = getCharacter(r.tid)?.name ?? "Unknown";
                                      const dmgText = r.isHealing ? `healing ${tName} for ${r.amount} HP` : `dealing ${r.amount} ${selSkill!.levels[0].damageCategory ?? "physical"} damage`;
                                      addBattleLog(`Round ${round}. ${aChar.name} uses ${selSkill!.name} on ${tName} ${dmgText}.`);
                                    } else {
                                      const totalDmg = resultPerTarget.reduce((s, r) => s + r.amount, 0);
                                      const isHealing = resultPerTarget[0]?.isHealing ?? false;
                                      const dmgText = isHealing ? `healing ${resultPerTarget.length} targets for ${totalDmg} total HP` : `dealing ${totalDmg} total damage to ${resultPerTarget.length} targets`;
                                      addBattleLog(`Round ${round}. ${aChar.name} uses ${selSkill!.name} ${dmgText}.`);
                                    }
                                    // Auto-advance turn
                                    if (expSkill.levels[expLevel]?.instant) {
                                      const cid = activeCharId!;
                                      const sid = expandedTemplateSkillId!;
                                      setInstantUsedMap((prev) => {
                                        const cur = prev[cid] ?? [];
                                        if (cur.includes(sid)) return prev;
                                        return { ...prev, [cid]: [...cur, sid] };
                                      });
                                    } else {
                                      if (isLastTurn) { endRound(); } else { nextTurn(); }
                                    }
                                  }}
                                  disabled={!canAffordSkill(selSkill!.id) || (!isAoeSkill && !previewTarget)}
                                  className={`w-full mt-1 text-[10px] px-2 py-1 rounded text-white font-medium ${!canAffordSkill(selSkill!.id) ? "bg-gray-700 text-gray-500 cursor-not-allowed" : actionPreview?.isHealing ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
                                >
                                  {!canAffordSkill(selSkill!.id) ? "Not Enough Energy" : "Apply and Use"}
                                </button>
                              </div>
                              );
                            })()}
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>

          {/* Column 3: Selected character details — height synced to column 2, scrolls internally */}
          <div
            className="shrink-0 w-[420px] overflow-y-auto scrollbar-thin"
            style={middleColHeight ? { height: middleColHeight } : undefined}
          >
            {viewedCharId ? (
              <BattleDetailsPanel
                characterId={viewedCharId}
                tab={detailsTab}
                onTabChange={setDetailsTab}
                getCharacter={getCharacter}
                getSkill={getSkill}
                skills={skills}
                characterSkills={characterSkills}
                currentHpMap={currentHpMap}
                charForms={getFormsForCharacter(viewedCharId)}
                activeFormId={battleFormMap[viewedCharId] ?? null}
                buffs={buffsMap[viewedCharId] ?? []}
                skillLevelMap={skillLevelMap}
                characterLevelMap={characterLevelMap}
                onSetFormId={(fid) => setBattleFormMap((prev) => ({ ...prev, [viewedCharId]: fid }))}
                canAffordSkill={canAffordSkill}
                onSelectSkill={setSelectedSkill}
                onSetHp={(charId, hp) =>
                  setCurrentHpMap((prev) => ({ ...prev, [charId]: hp }))
                }
                onAddBuff={(charId, buff) => {
                  setBuffsMap((prev) => {
                    const existing = prev[charId] ?? [];
                    const { buffs: updated, triggered } = applyBuffStacking(existing, { ...buff, appliedTurn: globalTurnId });
                    if (triggered) {
                      // onMaxStacks triggered — look up the StatusEffect to grant
                      const grantEffect = statusEffects.find((se) => se.id === triggered);
                      if (grantEffect) {
                        const grantBuff: BuffDebuff = {
                          id: crypto.randomUUID(),
                          effectId: grantEffect.id,
                          effectName: grantEffect.name,
                          category: grantEffect.category,
                          stats: grantEffect.stats,
                          modifier: grantEffect.defaultModifier ?? 0,
                          duration: 1,
                          source: grantEffect.name,
                          appliedTurn: globalTurnId,
                          ...(grantEffect.tags ? { tags: grantEffect.tags } : {}),
                        };
                        addBattleLog(`${getCharacter(charId)?.name ?? "Unknown"} reaches max stacks! ${grantEffect.name} activated!`);
                        return { ...prev, [charId]: [...updated, grantBuff] };
                      }
                    }
                    return { ...prev, [charId]: updated };
                  });
                }}
                onRemoveBuff={(charId, buffId) => {
                  setBuffsMap((prev) => ({
                    ...prev,
                    [charId]: (prev[charId] ?? []).filter((b) => b.id !== buffId),
                  }));
                }}
                onClose={() => setViewedCharId(null)}
              />
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-xs text-gray-600">
                Click a character on the battlefield to view their details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Battle Stats Panel */}
      {phase === "battle" && Object.keys(battleStats).length > 0 && (() => {
        const allChars = teams.flatMap((t) => t.placements.map((p) => ({ charId: p.characterId, side: t.side, name: getCharacter(p.characterId)?.name ?? "?" })));
        return (
          <details className="mt-2">
            <summary className="text-[10px] text-gray-500 uppercase font-medium cursor-pointer hover:text-gray-300 select-none">Battle Stats</summary>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="text-gray-500 uppercase">
                    <th className="text-left px-2 py-1 border-b border-gray-800">Character</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">Total Dmg</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">Direct</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">AOE</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">Indirect</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">True</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">Healing</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">Taken</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">Energy</th>
                    <th className="text-right px-2 py-1 border-b border-gray-800">Skills</th>
                  </tr>
                </thead>
                <tbody>
                  {allChars.map(({ charId, side, name }) => {
                    const s = battleStats[charId] ?? { ...emptyStats };
                    const isDead = (currentHpMap[charId] ?? 1) <= 0;
                    return (
                      <tr key={charId} className={`${isDead ? "text-gray-600" : side === "left" ? "text-blue-300" : "text-red-300"} border-b border-gray-800/50`}>
                        <td className="px-2 py-1 text-left font-medium">{name}</td>
                        <td className="px-2 py-1 text-right tabular-nums font-bold">{s.damageDone || "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-orange-300">{s.directDmg || "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-sky-300">{s.aoeDmg || "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-gray-400">{s.indirectDmg || "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-purple-300">{s.trueDmg || "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-green-400">{s.healingDone || "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-red-400">{s.damageTaken || "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-yellow-400">{s.energySpent || "-"}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{s.skillsUsed || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })()}

      {/* Convert Energy to Rainbow Modal */}
      {convertEnergyModal && (() => {
        const { side, color } = convertEnergyModal;
        const sideEnergy = teamEnergy[side] ?? {};
        const colorAmount = sideEnergy[color] ?? 0;
        const rainbowAmount = sideEnergy.rainbow ?? 0;
        const rainbowSpace = 5 - rainbowAmount;
        const maxConversions = Math.min(Math.floor(colorAmount / 2), rainbowSpace);
        const handleConvert = (count: number) => {
          if (count <= 0) return;
          setTeamEnergy((prev) => ({
            ...prev,
            [side]: {
              ...(prev[side] ?? {}),
              [color]: ((prev[side]?.[color]) ?? 0) - count * 2,
              rainbow: ((prev[side]?.rainbow) ?? 0) + count,
            },
          }));
          addBattleLog(`Converted ${count * 2} ${color} energy → ${count} rainbow energy.`);
          setConvertEnergyModal(null);
        };
        return (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setConvertEnergyModal(null)}>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-2">Convert Energy</h3>
              <div className="flex items-center gap-2 mb-3 text-sm">
                <EnergyBadge color={color} size="md" />
                <span className="text-gray-300 font-medium capitalize">{color}</span>
                <span className="text-gray-500">— you have {colorAmount}</span>
              </div>
              <div className="flex items-center gap-2 mb-4 text-sm">
                <span className="text-gray-400">Rainbow:</span>
                <span className="text-pink-300 font-bold">🌈 {rainbowAmount}/5</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">2 {color} → 1 rainbow energy</p>
              {maxConversions === 0 ? (
                <p className="text-xs text-red-400 mb-3">
                  {colorAmount < 2 ? `Need at least 2 ${color} energy.` : "Rainbow pool is full (5/5)."}
                </p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {Array.from({ length: maxConversions }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => handleConvert(n)}
                      className="w-full text-left px-3 py-2 rounded bg-gradient-to-r from-purple-600/30 via-pink-600/30 to-yellow-600/30 hover:from-purple-600/50 hover:via-pink-600/50 hover:to-yellow-600/50 border border-pink-400/40 text-sm text-white transition-colors"
                    >
                      Convert {n * 2} {color} → {n} 🌈
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setConvertEnergyModal(null)}
                className="w-full text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* End-of-Round Phase Modal: character leveling (rainbow) + skill leveling (SP) */}
      {endOfRoundPhaseOpen && (
        <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">End of Round {round}</h2>
                <p className="text-[11px] text-gray-500">Spend rainbow energy to level characters. Spend skill points to upgrade abilities. Click a color energy to convert (2 → 1 rainbow).</p>
              </div>
              <button
                onClick={beginNextRound}
                className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-semibold"
              >
                Begin Next Round →
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4">
              {teams.map((team) => {
                const sideRainbow = teamEnergy[team.side]?.rainbow ?? 0;
                return (
                  <div key={team.id} className="border border-gray-800 rounded-lg">
                    <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between bg-gray-950/50">
                      <div className="text-sm font-semibold text-white">{team.name}</div>
                      <div className="flex items-center gap-1.5">
                        {ENERGY_COLORS.map((color) => {
                          const amt = teamEnergy[team.side]?.[color] ?? 0;
                          if (amt <= 0) return null;
                          const canConvert = amt >= 2 && sideRainbow < 5;
                          return (
                            <button
                              key={color}
                              onClick={() => canConvert && setConvertEnergyModal({ side: team.side, color })}
                              disabled={!canConvert}
                              title={canConvert ? `Convert ${color} to rainbow (2:1)` : undefined}
                              className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-xs transition-colors ${
                                canConvert ? "hover:bg-gray-700 cursor-pointer" : "cursor-default"
                              }`}
                            >
                              <EnergyBadge color={color} size="md" />
                              <span className="text-gray-300 font-bold">{amt}</span>
                            </button>
                          );
                        })}
                        <span className="flex items-center gap-0.5 ml-1 px-1 py-0.5 rounded bg-gradient-to-r from-purple-600/30 via-pink-600/30 to-yellow-600/30 border border-pink-400/40">
                          <span className="text-xs">🌈</span>
                          <span className="text-xs text-pink-200 font-bold">{sideRainbow}/5</span>
                        </span>
                      </div>
                    </div>
                    <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {team.placements.map((p) => {
                        const char = getCharacter(p.characterId);
                        if (!char) return null;
                        const isDead = defeatedCharIds.has(p.characterId);
                        const charLv = characterLevelMap[p.characterId] ?? 0;
                        const sp = skillPointsMap[p.characterId] ?? 0;
                        const charCost = characterUpgradeCost(charLv);
                        const canBuyCharLv = !isDead && charCost !== null && sideRainbow >= charCost;
                        // Equipped ability skills (only ability skills are levelable)
                        const charAssigns = characterSkills.filter((cs) => cs.characterId === p.characterId);
                        const equippedAbilityIds = char.equippedLoadout.abilityIds;
                        const levelableSkills = equippedAbilityIds
                          .map((sid) => skills.find((s) => s.id === sid))
                          .filter((s): s is Skill => !!s && s.skillType === "ability" && s.leveled !== false);
                        return (
                          <div
                            key={p.characterId}
                            className={`border rounded-lg p-3 ${isDead ? "border-red-900/50 bg-red-950/10 opacity-60" : "border-gray-800 bg-gray-950/40"}`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {char.photoUrl ? (
                                <img src={char.photoUrl} alt={char.name} className="w-10 h-10 rounded object-cover border border-gray-700" />
                              ) : (
                                <div className="w-10 h-10 rounded bg-gray-800 border border-gray-700" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-white truncate">{char.name}</div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                  <span>Lv {charLv}/3</span>
                                  <div className="flex items-center gap-0.5">
                                    {[1, 2, 3].map((lv) => (
                                      <div
                                        key={lv}
                                        className={`w-1.5 h-1.5 rounded-full ${lv <= charLv ? "bg-pink-400" : "bg-gray-700"}`}
                                      />
                                    ))}
                                  </div>
                                  {isDead && <span className="text-red-400 font-semibold">DEFEATED</span>}
                                </div>
                              </div>
                            </div>

                            {/* Character level upgrade */}
                            <div className="mb-2">
                              {charCost === null ? (
                                <div className="text-[10px] text-gray-500 text-center py-1">Character level maxed</div>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (!canBuyCharLv) return;
                                    setCharacterLevelMap((prev) => ({ ...prev, [p.characterId]: charLv + 1 }));
                                    setTeamEnergy((prev) => ({
                                      ...prev,
                                      [team.side]: {
                                        ...(prev[team.side] ?? {}),
                                        rainbow: (prev[team.side]?.rainbow ?? 0) - charCost,
                                      },
                                    }));
                                    addBattleLog(`${char.name} leveled up to Lv ${charLv + 1} (+${(charLv + 1) * 10}% base stats).`);
                                  }}
                                  disabled={!canBuyCharLv}
                                  className={`w-full text-[11px] py-1 rounded font-semibold transition-colors ${
                                    canBuyCharLv
                                      ? "bg-pink-700/40 hover:bg-pink-600/60 text-pink-100 border border-pink-500/40"
                                      : "bg-gray-800 text-gray-600 border border-gray-800 cursor-not-allowed"
                                  }`}
                                >
                                  Level Up → Lv {charLv + 1} (🌈 {charCost})
                                </button>
                              )}
                            </div>

                            {/* Skill Points balance */}
                            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1 px-1">
                              <span>Skill Points</span>
                              <span className="text-blue-300 font-bold">{sp} SP</span>
                            </div>

                            {/* Levelable skill list */}
                            <div className="space-y-1">
                              {levelableSkills.length === 0 && (
                                <div className="text-[10px] text-gray-600 italic text-center py-1">No levelable skills equipped</div>
                              )}
                              {levelableSkills.map((skill) => {
                                const skillAssign = charAssigns.find((cs) => cs.skillId === skill.id);
                                // Variant-group skills share level — read max from any sibling
                                const groupLevel = skillAssign?.variantGroupId
                                  ? Math.max(1, ...charAssigns.filter((cs) => cs.variantGroupId === skillAssign.variantGroupId).map((cs) => skillLevelMap[cs.skillId] ?? 1))
                                  : skillLevelMap[skill.id] ?? 1;
                                const upgradeCost = skillUpgradeCost(groupLevel);
                                const canBuy = !isDead && upgradeCost !== null && sp >= upgradeCost;
                                return (
                                  <div key={skill.id} className="flex items-center gap-2 bg-gray-900/60 hover:bg-gray-900 border border-gray-800 hover:border-gray-700 rounded px-2 py-1 transition-colors">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedSkill(skill)}
                                      className="flex-1 min-w-0 text-left"
                                      title="View skill details"
                                    >
                                      <div className="text-[11px] text-white font-medium truncate hover:text-blue-200">{skill.name}</div>
                                      <div className="flex items-center gap-0.5 mt-0.5">
                                        {[1, 2, 3].map((lv) => (
                                          <div
                                            key={lv}
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              lv <= groupLevel
                                                ? groupLevel === 3 ? "bg-yellow-400" : "bg-blue-400"
                                                : "bg-gray-700"
                                            }`}
                                          />
                                        ))}
                                      </div>
                                    </button>
                                    {upgradeCost === null ? (
                                      <span className="text-[9px] text-yellow-400 font-semibold">MAX</span>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          if (!canBuy) return;
                                          setSkillLevelMap((prev) => {
                                            const next = { ...prev, [skill.id]: groupLevel + 1 };
                                            // Sync variant group siblings
                                            if (skillAssign?.variantGroupId) {
                                              for (const cs of charAssigns) {
                                                if (cs.variantGroupId === skillAssign.variantGroupId && cs.skillId !== skill.id) {
                                                  next[cs.skillId] = groupLevel + 1;
                                                }
                                              }
                                            }
                                            return next;
                                          });
                                          setSkillPointsMap((prev) => ({ ...prev, [p.characterId]: (prev[p.characterId] ?? 0) - upgradeCost }));
                                          addBattleLog(`${char.name}'s ${skill.name} upgraded to Lv ${groupLevel + 1}.`);
                                        }}
                                        disabled={!canBuy}
                                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                          canBuy
                                            ? "bg-blue-600/40 hover:bg-blue-500/60 text-blue-100 border border-blue-500/40"
                                            : "bg-gray-800 text-gray-600 border border-gray-800 cursor-not-allowed"
                                        }`}
                                      >
                                        ↑ {upgradeCost} SP
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Energy Choose Modal */}
      {energyChooseRequest && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-bold text-white mb-2">
              {energyChooseRequest.kind === "steal" ? "Choose energy to steal" : "Choose energy to generate"}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              {energyChooseRequest.kind === "steal"
                ? `Pick ${energyChooseRequest.count} ${energyChooseRequest.count > 1 ? "energies" : "energy"} to steal from the enemy.`
                : `Pick ${energyChooseRequest.count} ${energyChooseRequest.count > 1 ? "energies" : "energy"} to generate for your team.`}
            </p>
            {(() => {
              const req = energyChooseRequest;
              const sourceSide = req.kind === "steal" ? req.sourceSide : null;
              const sourcePool = sourceSide ? (teamEnergy[sourceSide] ?? {}) : null;
              return (
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {ENERGY_COLORS.map((color) => {
                    const available = sourcePool ? (sourcePool[color] ?? 0) : Infinity;
                    const disabled = req.kind === "steal" && available <= 0;
                    return (
                      <button
                        key={color}
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          if (req.kind === "steal") {
                            setTeamEnergy((prev) => ({
                              ...prev,
                              [req.sourceSide]: { ...(prev[req.sourceSide] ?? {}), [color]: ((prev[req.sourceSide]?.[color]) ?? 0) - 1 },
                              [req.destSide]: { ...(prev[req.destSide] ?? {}), [color]: ((prev[req.destSide]?.[color]) ?? 0) + 1 },
                            }));
                            addBattleLog(`${req.attackerName} steals 1 ${color} energy.`);
                            // Increment the caster's stolen energy counter (use stored casterId, not activeCharId which may have advanced)
                            if (req.casterId) {
                              setStolenEnergyByChar((prev) => ({ ...prev, [req.casterId]: (prev[req.casterId] ?? 0) + 1 }));
                            }
                          } else {
                            setTeamEnergy((prev) => ({
                              ...prev,
                              [req.destSide]: { ...(prev[req.destSide] ?? {}), [color]: ((prev[req.destSide]?.[color]) ?? 0) + 1 },
                            }));
                            addBattleLog(`${req.attackerName} generates 1 ${color} energy.`);
                          }
                          if (req.count <= 1) {
                            setEnergyChooseRequest(null);
                          } else {
                            setEnergyChooseRequest({ ...req, count: req.count - 1 } as typeof req);
                          }
                        }}
                        className={`flex flex-col items-center gap-1 p-2 rounded border transition-colors ${
                          disabled
                            ? "bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed"
                            : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-white"
                        }`}
                      >
                        <EnergyBadge color={color} size="md" />
                        <span className="text-[10px]">{color}</span>
                        {sourcePool && <span className="text-[10px] text-gray-500">({available})</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">{energyChooseRequest.count} remaining</span>
              <button
                onClick={() => setEnergyChooseRequest(null)}
                className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skill Modal */}
      {selectedSkill && (
        <SkillModal
          skill={selectedSkill}
          allSkills={skills}
          forms={forms}
          templates={templates}
          templateActions={templateActions}
          attackerChar={phase === "battle" && activeCharId ? getCharacter(activeCharId) : undefined}
          teams={phase === "battle" ? teams : undefined}
          getCharacterFn={getCharacter}
          buffsMap={phase === "battle" ? buffsMap : undefined}
          battleFormMap={phase === "battle" ? battleFormMap : undefined}
          getFormsForCharacter={getFormsForCharacter}
          currentHpMap={phase === "battle" ? currentHpMap : undefined}
          skillLevelMap={phase === "battle" ? skillLevelMap : undefined}
          characterLevelMap={phase === "battle" ? characterLevelMap : undefined}
          levelingMode={endOfRoundPhaseOpen}
          onClose={() => setSelectedSkill(null)}
          onViewSkill={setSelectedSkill}
          canAfford={phase === "battle" ? canAffordSkill(selectedSkill.id) : undefined}
          stolenEnergyByChar={phase === "battle" ? stolenEnergyByChar : undefined}
          teamEnergy={phase === "battle" ? teamEnergy : undefined}
          attackerSide={phase === "battle" && activeCharId ? (teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side) : undefined}
          onApplyDamage={phase === "battle" ? (targetId, newHp) => {
            setCurrentHpMap((prev) => ({ ...prev, [targetId]: newHp }));
          } : undefined}
          onApplyAndUse={phase === "battle" ? (rawTargetEntries, skillUsed, opts) => {
            if (roundEnding) return; // input locked while round transition is in flight
            let pendingTeleport = false;
            // Variable-repeat expansion: if the skill is configured with a variableRepeat,
            // generate additional damage entries by re-resolving random-enemy targets per hit.
            const _canLvl = (skillUsed.skillType === "ability" && skillUsed.leveled !== false) || (skillUsed.skillType === "conditional" && skillUsed.leveled);
            const _lvlIdx = _canLvl ? (skillLevelMap[skillUsed.id] ?? 1) - 1 : 0;
            const _level = skillUsed.levels[_lvlIdx];
            const vRep = _level?.variableRepeat;
            const anySpend = vRep?.color === "any" ? (opts?.variableSpend ?? {}) : null;
            const anySpendTotal = anySpend ? Object.values(anySpend).reduce((s, n) => s + (n ?? 0), 0) : 0;
            const vCount = vRep?.color === "any"
              ? Math.max(1, Math.min(vRep.max, anySpendTotal || 1))
              : Math.max(1, Math.min(vRep?.max ?? 1, opts?.variableRepeats ?? 1));
            if (vRep && vCount > 1 && activeCharId) {
              const attacker = getCharacter(activeCharId);
              if (attacker && _level?.damageCategory) {
                const aFormId = battleFormMap[activeCharId];
                const aForm = aFormId ? getFormsForCharacter(activeCharId).find((f) => f.id === aFormId) : null;
                const aStats = applyCharLevelStats(aForm?.statOverrides ? { ...attacker.stats, ...aForm.statOverrides } : attacker.stats, characterLevelMap[attacker.id] ?? 0);
                const aElemDmg = aForm?.elementalDmgOverride ? { ...attacker.elementalDamage, ...aForm.elementalDmgOverride } : attacker.elementalDamage;
                const attackerCombat = { stats: aStats, elementalResistance: attacker.elementalResistance, elementalDamage: aElemDmg, buffs: buffsMap[activeCharId] ?? [], currentHp: currentHpMap[activeCharId] ?? attacker.stats.hp, stolenEnergyCount: stolenEnergyByChar[activeCharId] ?? 0, col: getCharCol(activeCharId) };
                // Track running HP so repeat hits on the same target chain properly
                const runningHp: Record<string, number> = {};
                for (const e of rawTargetEntries) runningHp[e.targetId] = e.newHp;
                const extras: typeof rawTargetEntries = [];
                // For random-enemy targeting we re-roll a fresh target per hit (Zidane's
                // pattern). For any other targeting (target-enemy, front-row-enemy, etc.)
                // every repeat hits the SAME primary target — the player committed to a
                // single target up front (Squall's Renzokuken pattern). If that target
                // dies mid-combo, the remaining hits fizzle.
                const lockedTargetId = _level.targetType !== "random-enemy" ? rawTargetEntries[0]?.targetId : null;
                for (let i = 1; i < vCount; i++) {
                  let pick: { characterId: string } | undefined;
                  if (lockedTargetId) {
                    if ((runningHp[lockedTargetId] ?? 1) <= 0) break;
                    pick = { characterId: lockedTargetId };
                  } else {
                    const res = resolveTargets(_level.targetType, activeCharId, teams, getCharacter, currentHpMapRef.current);
                    const pool = res.targets.filter((t) => {
                      const hp = runningHp[t.characterId] ?? currentHpMap[t.characterId] ?? getCharacter(t.characterId)?.stats.hp ?? 0;
                      return hp > 0;
                    });
                    if (pool.length === 0) break;
                    pick = pool[Math.floor(Math.random() * pool.length)];
                  }
                  if (!pick) break;
                  const tChar = getCharacter(pick.characterId);
                  if (!tChar) continue;
                  const dFormId = battleFormMap[pick.characterId];
                  const dForm = dFormId ? getFormsForCharacter(pick.characterId).find((f) => f.id === dFormId) : null;
                  const dStats = applyCharLevelStats(dForm?.statOverrides ? { ...tChar.stats, ...dForm.statOverrides } : tChar.stats, characterLevelMap[tChar.id] ?? 0);
                  const dElemResBase = dForm?.elementalResOverride ? { ...tChar.elementalResistance, ...dForm.elementalResOverride } : tChar.elementalResistance;
                  const dPassiveGrants = getPassiveResistanceGrants(tChar, dFormId ?? null, skills, characterSkills.filter((cs) => cs.characterId === pick.characterId), skillLevelMap);
                  const dElemRes = applyPassiveElementalGrants(dElemResBase, dPassiveGrants);
                  const curHp = runningHp[pick.characterId] ?? currentHpMap[pick.characterId] ?? tChar.stats.hp;
                  const result = calculateDamage(attackerCombat, { stats: dStats, elementalResistance: dElemRes as typeof tChar.elementalResistance, elementalDamage: tChar.elementalDamage, buffs: buffsMap[pick.characterId] ?? [], currentHp: curHp, col: getCharCol(pick.characterId) }, _level);
                  const maxHp = tChar.stats.hp;
                  const newHp = result.isHealing ? Math.min(maxHp, curHp + result.finalDamage) : Math.max(0, curHp - result.finalDamage);
                  runningHp[pick.characterId] = newHp;
                  extras.push({ targetId: pick.characterId, newHp, amount: result.finalDamage, isHealing: result.isHealing, category: _level.damageCategory, element: result.element ?? _level.element ?? null });
                }
                rawTargetEntries = [...rawTargetEntries, ...extras];
                const charSide = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
                if (charSide) {
                  if (vRep.color === "any" && anySpend) {
                    // Deduct the exact per-color mix the player selected. Base cost should be 0 for "any" skills.
                    setTeamEnergy((prev) => {
                      const sideEnergy = { ...(prev[charSide] ?? {}) };
                      for (const [col, amt] of Object.entries(anySpend)) {
                        if (!amt) continue;
                        const have = sideEnergy[col as EnergyColor] ?? 0;
                        if (have >= amt) {
                          sideEnergy[col as EnergyColor] = have - amt;
                        } else {
                          sideEnergy[col as EnergyColor] = 0;
                          sideEnergy.rainbow = Math.max(0, (sideEnergy.rainbow ?? 0) - (amt - have));
                        }
                      }
                      return { ...prev, [charSide]: sideEnergy };
                    });
                  } else {
                    // Consume extra variable energy for each additional repeat (beyond the 1 included in base cost)
                    const extraEnergy = vCount - 1;
                    if (extraEnergy > 0) {
                      const spendColor = vRep.color as EnergyColor;
                      setTeamEnergy((prev) => {
                        const sideEnergy = { ...(prev[charSide] ?? {}) };
                        const have = sideEnergy[spendColor] ?? 0;
                        if (have >= extraEnergy) {
                          sideEnergy[spendColor] = have - extraEnergy;
                        } else {
                          sideEnergy[spendColor] = 0;
                          sideEnergy.rainbow = Math.max(0, (sideEnergy.rainbow ?? 0) - (extraEnergy - have));
                        }
                        return { ...prev, [charSide]: sideEnergy };
                      });
                    }
                  }
                }
              }
            }
            // Cover redirect: check if damage should be redirected to a covering ally
            const canLevel = (skillUsed.skillType === "ability" && skillUsed.leveled !== false) || (skillUsed.skillType === "conditional" && skillUsed.leveled);
            const lvlIdx = canLevel ? (skillLevelMap[skillUsed.id] ?? 1) - 1 : 0;
            const level = skillUsed.levels[lvlIdx];
            const attackCat = getAttackCategory(level?.targetType, level?.damageSourceOverride);
            const attackerName = activeCharId ? getCharacter(activeCharId)?.name ?? "Unknown" : "Unknown";

            // Guaranteed hit: from skill field OR attacker's guaranteed-hit tag
            const hasGuaranteedHit = (() => {
              if (level?.guaranteedHit) return true;
              if (!activeCharId) return false;
              const aBufs = buffsMap[activeCharId] ?? [];
              for (const b of aBufs) {
                if (!b.tags) continue;
                for (const t of b.tags) {
                  if (t.type !== "guaranteed-hit") continue;
                  const f = (t.params.filter as string) ?? "any";
                  if (f === "any" || f === attackCat) return true;
                }
              }
              return false;
            })();

            // Miss-chance and Dodge-chance: filter targets that miss/dodge before damage is applied
            const skillCat = level?.damageCategory;
            const filterMatches = (filter: string) => filter === "any" || filter === attackCat;
            // Check attacker's miss-chance tags (skipped if guaranteed hit)
            const attackerBuffsForMiss = activeCharId ? (buffsMap[activeCharId] ?? []) : [];
            let attackerMissPct = 0;
            for (const b of attackerBuffsForMiss) {
              if (!b.tags) continue;
              for (const t of b.tags) {
                if (t.type !== "miss-chance") continue;
                const f = (t.params.filter as string) ?? "direct";
                if (!filterMatches(f)) continue;
                const p = (t.params.percent as number) ?? 50;
                if (p > attackerMissPct) attackerMissPct = p;
              }
            }
            const targetEntries = rawTargetEntries.map((entry) => {
              // Only check miss/dodge for actual damage entries (not healing/0 dmg/splash)
              if (entry.isHealing || entry.amount <= 0 || entry.isSplash) return entry;
              // Roll attacker's miss chance per target (skipped by guaranteed hit)
              if (!hasGuaranteedHit && attackerMissPct > 0 && Math.random() * 100 < attackerMissPct) {
                addBattleLog(`${attackerName}'s attack missed ${getCharacter(entry.targetId)?.name ?? "Unknown"}! (${attackerMissPct}% miss chance)`);
                return { ...entry, amount: 0, newHp: currentHpMap[entry.targetId] ?? 100 };
              }
              // Roll defender's dodge chance
              const defenderBuffs = buffsMap[entry.targetId] ?? [];
              let dodgePct = 0;
              for (const b of defenderBuffs) {
                if (!b.tags) continue;
                for (const t of b.tags) {
                  if (t.type !== "dodge-chance") continue;
                  const f = (t.params.filter as string) ?? "direct";
                  if (!filterMatches(f)) continue;
                  const tagCat = (t.params.damageCategory as string) ?? "any";
                  if (tagCat !== "any" && skillCat && tagCat !== skillCat) continue;
                  const p = (t.params.percent as number) ?? 50;
                  if (p > dodgePct) dodgePct = p;
                }
              }
              if (!hasGuaranteedHit && dodgePct > 0 && Math.random() * 100 < dodgePct) {
                addBattleLog(`${getCharacter(entry.targetId)?.name ?? "Unknown"} dodged ${attackerName}'s attack! (${dodgePct}% dodge chance)`);
                return { ...entry, amount: 0, newHp: currentHpMap[entry.targetId] ?? 100 };
              }
              return entry;
            });

            // Track cover events for logging
            const coverEvents: { originalName: string; coverName: string; originalAmount: number; newAmount: number }[] = [];

            const redirectedEntries = targetEntries.map((entry) => {
              // Only redirect damage, not healing — and never redirect splash hits (they're indirect by design)
              // Guaranteed hit bypasses cover redirect entirely
              if (entry.isHealing || entry.amount <= 0 || entry.isSplash || hasGuaranteedHit) return entry;
              const targetChar = getCharacter(entry.targetId);
              if (!targetChar) return entry;
              const targetMaxHp = targetChar.stats.hp;
              const targetCurHp = currentHpMap[entry.targetId] ?? targetMaxHp;
              const targetHpPct = (targetCurHp / targetMaxHp) * 100;
              // Find the target's team side
              const targetSide = teams.find((t) => t.placements.some((p) => p.characterId === entry.targetId))?.side;
              if (!targetSide) return entry;
              // Find all teammates with qualifying cover tags, pick highest HP
              const teammates = teams
                .filter((t) => t.side === targetSide)
                .flatMap((t) => t.placements.map((p) => p.characterId))
                .filter((cid) => cid !== entry.targetId);
              const coverCandidates: { mateId: string; hp: number }[] = [];
              for (const mateId of teammates) {
                // Dead characters can't cover (unless their buff source has activeWhileDefeated)
                const mateHpCheck = currentHpMapRef.current[mateId] ?? (getCharacter(mateId)?.stats.hp ?? 0);
                if (mateHpCheck <= 0) continue;
                const mateBuffs = buffsMap[mateId] ?? [];
                let qualifies = false;
                for (const b of mateBuffs) {
                  if (!b.tags) continue;
                  for (const tag of b.tags) {
                    if (tag.type !== "cover") continue;
                    const hpThreshold = (tag.params.hpThreshold as number) ?? 50;
                    const filter = (tag.params.filter as string) ?? "direct";
                    const tagDmgCat = (tag.params.damageCategory as string) ?? "any";
                    if (filter !== "any" && filter !== attackCat) continue;
                    // Damage category check (physical / magical / any)
                    if (tagDmgCat !== "any" && level?.damageCategory && tagDmgCat !== level.damageCategory) continue;
                    // Ally gender filter (e.g. Protect Girls only covers female allies)
                    const allyGender = (tag.params.allyGender as string) ?? "any";
                    if (allyGender !== "any" && targetChar.gender !== allyGender) continue;
                    // hpThreshold of 0 means no HP requirement (always covers)
                    if (hpThreshold > 0 && targetHpPct >= hpThreshold) continue;
                    qualifies = true;
                    break;
                  }
                  if (qualifies) break;
                }
                if (qualifies) {
                  const mateHp = currentHpMap[mateId] ?? (getCharacter(mateId)?.stats.hp ?? 0);
                  coverCandidates.push({ mateId, hp: mateHp });
                }
              }
              if (coverCandidates.length > 0) {
                // Pick the cover user with the highest current HP
                const best = coverCandidates.sort((a, b) => b.hp - a.hp)[0];
                const coverChar = getCharacter(best.mateId);
                if (coverChar && activeCharId && level?.damageCategory) {
                  // Recalculate damage against the cover user's defenses
                  const attacker = getCharacter(activeCharId);
                  if (attacker) {
                    const aFormId = battleFormMap[activeCharId];
                    const aForm = aFormId ? getFormsForCharacter(activeCharId).find((f) => f.id === aFormId) : null;
                    const aStats = applyCharLevelStats(aForm?.statOverrides ? { ...attacker.stats, ...aForm.statOverrides } : attacker.stats, characterLevelMap[attacker.id] ?? 0);
                    const aElemDmg = aForm?.elementalDmgOverride ? { ...attacker.elementalDamage, ...aForm.elementalDmgOverride } : attacker.elementalDamage;
                    const attackerCombat = { stats: aStats, elementalResistance: attacker.elementalResistance, elementalDamage: aElemDmg, buffs: buffsMap[activeCharId] ?? [], currentHp: currentHpMap[activeCharId] ?? attacker.stats.hp, stolenEnergyCount: stolenEnergyByChar[activeCharId] ?? 0, col: getCharCol(activeCharId) };
                    const cFormId = battleFormMap[best.mateId];
                    const cForm = cFormId ? getFormsForCharacter(best.mateId).find((f) => f.id === cFormId) : null;
                    const cStats = cForm?.statOverrides ? { ...coverChar.stats, ...cForm.statOverrides } : coverChar.stats;
                    const cElemResBase = cForm?.elementalResOverride ? { ...coverChar.elementalResistance, ...cForm.elementalResOverride } : coverChar.elementalResistance;
                    const cPassiveGrants = getPassiveResistanceGrants(coverChar, cFormId ?? null, skills, characterSkills.filter((cs) => cs.characterId === best.mateId), skillLevelMap);
                    const cElemRes = applyPassiveElementalGrants(cElemResBase, cPassiveGrants);
                    const defenderCombat = { stats: cStats, elementalResistance: cElemRes as typeof coverChar.elementalResistance, elementalDamage: coverChar.elementalDamage, buffs: buffsMap[best.mateId] ?? [], currentHp: best.hp, col: getCharCol(best.mateId) };
                    const newResult = calculateDamage(attackerCombat, defenderCombat, level);
                    const newAmount = newResult.finalDamage;
                    const coverNewHp = Math.max(0, best.hp - newAmount);
                    coverEvents.push({ originalName: targetChar.name, coverName: coverChar.name, originalAmount: entry.amount, newAmount });
                    return { ...entry, targetId: best.mateId, newHp: coverNewHp, amount: newAmount };
                  }
                }
              }
              return entry;
            });

            // Multi-strike: if caster has a multi-strike tag matching this skill, generate additional
            // hit passes with independent miss/dodge/cover rolls per extra hit.
            if (activeCharId && level?.damageCategory) {
              const casterBuffs = buffsMap[activeCharId] ?? [];
              let multiStrikeHits = 1;
              for (const b of casterBuffs) {
                if (!b.tags) continue;
                for (const tag of b.tags) {
                  if (tag.type !== "multi-strike") continue;
                  const tagSkillId = tag.params.skillId as string | undefined;
                  if (tagSkillId && tagSkillId === skillUsed.id) {
                    const h = (tag.params.hits as number) ?? 2;
                    if (h > multiStrikeHits) multiStrikeHits = h;
                  }
                }
              }
              if (multiStrikeHits > 1) {
                const extraHitEntries: typeof redirectedEntries = [];
                for (let strike = 1; strike < multiStrikeHits; strike++) {
                  addBattleLog(`${attackerName}'s multi-strike: hit ${strike + 1} of ${multiStrikeHits}.`);
                  for (const origEntry of rawTargetEntries) {
                    if (origEntry.isHealing || origEntry.amount <= 0) {
                      // Healing/zero entries just pass through without extra rolls
                      extraHitEntries.push(origEntry);
                      continue;
                    }
                    // Independent miss roll
                    if (attackerMissPct > 0 && Math.random() * 100 < attackerMissPct) {
                      addBattleLog(`${attackerName}'s attack missed ${getCharacter(origEntry.targetId)?.name ?? "Unknown"}! (${attackerMissPct}% miss chance)`);
                      extraHitEntries.push({ ...origEntry, amount: 0, newHp: currentHpMapRef.current[origEntry.targetId] ?? origEntry.newHp });
                      continue;
                    }
                    // Independent dodge roll
                    const defBufs = buffsMap[origEntry.targetId] ?? [];
                    let dodgePct = 0;
                    for (const db2 of defBufs) {
                      if (!db2.tags) continue;
                      for (const t of db2.tags) {
                        if (t.type !== "dodge-chance") continue;
                        const f = (t.params.filter as string) ?? "direct";
                        if (f !== "any" && f !== attackCat) continue;
                        const tagCat = (t.params.damageCategory as string) ?? "any";
                        if (tagCat !== "any" && skillCat && tagCat !== skillCat) continue;
                        const p = (t.params.percent as number) ?? 50;
                        if (p > dodgePct) dodgePct = p;
                      }
                    }
                    if (dodgePct > 0 && Math.random() * 100 < dodgePct) {
                      addBattleLog(`${getCharacter(origEntry.targetId)?.name ?? "Unknown"} dodged ${attackerName}'s attack! (${dodgePct}% dodge chance)`);
                      extraHitEntries.push({ ...origEntry, amount: 0, newHp: currentHpMapRef.current[origEntry.targetId] ?? origEntry.newHp });
                      continue;
                    }
                    // Recalculate damage against current HP (accounts for first hit reducing HP)
                    const targetChar = getCharacter(origEntry.targetId);
                    if (!targetChar) { extraHitEntries.push(origEntry); continue; }
                    const attacker = getCharacter(activeCharId);
                    if (!attacker) { extraHitEntries.push(origEntry); continue; }
                    const aFormId = battleFormMap[activeCharId];
                    const aForm = aFormId ? getFormsForCharacter(activeCharId).find((f) => f.id === aFormId) : null;
                    const aStats = applyCharLevelStats(aForm?.statOverrides ? { ...attacker.stats, ...aForm.statOverrides } : attacker.stats, characterLevelMap[attacker.id] ?? 0);
                    const aElemDmg = aForm?.elementalDmgOverride ? { ...attacker.elementalDamage, ...aForm.elementalDmgOverride } : attacker.elementalDamage;
                    const aCombat = { stats: aStats, elementalResistance: attacker.elementalResistance, elementalDamage: aElemDmg, buffs: buffsMap[activeCharId] ?? [], currentHp: currentHpMapRef.current[activeCharId] ?? attacker.stats.hp, stolenEnergyCount: stolenEnergyByChar[activeCharId] ?? 0, col: getCharCol(activeCharId) };
                    const dFormId = battleFormMap[origEntry.targetId];
                    const dForm = dFormId ? getFormsForCharacter(origEntry.targetId).find((f) => f.id === dFormId) : null;
                    const dStats = applyCharLevelStats(dForm?.statOverrides ? { ...targetChar.stats, ...dForm.statOverrides } : targetChar.stats, characterLevelMap[targetChar.id] ?? 0);
                    const dElemResBase = dForm?.elementalResOverride ? { ...targetChar.elementalResistance, ...dForm.elementalResOverride } : targetChar.elementalResistance;
                    const dPassiveGrants = getPassiveResistanceGrants(targetChar, dFormId ?? null, skills, characterSkills.filter((cs) => cs.characterId === origEntry.targetId), skillLevelMap);
                    const dElemRes = applyPassiveElementalGrants(dElemResBase, dPassiveGrants);
                    const dCombat = { stats: dStats, elementalResistance: dElemRes as typeof targetChar.elementalResistance, elementalDamage: targetChar.elementalDamage, buffs: buffsMap[origEntry.targetId] ?? [], currentHp: currentHpMapRef.current[origEntry.targetId] ?? targetChar.stats.hp, col: getCharCol(origEntry.targetId) };
                    const result = calculateDamage(aCombat, dCombat, level);
                    // Cover redirect for extra hit (same logic as primary hits)
                    if (!hasGuaranteedHit) {
                      const tMaxHp = targetChar.stats.hp;
                      const tCurHp = currentHpMapRef.current[origEntry.targetId] ?? tMaxHp;
                      const tHpPct = (tCurHp / tMaxHp) * 100;
                      const tSide = teams.find((t) => t.placements.some((p) => p.characterId === origEntry.targetId))?.side;
                      if (tSide) {
                        const teammates = teams.filter((t) => t.side === tSide).flatMap((t) => t.placements.map((p) => p.characterId)).filter((cid) => cid !== origEntry.targetId);
                        const coverCands: { mateId: string; hp: number }[] = [];
                        for (const mateId of teammates) {
                          const mateHpC = currentHpMapRef.current[mateId] ?? (getCharacter(mateId)?.stats.hp ?? 0);
                          if (mateHpC <= 0) continue;
                          const mateBuffsC = buffsMap[mateId] ?? [];
                          let qual = false;
                          for (const b of mateBuffsC) {
                            if (qual) break;
                            if (!b.tags) continue;
                            for (const tag of b.tags) {
                              if (tag.type !== "cover") continue;
                              const hpTh = (tag.params.hpThreshold as number) ?? 50;
                              const flt = (tag.params.filter as string) ?? "direct";
                              const tDmgCat = (tag.params.damageCategory as string) ?? "any";
                              if (flt !== "any" && flt !== attackCat) continue;
                              if (tDmgCat !== "any" && level?.damageCategory && tDmgCat !== level.damageCategory) continue;
                              const allyG = (tag.params.allyGender as string) ?? "any";
                              if (allyG !== "any" && targetChar.gender !== allyG) continue;
                              if (hpTh > 0 && tHpPct >= hpTh) continue;
                              qual = true;
                              break;
                            }
                          }
                          if (qual) coverCands.push({ mateId, hp: mateHpC });
                        }
                        if (coverCands.length > 0) {
                          const best = coverCands.sort((a, b) => b.hp - a.hp)[0];
                          const coverChar = getCharacter(best.mateId);
                          if (coverChar && attacker) {
                            const cFId = battleFormMap[best.mateId];
                            const cFrm = cFId ? getFormsForCharacter(best.mateId).find((f) => f.id === cFId) : null;
                            const cSts = cFrm?.statOverrides ? { ...coverChar.stats, ...cFrm.statOverrides } : coverChar.stats;
                            const cERB = cFrm?.elementalResOverride ? { ...coverChar.elementalResistance, ...cFrm.elementalResOverride } : coverChar.elementalResistance;
                            const cPG = getPassiveResistanceGrants(coverChar, cFId ?? null, skills, characterSkills.filter((cs) => cs.characterId === best.mateId), skillLevelMap);
                            const cER = applyPassiveElementalGrants(cERB, cPG);
                            const cDef = { stats: cSts, elementalResistance: cER as typeof coverChar.elementalResistance, elementalDamage: coverChar.elementalDamage, buffs: buffsMap[best.mateId] ?? [], currentHp: best.hp, col: getCharCol(best.mateId) };
                            const cRes = calculateDamage(aCombat, cDef, level);
                            const cNewHp = Math.max(0, best.hp - cRes.finalDamage);
                            coverEvents.push({ originalName: targetChar.name, coverName: coverChar.name, originalAmount: result.finalDamage, newAmount: cRes.finalDamage });
                            extraHitEntries.push({ ...origEntry, targetId: best.mateId, amount: cRes.finalDamage, newHp: cNewHp, isHealing: false, category: level.damageCategory, element: cRes.element ?? null });
                            continue; // skip the normal push below — cover entry was pushed instead
                          }
                        }
                      }
                    }
                    const curHp = currentHpMapRef.current[origEntry.targetId] ?? targetChar.stats.hp;
                    const newHp = result.isHealing ? Math.min(targetChar.stats.hp, curHp + result.finalDamage) : Math.max(0, curHp - result.finalDamage);
                    extraHitEntries.push({ ...origEntry, amount: result.finalDamage, newHp, isHealing: result.isHealing, category: level.damageCategory, element: result.element ?? null });
                  }
                }
                // Merge extra hits into redirectedEntries
                redirectedEntries.push(...extraHitEntries);
              }
            }

            // Define movements application as a timing-aware helper so it can be invoked both
            // before and after damage resolution. Movements declared in the helper body are read
            // from the skill level's full movements list and filtered by timing at call time.
            const movementsAllForPhase = skillUsed.levels[lvlIdx]?.movements ?? [];
            const applyMovementsTimingPhase = (phaseTiming: "before-damage" | "after-damage") => {
              if (!activeCharId) return;
              const movements = movementsAllForPhase.filter((m) => (m.timing ?? "after-damage") === phaseTiming);
              if (movements.length === 0) return;
              const enemyTargetTypesM = new Set(["target-enemy", "front-row-enemy", "random-enemy", "aoe-enemy", "self-row-enemy"]);
              const allyTargetTypesM = new Set(["target-ally", "target-ally-or-self", "random-ally", "adjacent-ally", "aoe-team"]);
              const skillTargetType = skillUsed.levels[lvlIdx]?.targetType;
              const damagedTargetIds = new Set(targetEntries.filter((e) => !e.isHealing && e.amount > 0).map((e) => e.targetId));
              for (const movement of movements) {
                const trig = movement.trigger ?? "on-use";
                if (trig === "on-attack-hit" && damagedTargetIds.size === 0) continue;

                if (movement.type === "recoil-self-one") {
                  const casterTeam = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId));
                  if (!casterTeam) continue;
                  const casterPlacement = casterTeam.placements.find((p) => p.characterId === activeCharId);
                  if (!casterPlacement) continue;
                  const { row: cRow, col: cCol } = casterPlacement.position;
                  if (cCol >= 2) {
                    addBattleLog(`${getCharacter(activeCharId)?.name ?? "Unknown"} is already at the back row; no recoil.`);
                    continue;
                  }
                  const behindOccupant = casterTeam.placements.find(
                    (p) => p.position.row === cRow && p.position.col === cCol + 1
                  );
                  const newPlacements = casterTeam.placements.map((p) => {
                    if (p.characterId === activeCharId) return { ...p, position: { row: cRow, col: cCol + 1 } };
                    if (behindOccupant && p.characterId === behindOccupant.characterId) {
                      return { ...p, position: { row: cRow, col: cCol } };
                    }
                    return p;
                  });
                  updateTeam({ ...casterTeam, placements: newPlacements });
                  addBattleLog(`${getCharacter(activeCharId)?.name ?? "Unknown"} recoils back one space.`);
                  continue;
                }

                if (movement.type === "switch-self-adjacent") {
                  const casterTeam = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId));
                  if (!casterTeam) continue;
                  const casterPlacement = casterTeam.placements.find((p) => p.characterId === activeCharId);
                  if (!casterPlacement) continue;
                  const { row: cRow, col: cCol } = casterPlacement.position;
                  const hasNeighbor = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
                    const nr = cRow + dr;
                    const nc = cCol + dc;
                    return nr >= 0 && nr <= 2 && nc >= 0 && nc <= 2;
                  });
                  if (!hasNeighbor) {
                    addBattleLog(`${getCharacter(activeCharId)?.name ?? "Unknown"} has no adjacent space to move to!`);
                    continue;
                  }
                  setAdjacentMoveRequest({ charId: activeCharId, instant: !!skillUsed.levels[lvlIdx]?.instant });
                  pendingTeleport = true;
                  continue;
                }

                if (movement.type === "teleport-self") {
                  const destSide = movement.destinationSide ?? "ally";
                  const casterTeam = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId));
                  if (!casterTeam) continue;
                  const targetTeamForTp = destSide === "ally" ? casterTeam : teams.find((t) => t.id !== casterTeam.id);
                  if (!targetTeamForTp) continue;
                  const occupiedSet = new Set(targetTeamForTp.placements.map((p) => `${p.position.row},${p.position.col}`));
                  let hasEmpty = false;
                  for (let r = 0; r < 3 && !hasEmpty; r++) {
                    for (let c = 0; c < 3 && !hasEmpty; c++) {
                      if (!occupiedSet.has(`${r},${c}`)) hasEmpty = true;
                    }
                  }
                  if (!hasEmpty) {
                    addBattleLog(`${getCharacter(activeCharId)?.name ?? "Unknown"} has nowhere to teleport to!`);
                    continue;
                  }
                  setTeleportRequest({ charId: activeCharId, destSide, instant: !!skillUsed.levels[lvlIdx]?.instant });
                  pendingTeleport = true;
                  continue;
                }

                let moveTargetIds: string[];
                const isEnemy = enemyTargetTypesM.has(movement.targetType);
                const isAlly = allyTargetTypesM.has(movement.targetType);
                const isSelf = movement.targetType === "self";
                if (isSelf) {
                  moveTargetIds = [activeCharId];
                } else if (isEnemy && targetEntries.length > 0 && skillTargetType && enemyTargetTypesM.has(skillTargetType)) {
                  moveTargetIds = targetEntries.map((t) => t.targetId);
                } else if (isAlly && targetEntries.length > 0 && skillTargetType && allyTargetTypesM.has(skillTargetType)) {
                  moveTargetIds = targetEntries.map((t) => t.targetId);
                } else {
                  const mr = resolveTargets(movement.targetType, activeCharId, teams, getCharacter, currentHpMapRef.current);
                  moveTargetIds = mr.targets.map((t) => t.characterId);
                }
                if (trig === "on-attack-hit") {
                  moveTargetIds = moveTargetIds.filter((id) => damagedTargetIds.has(id));
                }
                for (const tid of moveTargetIds) {
                  const targetTeam = teams.find((t) => t.placements.some((p) => p.characterId === tid));
                  if (!targetTeam) continue;
                  const targetPlacement = targetTeam.placements.find((p) => p.characterId === tid);
                  if (!targetPlacement) continue;
                  const { row: targetRow, col: targetCol } = targetPlacement.position;
                  let newPlacements: typeof targetTeam.placements;
                  if (movement.type === "push-back") {
                    if (targetCol >= 2) continue;
                    newPlacements = targetTeam.placements.map((p) => {
                      if (p.position.row !== targetRow) return p;
                      if (p.characterId === tid) return { ...p, position: { row: targetRow, col: 2 } };
                      if (p.position.col > targetCol && p.position.col <= 2) {
                        return { ...p, position: { row: targetRow, col: p.position.col - 1 } };
                      }
                      return p;
                    });
                  } else if (movement.type === "push-back-one") {
                    if (targetCol >= 2) continue;
                    const behindOccupant = targetTeam.placements.find(
                      (p) => p.position.row === targetRow && p.position.col === targetCol + 1
                    );
                    newPlacements = targetTeam.placements.map((p) => {
                      if (p.characterId === tid) return { ...p, position: { row: targetRow, col: targetCol + 1 } };
                      if (behindOccupant && p.characterId === behindOccupant.characterId) {
                        return { ...p, position: { row: targetRow, col: targetCol } };
                      }
                      return p;
                    });
                  } else if (movement.type === "pull-forward") {
                    if (targetCol <= 0) continue;
                    newPlacements = targetTeam.placements.map((p) => {
                      if (p.position.row !== targetRow) return p;
                      if (p.characterId === tid) return { ...p, position: { row: targetRow, col: 0 } };
                      if (p.position.col >= 0 && p.position.col < targetCol) {
                        return { ...p, position: { row: targetRow, col: p.position.col + 1 } };
                      }
                      return p;
                    });
                  } else if (movement.type === "pull-forward-one") {
                    // Move target one column forward (col → col-1). Swap with whoever is in front,
                    // walk into empty cell otherwise. No-op if already at front row.
                    if (targetCol <= 0) continue;
                    const frontOccupant = targetTeam.placements.find(
                      (p) => p.position.row === targetRow && p.position.col === targetCol - 1
                    );
                    newPlacements = targetTeam.placements.map((p) => {
                      if (p.characterId === tid) return { ...p, position: { row: targetRow, col: targetCol - 1 } };
                      if (frontOccupant && p.characterId === frontOccupant.characterId) {
                        return { ...p, position: { row: targetRow, col: targetCol } };
                      }
                      return p;
                    });
                  } else {
                    continue;
                  }
                  updateTeam({ ...targetTeam, placements: newPlacements });
                  const targetName = getCharacter(tid)?.name ?? "Unknown";
                  const moveLabel =
                    movement.type === "push-back" ? "pushed to the back row" :
                    movement.type === "push-back-one" ? "pushed back one space" :
                    movement.type === "pull-forward" ? "pulled to the front row" :
                    movement.type === "pull-forward-one" ? "pulled forward one space" :
                    "moved";
                  addBattleLog(`${targetName} is ${moveLabel}.`);
                }
              }
            };
            applyMovementsTimingPhase("before-damage");

            // --- Attack choreography ---
            // Attacker slingshot animation (only for damaging hits with at least one target).
            const attackerSide = activeCharId ? teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side : undefined;
            const hasDamageHit = redirectedEntries.some((e) => e.amount > 0 && !e.isHealing);
            if (activeCharId && hasDamageHit && attackerSide) {
              // left-side attacker lunges right; right-side attacker lunges left
              const slingCls = attackerSide === "left" ? "sling-right" : "sling-left";
              triggerAnim(activeCharId, slingCls, 650);
            }
            // Delay the HP apply + defender recoil + floating numbers to land at the peak of the lunge.
            const applyHit = () => {
              setCurrentHpMap((prev) => {
                const next = { ...prev };
                for (const { targetId, newHp } of redirectedEntries) {
                  next[targetId] = newHp;
                }
                return next;
              });
              for (const entry of redirectedEntries) {
                if (entry.amount <= 0) continue;
                spawnDamageFloat(entry.targetId, entry.amount, entry.isHealing);
                if (!entry.isHealing) {
                  const defSide = teams.find((t) => t.placements.some((p) => p.characterId === entry.targetId))?.side;
                  if (defSide) {
                    const recoilCls = defSide === "left" ? "recoil-left" : "recoil-right";
                    triggerAnim(entry.targetId, recoilCls, 550);
                  }
                }
              }
              // Track battle stats for each entry
              const primarySourceCat = getAttackCategory(level?.targetType, level?.damageSourceOverride);
              for (const entry of redirectedEntries) {
                if (entry.amount <= 0) continue;
                if (entry.isHealing) {
                  if (activeCharId) addBattleStat(activeCharId, "healingDone", entry.amount);
                } else {
                  if (activeCharId) {
                    addBattleStat(activeCharId, "damageDone", entry.amount);
                    // Source breakdown: splash is indirect unless overridden, primary uses skill's source cat
                    const srcCat = entry.isSplash ? "indirect" : primarySourceCat;
                    const srcField = srcCat === "direct" ? "directDmg" : srcCat === "aoe" ? "aoeDmg" : "indirectDmg";
                    addBattleStat(activeCharId, srcField, entry.amount);
                    // True damage breakdown (cross-cutting — a hit can be both direct and true)
                    if (entry.category === "true") addBattleStat(activeCharId, "trueDmg", entry.amount);
                  }
                  addBattleStat(entry.targetId, "damageTaken", entry.amount);
                }
              }
              // Consume caster imbue: strip any imbue-tagged buffs from the caster after the hit lands.
              if (skillUsed.levels[lvlIdx]?.consumesCasterImbue && activeCharId) {
                const IMBUE_TAGS = new Set(["fire-imbue", "ice-imbue", "thunder-imbue"]);
                setBuffsMap((prev) => {
                  const list = prev[activeCharId] ?? [];
                  const filtered = list.filter((b) => !b.tags?.some((t) => IMBUE_TAGS.has(t.type)));
                  if (filtered.length === list.length) return prev;
                  return { ...prev, [activeCharId]: filtered };
                });
                addBattleLog(`${attackerName}'s imbue is consumed.`);
              }
            };
            if (hasDamageHit) {
              setTimeout(applyHit, 300);
            } else {
              applyHit();
            }
            // Use energy
            useSkillEnergy(skillUsed.id);
            // HP cost (self-damage as % of caster's max HP)
            const hpCostPct = skillUsed.levels[lvlIdx]?.hpCost ?? 0;
            if (hpCostPct > 0 && activeCharId) {
              const caster = getCharacter(activeCharId);
              if (caster) {
                const hpDmg = Math.ceil(caster.stats.hp * (hpCostPct / 100));
                const curHp = currentHpMap[activeCharId] ?? caster.stats.hp;
                const newHp = Math.max(0, curHp - hpDmg);
                setCurrentHpMap((prev) => ({ ...prev, [activeCharId]: newHp }));
                spawnDamageFloat(activeCharId, hpDmg, false);
                addBattleLog(`${caster.name} pays ${hpDmg} HP (${hpCostPct}% max HP) to use ${skillUsed.name}.`);
              }
            }
            // Log — variable-repeat skills get a per-hit breakdown
            if (vRep && redirectedEntries.length > 0) {
              addBattleLog(`Round ${round}. ${attackerName} uses ${skillUsed.name} (${redirectedEntries.length}).`);
              for (const t of redirectedEntries) {
                const targetName = getCharacter(t.targetId)?.name ?? "Unknown";
                if (t.isHealing) {
                  addBattleLog(`${attackerName} heals ${targetName} for ${t.amount} HP.`);
                } else {
                  addBattleLog(`${attackerName} deals ${t.amount} ${t.category ?? "physical"} damage to ${targetName}.`);
                }
              }
            } else if (redirectedEntries.length === 0) {
              addBattleLog(`Round ${round}. ${attackerName} uses ${skillUsed.name}.`);
            } else if (coverEvents.length > 0) {
              // Cover case — use the restructured log format
              addBattleLog(`Round ${round}. ${attackerName} uses ${skillUsed.name}.`);
              for (const ce of coverEvents) {
                addBattleLog(`${ce.coverName} covers ${ce.originalName}, taking ${ce.newAmount} damage!`);
              }
              // Log any non-covered targets
              const nonCovered = redirectedEntries.filter((re, i) => {
                const orig = targetEntries[i];
                return orig && re.targetId === orig.targetId;
              });
              for (const t of nonCovered) {
                const targetName = getCharacter(t.targetId)?.name ?? "Unknown";
                const elemPart = t.element ? `${t.element} ` : "";
                const dmgText = t.isHealing
                  ? `healing ${targetName} for ${t.amount} HP`
                  : `dealing ${t.amount} ${t.category ?? "physical"} ${elemPart}damage to ${targetName}`;
                addBattleLog(`${attackerName} ${dmgText}.`);
              }
            } else if (redirectedEntries.length === 1) {
              const t = redirectedEntries[0];
              const targetName = getCharacter(t.targetId)?.name ?? "Unknown";
              const elemPart = t.element ? `${t.element} ` : "";
              const dmgText = t.isHealing
                ? `healing ${targetName} for ${t.amount} HP`
                : `dealing ${t.amount} ${t.category ?? "physical"} ${elemPart}damage to ${targetName}`;
              addBattleLog(`Round ${round}. ${attackerName} uses ${skillUsed.name} ${dmgText}.`);
            } else {
              const totalDmg = redirectedEntries.reduce((sum, t) => sum + t.amount, 0);
              const isHealing = redirectedEntries[0]?.isHealing ?? false;
              const elemPart = redirectedEntries[0]?.element ? `${redirectedEntries[0].element} ` : "";
              const dmgText = isHealing
                ? `healing ${redirectedEntries.length} targets for ${totalDmg} total HP`
                : `dealing ${totalDmg} total ${redirectedEntries[0]?.category ?? "physical"} ${elemPart}damage to ${redirectedEntries.length} targets`;
              addBattleLog(`Round ${round}. ${attackerName} uses ${skillUsed.name} ${dmgText}.`);
            }
            // Apply dispels (remove buffs/debuffs from targets)
            const dispels = skillUsed.levels[lvlIdx]?.dispels ?? [];
            if (dispels.length > 0 && activeCharId) {
              const enemyTargetTypes = new Set(["target-enemy", "front-row-enemy", "random-enemy", "aoe-enemy", "self-row-enemy"]);
              const allyTargetTypes = new Set(["target-ally", "target-ally-or-self", "random-ally", "adjacent-ally", "aoe-team"]);
              const skillTargetType = skillUsed.levels[lvlIdx]?.targetType;
              for (const dispel of dispels) {
                const isEnemy = enemyTargetTypes.has(dispel.targetType);
                const isAlly = allyTargetTypes.has(dispel.targetType);
                const isSelf = dispel.targetType === "self";
                // Resolve dispel targets — match damage targets if same group
                let dispelTargetIds: string[];
                if (isSelf) {
                  dispelTargetIds = [activeCharId];
                } else if (isEnemy && targetEntries.length > 0 && skillTargetType && enemyTargetTypes.has(skillTargetType)) {
                  dispelTargetIds = targetEntries.map((t) => t.targetId);
                } else if (isAlly && targetEntries.length > 0 && skillTargetType && allyTargetTypes.has(skillTargetType)) {
                  dispelTargetIds = targetEntries.map((t) => t.targetId);
                } else {
                  const dispelTargets = resolveTargets(dispel.targetType, activeCharId, teams, getCharacter, currentHpMapRef.current);
                  dispelTargetIds = dispelTargets.targets.map((t) => t.characterId);
                }
                for (const tid of dispelTargetIds) {
                  // Compute dispellable buffs and decide what to remove BEFORE the state updater
                  const existing = buffsMap[tid] ?? [];
                  const dispellable = existing.filter((b) => {
                    const se = statusEffects.find((s) => s.id === b.effectId);
                    if (se?.dispellable === false) return false;
                    // Determine effective polarity: buffs = positive, debuffs = negative, statuses use their polarity
                    const polarity = b.category === "buff" ? "positive" : b.category === "debuff" ? "negative" : se?.polarity;
                    if (dispel.category === "any") return true;
                    if (dispel.category === "buff") return polarity === "positive";
                    if (dispel.category === "debuff") return polarity === "negative";
                    return false;
                  });
                  if (dispellable.length === 0) continue;
                  const toRemove = dispel.count === -1
                    ? dispellable
                    : [...dispellable].sort(() => Math.random() - 0.5).slice(0, dispel.count);
                  const toRemoveIds = new Set(toRemove.map((b) => b.id));
                  const targetName = getCharacter(tid)?.name ?? "Unknown";
                  const removedNames = toRemove.map((b) => b.effectName).join(", ");
                  addBattleLog(`${targetName} loses ${toRemove.length} effect${toRemove.length > 1 ? "s" : ""}: ${removedNames}.`);
                  setBuffsMap((prev) => ({
                    ...prev,
                    [tid]: (prev[tid] ?? []).filter((b) => !toRemoveIds.has(b.id)),
                  }));
                }
              }
            }

            // Apply after-damage movements (helper defined above, called before damage earlier).
            applyMovementsTimingPhase("after-damage");

            // Energy steal: random or chosen energy from enemy team
            const energySteal = skillUsed.levels[lvlIdx]?.energySteal;
            if (energySteal && activeCharId) {
              const stealTrig = energySteal.trigger ?? "on-use";
              const damagedAny = targetEntries.some((e) => !e.isHealing && e.amount > 0);
              const allowed = stealTrig === "on-use" || (stealTrig === "on-attack-hit" && damagedAny);
              if (allowed) {
                const casterSide = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
                const enemyTeamS = teams.find((t) => t.side !== casterSide);
                if (casterSide && enemyTeamS) {
                  const enemySide = enemyTeamS.side;
                  if (energySteal.mode === "random") {
                    // Pick random colors from enemy pool (excluding rainbow) — compute outside updater
                    const enemyPoolStart = teamEnergy[enemySide] ?? {};
                    const enemyPoolWork = { ...enemyPoolStart };
                    const stolenColors: EnergyColor[] = [];
                    for (let i = 0; i < energySteal.count; i++) {
                      const flat: EnergyColor[] = [];
                      for (const c of ENERGY_COLORS) {
                        const amt = enemyPoolWork[c] ?? 0;
                        for (let j = 0; j < amt; j++) flat.push(c);
                      }
                      if (flat.length === 0) break;
                      const picked = flat[Math.floor(Math.random() * flat.length)];
                      enemyPoolWork[picked] = (enemyPoolWork[picked] ?? 0) - 1;
                      stolenColors.push(picked);
                    }
                    if (stolenColors.length > 0) {
                      addBattleLog(`${attackerName} steals ${stolenColors.length} energy: ${stolenColors.join(", ")}.`);
                      // Increment per-character stolen energy counter
                      if (activeCharId) {
                        setStolenEnergyByChar((prev) => ({ ...prev, [activeCharId]: (prev[activeCharId] ?? 0) + stolenColors.length }));
                      }
                    } else {
                      addBattleLog(`${attackerName} tries to steal but the enemy has no energy!`);
                    }
                    setTeamEnergy((prev) => {
                      const enemyPool = { ...(prev[enemySide] ?? {}) };
                      const casterPool = { ...(prev[casterSide] ?? {}) };
                      for (const c of stolenColors) {
                        enemyPool[c] = (enemyPool[c] ?? 0) - 1;
                        casterPool[c] = (casterPool[c] ?? 0) + 1;
                      }
                      return { ...prev, [enemySide]: enemyPool, [casterSide]: casterPool };
                    });
                  } else if (energySteal.mode === "choose") {
                    // Open a chooser modal — store casterId so the counter credits the right character
                    // even after the turn advances before the user picks.
                    setEnergyChooseRequest({
                      kind: "steal",
                      count: energySteal.count,
                      sourceSide: enemySide,
                      destSide: casterSide,
                      attackerName,
                      casterId: activeCharId,
                    });
                  }
                }
              }
            }

            // Energy generate: add energy to the caster's pool
            const energyGenerate = skillUsed.levels[lvlIdx]?.energyGenerate;
            if (energyGenerate && activeCharId) {
              const genTrig = energyGenerate.trigger ?? "on-use";
              const damagedAnyG = targetEntries.some((e) => !e.isHealing && e.amount > 0);
              const allowedG = genTrig === "on-use" || (genTrig === "on-attack-hit" && damagedAnyG);
              if (allowedG) {
                const casterSide = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
                if (casterSide) {
                  if (energyGenerate.mode === "specific" && energyGenerate.color) {
                    const c = energyGenerate.color;
                    setTeamEnergy((prev) => ({
                      ...prev,
                      [casterSide]: { ...(prev[casterSide] ?? {}), [c]: ((prev[casterSide]?.[c]) ?? 0) + energyGenerate.count },
                    }));
                    addBattleLog(`${attackerName} generates ${energyGenerate.count} ${c} energy.`);
                  } else if (energyGenerate.mode === "random") {
                    // Roll random colors outside the updater so the log isn't doubled in StrictMode
                    const generated: EnergyColor[] = [];
                    for (let i = 0; i < energyGenerate.count; i++) {
                      generated.push(ENERGY_COLORS[Math.floor(Math.random() * ENERGY_COLORS.length)]);
                    }
                    addBattleLog(`${attackerName} generates ${generated.length} energy: ${generated.join(", ")}.`);
                    setTeamEnergy((prev) => {
                      const pool = { ...(prev[casterSide] ?? {}) };
                      for (const c of generated) {
                        pool[c] = (pool[c] ?? 0) + 1;
                      }
                      return { ...prev, [casterSide]: pool };
                    });
                  } else if (energyGenerate.mode === "choose") {
                    setEnergyChooseRequest({
                      kind: "generate",
                      count: energyGenerate.count,
                      destSide: casterSide,
                      attackerName,
                    });
                  }
                }
              }
            }

            // Apply skill effects (buff/debuff applications)
            const isInstant = !!skillUsed.levels[lvlIdx]?.instant;
            const baseEffects = skillUsed.levels[lvlIdx]?.effects ?? [];
            const randomPools = skillUsed.levels[lvlIdx]?.randomEffectPools ?? [];
            // Roll random effect pools — pick N unique effects per pool
            const rolledFromPools: SkillEffect[] = [];
            for (const pool of randomPools) {
              if (pool.effects.length === 0 || pool.pickCount <= 0) continue;
              const shuffled = [...pool.effects].sort(() => Math.random() - 0.5);
              const picks = shuffled.slice(0, Math.min(pool.pickCount, pool.effects.length));
              rolledFromPools.push(...picks);
            }
            const chosenFromPools = opts?.chosenPoolEffects ?? [];
            const allLevelEffects = [...baseEffects, ...rolledFromPools, ...chosenFromPools];
            const didDealDamage = targetEntries.length > 0 && !targetEntries[0]?.isHealing;
            // Filter effects by trigger: on-use always fires, on-attack-hit only if damage was dealt
            const levelEffects = allLevelEffects.filter((eff) => {
              const t = eff.trigger ?? "on-use";
              if (t === "on-use") return true;
              if (t === "on-attack-hit") return didDealDamage;
              return false; // turn-start effects are handled separately
            });
            if (levelEffects.length > 0 && activeCharId) {
              for (const eff of levelEffects) {
                const se = statusEffects.find((s) => s.id === eff.effectId);
                if (!se) continue;
                // Resolve targets for this effect
                const enemyTargetTypes = new Set(["target-enemy", "front-row-enemy", "random-enemy", "aoe-enemy", "self-row-enemy"]);
                const allyTargetTypes = new Set(["target-ally", "target-ally-or-self", "random-ally", "adjacent-ally", "aoe-team"]);
                const skillTargetType = skillUsed.levels[lvlIdx]?.targetType;
                const effIsEnemy = enemyTargetTypes.has(eff.targetType);
                const effIsAlly = allyTargetTypes.has(eff.targetType);
                const effIsSelf = eff.targetType === "self";
                let resolvedIds: string[];
                if (effIsSelf) {
                  resolvedIds = [activeCharId];
                } else if (effIsEnemy && redirectedEntries.length > 0 && skillTargetType && enemyTargetTypes.has(skillTargetType)) {
                  // Use redirected entries so cover redirect also transfers on-hit effects to the cover user
                  resolvedIds = redirectedEntries.filter((t) => !t.isSplash).map((t) => t.targetId);
                } else if (effIsAlly && redirectedEntries.length > 0 && skillTargetType && allyTargetTypes.has(skillTargetType)) {
                  resolvedIds = redirectedEntries.filter((t) => !t.isSplash).map((t) => t.targetId);
                } else {
                  const effTargets = resolveTargets(eff.targetType, activeCharId, teams, getCharacter, currentHpMapRef.current);
                  resolvedIds = effTargets.targets.map((t) => t.characterId);
                }
                const buff: Omit<BuffDebuff, "id"> = {
                  effectId: se.id,
                  effectName: se.name,
                  category: se.category,
                  stats: se.stats,
                  modifier: !se.stats.includes("none") ? eff.modifier : 0,
                  duration: eff.duration,
                  source: skillUsed.name,
                  sourceCharId: activeCharId ?? undefined,
                  ...((isInstant && !eff.untilNextTurn) ? {} : { appliedTurn: globalTurnId }),
                  ...(eff.untilNextTurn ? { untilNextTurn: true } : {}),
                  ...(se.tags ? { tags: se.tags } : {}),
                  ...(se.stackable ? { stackable: true, maxStacks: se.maxStacks, stacks: 1, ...(se.onMaxStacks ? { onMaxStacks: se.onMaxStacks } : {}) } : {}),
                };
                for (const tid of resolvedIds) {
                  // Roll chance per target individually
                  if (eff.chance !== undefined && eff.chance < 100) {
                    const roll = Math.random() * 100;
                    if (roll >= eff.chance) {
                      addBattleLog(`${attackerName}'s ${se.name} missed ${getCharacter(tid)?.name ?? "Unknown"}! (${eff.chance}% chance)`);
                      continue;
                    }
                  }
                  // Check status resistance (base + passive grants)
                  if (se.resistable) {
                    const targetChar = getCharacter(tid);
                    if (targetChar) {
                      const baseRes = targetChar.statusResistance?.[se.id] ?? 0;
                      const tFormId = battleFormMap[tid] ?? null;
                      const tForm = tFormId ? getFormsForCharacter(tid).find((f) => f.id === tFormId) : null;
                      const formRes = tForm?.statusResistanceOverride?.[se.id];
                      const effectiveBaseRes = formRes ?? baseRes;
                      const passiveGrants = getPassiveResistanceGrants(targetChar, tFormId, skills, characterSkills, skillLevelMap);
                      const passiveRes = getPassiveStatusResistance(passiveGrants, se.id);
                      const totalRes = Math.min(100, effectiveBaseRes + passiveRes);
                      if (totalRes > 0) {
                        const roll = Math.random() * 100;
                        if (roll < totalRes) {
                          addBattleLog(`${targetChar.name} resisted ${se.name}! (${totalRes}% resistance)`);
                          continue;
                        }
                      }
                    }
                  }
                  setBuffsMap((prev) => {
                    let existing = prev[tid] ?? [];
                    // If applying a form-linked status, remove conflicting form-linked statuses
                    if (se.formId) {
                      existing = existing.filter((b) => {
                        const bSe = statusEffects.find((s) => s.id === b.effectId);
                        return !bSe?.formId || bSe.id === se.id;
                      });
                    }
                    // Imbues are mutually exclusive: applying any imbue strips existing imbue-bearing buffs.
                    const IMBUE_TAGS = new Set(["fire-imbue", "ice-imbue", "thunder-imbue"]);
                    const incomingHasImbue = se.tags?.some((t) => IMBUE_TAGS.has(t.type));
                    if (incomingHasImbue) {
                      existing = existing.filter((b) => !b.tags?.some((t) => IMBUE_TAGS.has(t.type)));
                    }
                    const { buffs: updated, triggered } = applyBuffStacking(existing, buff);
                    if (triggered) {
                      const grantEffect = statusEffects.find((s) => s.id === triggered);
                      if (grantEffect) {
                        const grantBuff: BuffDebuff = {
                          id: crypto.randomUUID(), effectId: grantEffect.id, effectName: grantEffect.name,
                          category: grantEffect.category, stats: grantEffect.stats,
                          modifier: grantEffect.defaultModifier ?? 0, duration: 1, source: grantEffect.name,
                          appliedTurn: globalTurnId,
                          ...(grantEffect.tags ? { tags: grantEffect.tags } : {}),
                        };
                        addBattleLog(`${getCharacter(tid)?.name ?? "Unknown"} reaches max stacks! ${grantEffect.name} activated!`);
                        return { ...prev, [tid]: [...updated, grantBuff] };
                      }
                    }
                    return { ...prev, [tid]: updated };
                  });
                  const tName = getCharacter(tid)?.name ?? "Unknown";
                  const modText = !se.stats.includes("none") ? ` (${eff.modifier > 0 ? "+" : ""}${eff.modifier}%)` : "";
                  addBattleLog(`${se.name}${modText} applied to ${tName}${eff.duration === -1 ? "" : ` for ${eff.duration} turns`}.`);
                  // Floating status label + self-buff flash.
                  // Delay so status labels appear after the damage number when this skill dealt damage.
                  const statusDelay = hasDamageHit ? 360 : 0;
                  const targetCharId = tid;
                  setTimeout(() => {
                    spawnStatusFloat(targetCharId, se.stats, eff.modifier, se.category, se.name, se.stackable);
                  }, statusDelay);
                  if (tid === activeCharId && se.category !== "debuff") {
                    triggerAnim(tid, "self-buff", 700);
                  }
                }
              }
            }
            // Reset stolen energy counter after use (for skills like Thievery's lower levels)
            if (skillUsed.levels[lvlIdx]?.stolenEnergyScaling?.resetOnUse && activeCharId) {
              setStolenEnergyByChar((prev) => ({ ...prev, [activeCharId]: 0 }));
              addBattleLog(`${attackerName}'s stolen energy count is reset.`);
            }

            // Counter attacks: defenders with the "counter" tag retaliate with their basic attack
            if (activeCharId && level?.damageCategory && (level.damageCategory === "physical" || level.damageCategory === "magical")) {
              const skillCat = level.damageCategory;
              for (const entry of redirectedEntries) {
                if (entry.isHealing || entry.amount <= 0 || entry.isSplash) continue;
                // Skip if defender is defeated
                const defenderHp = currentHpMap[entry.targetId] - entry.amount; // approximate post-hit HP
                if (defenderHp <= 0) continue;
                const defenderBuffs = buffsMap[entry.targetId] ?? [];
                let counterMatched = false;
                for (const b of defenderBuffs) {
                  if (counterMatched) break;
                  if (!b.tags) continue;
                  for (const tag of b.tags) {
                    if (tag.type !== "counter") continue;
                    const tagCat = (tag.params.damageCategory as string) ?? "physical";
                    const tagFilter = (tag.params.filter as string) ?? "direct";
                    if (tagCat !== "any" && tagCat !== skillCat) continue;
                    if (tagFilter !== "any" && tagFilter !== attackCat) continue;
                    counterMatched = true;
                    break;
                  }
                }
                if (!counterMatched) continue;
                // Find the defender's equipped basic skill
                const defenderChar = getCharacter(entry.targetId);
                if (!defenderChar) continue;
                const dFormId = battleFormMap[entry.targetId] ?? null;
                const dResolved = resolveFormView(defenderChar, dFormId, skills, characterSkills.filter((cs) => cs.characterId === entry.targetId));
                const basicSkill = dResolved.basic;
                if (!basicSkill) continue;
                // Calculate counter damage against the original attacker
                const attackerChar = getCharacter(activeCharId);
                if (!attackerChar) continue;
                // Defender as new attacker
                const dForm = dFormId ? getFormsForCharacter(entry.targetId).find((f) => f.id === dFormId) : null;
                const dStats = applyCharLevelStats(dForm?.statOverrides ? { ...defenderChar.stats, ...dForm.statOverrides } : defenderChar.stats, characterLevelMap[defenderChar.id] ?? 0);
                const dElemDmg = dForm?.elementalDmgOverride ? { ...defenderChar.elementalDamage, ...dForm.elementalDmgOverride } : defenderChar.elementalDamage;
                const counterAttacker = { stats: dStats, elementalResistance: defenderChar.elementalResistance, elementalDamage: dElemDmg, buffs: defenderBuffs, currentHp: defenderHp, col: getCharCol(entry.targetId) };
                // Original attacker as new defender
                const aFormId = battleFormMap[activeCharId] ?? null;
                const aForm = aFormId ? getFormsForCharacter(activeCharId).find((f) => f.id === aFormId) : null;
                const aStats = applyCharLevelStats(aForm?.statOverrides ? { ...attackerChar.stats, ...aForm.statOverrides } : attackerChar.stats, characterLevelMap[attackerChar.id] ?? 0);
                const aElemResBase = aForm?.elementalResOverride ? { ...attackerChar.elementalResistance, ...aForm.elementalResOverride } : attackerChar.elementalResistance;
                const aPassiveGrants = getPassiveResistanceGrants(attackerChar, aFormId, skills, characterSkills.filter((cs) => cs.characterId === activeCharId), skillLevelMap);
                const aElemRes = applyPassiveElementalGrants(aElemResBase, aPassiveGrants);
                const counterDefender = { stats: aStats, elementalResistance: aElemRes as typeof attackerChar.elementalResistance, elementalDamage: attackerChar.elementalDamage, buffs: buffsMap[activeCharId] ?? [], currentHp: currentHpMap[activeCharId] ?? attackerChar.stats.hp, col: getCharCol(activeCharId) };
                // Determine multi-strike count for the counter user's basic skill
                let counterHits = 1;
                for (const cb of defenderBuffs) {
                  if (!cb.tags) continue;
                  for (const ct of cb.tags) {
                    if (ct.type === "multi-strike" && ct.params.skillId === basicSkill.id) {
                      const h = (ct.params.hits as number) ?? 2;
                      if (h > counterHits) counterHits = h;
                    }
                  }
                }
                let runningAttackerHp = currentHpMapRef.current[activeCharId] ?? attackerChar.stats.hp;
                for (let ci = 0; ci < counterHits; ci++) {
                  if (runningAttackerHp <= 0) break; // target already dead
                  // Independent dodge roll for the counter target (original attacker)
                  const atkBuffs = buffsMap[activeCharId] ?? [];
                  let counterDodge = 0;
                  const counterAttackCat = getAttackCategory(basicSkill.levels[0].targetType, basicSkill.levels[0].damageSourceOverride);
                  for (const ab of atkBuffs) {
                    if (!ab.tags) continue;
                    for (const at of ab.tags) {
                      if (at.type !== "dodge-chance") continue;
                      const f = (at.params.filter as string) ?? "direct";
                      if (f !== "any" && f !== counterAttackCat) continue;
                      const p = (at.params.percent as number) ?? 50;
                      if (p > counterDodge) counterDodge = p;
                    }
                  }
                  if (counterDodge > 0 && Math.random() * 100 < counterDodge) {
                    addBattleLog(`${attackerChar.name} dodged ${defenderChar.name}'s counter${counterHits > 1 ? ` (hit ${ci + 1})` : ""}! (${counterDodge}% dodge chance)`);
                    continue;
                  }
                  const updatedCounterDefender = { ...counterDefender, currentHp: runningAttackerHp };
                  const counterResult = calculateDamage(counterAttacker, updatedCounterDefender, basicSkill.levels[0]);
                  runningAttackerHp = Math.max(0, runningAttackerHp - counterResult.finalDamage);
                  setCurrentHpMap((prev) => ({ ...prev, [activeCharId]: runningAttackerHp }));
                  spawnDamageFloat(activeCharId, counterResult.finalDamage, false);
                  addBattleLog(`${defenderChar.name} counters with ${basicSkill.name}${counterHits > 1 ? ` (hit ${ci + 1})` : ""} dealing ${counterResult.finalDamage} damage to ${attackerChar.name}!`);
                  // Track battle stats for counter damage
                  addBattleStat(entry.targetId, "damageDone", counterResult.finalDamage);
                  addBattleStat(entry.targetId, "directDmg", counterResult.finalDamage);
                  addBattleStat(activeCharId, "damageTaken", counterResult.finalDamage);
                }
              }
            }
            // Close modal
            setSelectedSkill(null);
            if (skillUsed.levels[lvlIdx]?.instant && activeCharId) {
              const cid = activeCharId;
              const sid = skillUsed.id;
              setInstantUsedMap((prev) => {
                const cur = prev[cid] ?? [];
                if (cur.includes(sid)) return prev;
                return { ...prev, [cid]: [...cur, sid] };
              });
            }
            if (!skillUsed.levels[lvlIdx]?.instant && !pendingTeleport) {
              if (isLastTurn) {
                endRound();
              } else {
                nextTurn();
              }
            }
          } : undefined}
        />
      )}
    </div>
  );
}

function BattleDetailsPanel({
  characterId,
  tab,
  onTabChange,
  getCharacter,
  getSkill,
  skills,
  characterSkills,
  currentHpMap,
  charForms,
  activeFormId,
  buffs,
  skillLevelMap,
  characterLevelMap,
  onSetFormId,
  onSelectSkill,
  onSetHp,
  onAddBuff,
  onRemoveBuff,
  canAffordSkill,
  onClose,
}: {
  characterId: string;
  tab: "stats" | "skills";
  onTabChange: (tab: "stats" | "skills") => void;
  getCharacter: (id: string) => Character | undefined;
  getSkill: (id: string) => Skill | undefined;
  skills: Skill[];
  currentHpMap: Record<string, number>;
  characterSkills: CharacterSkill[];
  charForms: Form[];
  activeFormId: string | null;
  buffs: BuffDebuff[];
  skillLevelMap: Record<string, number>;
  characterLevelMap: Record<string, number>;
  onSetFormId: (formId: string) => void;
  onSelectSkill: (skill: Skill) => void;
  onSetHp: (charId: string, hp: number) => void;
  onAddBuff: (charId: string, buff: Omit<BuffDebuff, "id">) => void;
  onRemoveBuff: (charId: string, buffId: string) => void;
  canAffordSkill?: (skillId: string) => boolean;
  onClose: () => void;
}) {
  const char = getCharacter(characterId);
  if (!char) return null;

  const formId = activeFormId ?? charForms[0]?.id ?? null;
  const activeForm = charForms.find((f) => f.id === formId);
  const panelPhoto = activeForm?.photoUrl ?? char.photoUrl;
  const panelType = activeForm?.typeOverride ?? char.type;
  const panelEnergy = activeForm?.energyOverride ?? char.energyGeneration;
  const panelStatsRaw = activeForm?.statOverrides ? { ...char.stats, ...activeForm.statOverrides } : char.stats;
  const panelStats = applyCharLevelStats(panelStatsRaw, characterLevelMap[char.id] ?? 0);

  const currentHp = currentHpMap[char.id] ?? char.stats.hp;
  const maxHp = char.stats.hp;
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500";

  const passiveGrants = getPassiveResistanceGrants(char, formId, skills, characterSkills.filter((cs) => cs.characterId === char.id), skillLevelMap);
  const panelElemResBase = activeForm?.elementalResOverride ? { ...char.elementalResistance, ...activeForm.elementalResOverride } : char.elementalResistance;
  const panelElemRes = applyPassiveElementalGrants(panelElemResBase, passiveGrants);
  const panelElemDmg = activeForm?.elementalDmgOverride ? { ...char.elementalDamage, ...activeForm.elementalDmgOverride } : char.elementalDamage;

  const buffedElemRes: Record<string, number> = {};
  const buffedElemDmg: Record<string, number> = {};
  for (const elem of ELEMENTS) {
    buffedElemRes[elem] = (panelElemRes[elem] ?? 100) + getBuffModifier(buffs, `eleRes.${elem}`);
    buffedElemDmg[elem] = panelElemDmg[elem] + getBuffModifier(buffs, `eleDmg.${elem}`);
  }

  const buffedStats: Record<string, { base: number; buffed: number; modifier: number }> = {};
  for (const key of ALL_STATS) {
    const base = panelStats[key];
    const totalMod = getBuffModifier(buffs, key);
    const clamped = Math.max(-90, Math.min(200, totalMod));
    buffedStats[key] = { base, buffed: Math.round(base * (1 + clamped / 100)), modifier: totalMod };
  }

  const detailBattleState: BattleState = { buffs, currentHp, maxHp };
  const resolved = resolveFormView(char, formId, skills, characterSkills, detailBattleState);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {panelPhoto ? (
            <img src={panelPhoto} alt={char.name} className="w-12 h-12 rounded-lg object-cover border border-gray-700" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-lg font-bold text-gray-600">{char.name.charAt(0)}</div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white">{char.name}</h3>
              <span className="text-[10px] text-gray-500">{panelType}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${hpColor} rounded-full`} style={{ width: `${hpPct}%` }} />
              </div>
              <span className="text-[10px] text-gray-400 tabular-nums">{currentHp}/{maxHp}</span>
              <div className="flex gap-0.5 ml-1">
                {panelEnergy.map((eg) => Array.from({ length: eg.amount }).map((_, j) => (
                  <EnergyBadge key={`${eg.color}-${j}`} color={eg.color} />
                )))}
              </div>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">×</button>
      </div>

      {/* Form switcher */}
      {charForms.length > 1 && (
        <div className="flex gap-1">
          {charForms.map((f) => (
            <button key={f.id} onClick={() => onSetFormId(f.id)} className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${formId === f.id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Active buffs/debuffs summary (always visible) */}
      {buffs.length > 0 && (
        <div className="space-y-1">
          <span className="text-[9px] text-gray-500 uppercase font-medium">Active Effects</span>
          <div className="flex flex-wrap gap-1">
            {buffs.map((b) => {
              const color = b.category === "buff" ? "bg-green-800/50 border-green-600/40 text-green-300"
                : b.category === "debuff" ? "bg-red-800/50 border-red-600/40 text-red-300"
                : "bg-purple-800/50 border-purple-600/40 text-purple-300";
              return (
                <span key={b.id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${color}`} title={`${b.effectName}: ${b.modifier > 0 ? "+" : ""}${b.modifier}% ${b.stats.join(", ")} | ${b.duration === -1 ? "permanent" : b.untilNextTurn ? "until next turn" : `${b.duration}t`}${b.stacks && b.stacks > 1 ? ` x${b.stacks}` : ""}`}>
                  {b.effectName}
                  {b.stacks && b.stacks > 1 && <span className="text-[8px] opacity-70">x{b.stacks}</span>}
                  {b.duration > 0 && !b.untilNextTurn && <span className="text-[8px] opacity-50">{b.duration}t</span>}
                  {b.duration === -1 && <span className="text-[8px] opacity-50">perm</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-800 pb-1">
        <button onClick={() => onTabChange("stats")} className={`text-xs px-3 py-1 rounded-t font-medium transition-colors ${tab === "stats" ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}>
          Stats & Resistances
        </button>
        <button onClick={() => onTabChange("skills")} className={`text-xs px-3 py-1 rounded-t font-medium transition-colors ${tab === "skills" ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"}`}>
          Skills
        </button>
      </div>

      {tab === "stats" ? (
        <div className="space-y-3">
          {/* HP controls */}
          <div className="flex items-center gap-1">
            <button onClick={() => onSetHp(char.id, Math.max(0, currentHp - 10))} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400">-10</button>
            <button onClick={() => onSetHp(char.id, Math.max(0, currentHp - 1))} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400">-1</button>
            <span className="text-xs font-bold text-white tabular-nums mx-1">{currentHp} / {maxHp}</span>
            <button onClick={() => onSetHp(char.id, Math.min(maxHp, currentHp + 1))} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400">+1</button>
            <button onClick={() => onSetHp(char.id, Math.min(maxHp, currentHp + 10))} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400">+10</button>
          </div>

          {/* Stats */}
          <div>
            <span className="text-gray-500 font-medium text-[10px] uppercase">Stats</span>
            <div className="grid grid-cols-5 gap-1.5 mt-1">
              {(["atk", "mAtk", "def", "spi", "spd"] as const).map((key) => {
                const { base, buffed, modifier } = buffedStats[key];
                const formOverridden = panelStats[key] !== char.stats[key];
                const hasBuffMod = modifier !== 0;
                return (
                  <div key={key} className="text-center bg-gray-800 rounded p-1">
                    <div className="text-[9px] uppercase text-gray-500">{key}</div>
                    <div className={`text-sm font-bold ${hasBuffMod ? modifier > 0 ? "text-green-400" : "text-red-400" : formOverridden ? panelStats[key] > char.stats[key] ? "text-green-400" : "text-red-400" : "text-white"}`}>
                      {hasBuffMod ? buffed : base}
                    </div>
                    {hasBuffMod && <div className={`text-[8px] ${modifier > 0 ? "text-green-500" : "text-red-500"}`}>{modifier > 0 ? "+" : ""}{modifier}%</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Elemental */}
          <div>
            <span className="text-gray-500 font-medium text-[10px] uppercase">Elemental</span>
            <div className="grid grid-cols-7 gap-1 mt-1">
              {ELEMENTS.map((elem) => {
                const res = buffedElemRes[elem]; const dmg = buffedElemDmg[elem];
                const baseRes = panelElemRes[elem]; const baseDmg = panelElemDmg[elem];
                return (
                  <div key={elem} className="text-center bg-gray-800 rounded p-1">
                    <div className="text-[9px]">{ELEMENT_ICONS[elem]}</div>
                    <div className={`text-[10px] font-bold ${res !== baseRes ? res > baseRes ? "text-green-400" : "text-red-400" : res < 100 ? "text-red-400" : res > 100 ? "text-green-400" : "text-gray-400"}`}>{res}%</div>
                    <div className="text-[7px] text-gray-600 -mt-0.5">res</div>
                    <div className={`text-[10px] font-bold ${dmg !== baseDmg ? dmg > baseDmg ? "text-blue-400" : "text-orange-400" : dmg > 100 ? "text-blue-400" : dmg < 100 ? "text-orange-400" : "text-gray-400"}`}>{dmg}%</div>
                    <div className="text-[7px] text-gray-600 -mt-0.5">dmg</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Damage type resistances */}
          {(() => {
            const dmgTypes = [
              { key: "dmgCatRes.physical", label: "Physical", icon: "⚔️" },
              { key: "dmgCatRes.magical", label: "Magical", icon: "🔮" },
              { key: "dmgSrcRes.direct", label: "Direct", icon: "🎯" },
              { key: "dmgSrcRes.indirect", label: "Indirect", icon: "💫" },
              { key: "dmgSrcRes.aoe", label: "AOE", icon: "💥" },
            ];
            const values = dmgTypes.map((dt) => {
              const mod = getBuffModifier(buffs, dt.key);
              return { ...dt, value: 100 + mod, mod };
            });
            return (
              <div>
                <span className="text-gray-500 font-medium text-[10px] uppercase">Damage Resistances</span>
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {values.map((dt) => (
                    <div key={dt.key} className="text-center bg-gray-800 rounded p-1">
                      <div className="text-[9px]">{dt.icon}</div>
                      <div className={`text-[10px] font-bold ${dt.mod > 0 ? "text-green-400" : dt.mod < 0 ? "text-red-400" : "text-gray-400"}`}>{dt.value}%</div>
                      <div className="text-[7px] text-gray-600 -mt-0.5">{dt.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Status Resistance */}
          <StatusResistanceDisplay characterId={characterId} getCharacter={getCharacter} activeForm={charForms.find((f) => f.id === (activeFormId ?? charForms[0]?.id))} passiveGrants={passiveGrants} />

          {/* Buffs */}
          <BuffDebuffSection characterId={characterId} buffs={buffs} onAdd={(buff) => onAddBuff(characterId, buff)} onRemove={(buffId) => onRemoveBuff(characterId, buffId)} />
        </div>
      ) : (
        <div className="space-y-2">
          {/* Innate */}
          {resolved.innate && (
            <button onClick={() => onSelectSkill(resolved.innate!)} className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 border border-transparent hover:border-gray-600 transition-colors">
              <div className="text-[9px] text-purple-400 uppercase font-medium">Innate</div>
              <span className="text-sm font-semibold text-white">{resolved.innate.name}</span>
              {resolved.innate.description && <p className="text-xs text-gray-400 mt-0.5">{resolved.innate.description}</p>}
            </button>
          )}
          {/* Basic */}
          {resolved.basic && (() => {
            const affordable = canAffordSkill ? canAffordSkill(resolved.basic!.id) : true;
            return (
              <button onClick={() => onSelectSkill(resolved.basic!)} className={`w-full text-left rounded p-2 border transition-colors ${affordable ? "bg-gray-800 hover:bg-gray-700 border-transparent hover:border-gray-600" : "bg-gray-900/50 border-gray-800/50 opacity-50"}`}>
                <div className="text-[9px] text-blue-400 uppercase font-medium">Basic</div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${affordable ? "text-white" : "text-gray-500"}`}>{resolved.basic!.name}</span>
                  {resolved.basic!.levels[0].cost.length > 0 && <EnergyCostDisplay cost={resolved.basic!.levels[0].cost} />}
                  {!affordable && <span className="text-[8px] text-red-400/70">No energy</span>}
                </div>
                {resolved.basic!.description && <p className="text-xs text-gray-400 mt-0.5">{resolved.basic!.description}</p>}
              </button>
            );
          })()}
          {/* Abilities */}
          {resolved.abilities.map((skill) => {
            const affordable = canAffordSkill ? canAffordSkill(skill.id) : true;
            return (
              <button key={skill.id} onClick={() => onSelectSkill(skill)} className={`w-full text-left rounded p-2 border transition-colors ${affordable ? "bg-gray-800 hover:bg-gray-700 border-transparent hover:border-gray-600" : "bg-gray-900/50 border-gray-800/50 opacity-50"}`}>
                <div className="text-[9px] text-green-400 uppercase font-medium">Ability</div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${affordable ? "text-white" : "text-gray-500"}`}>{skill.name}</span>
                  {skill.levels[0].cost.length > 0 && <EnergyCostDisplay cost={skill.levels[0].cost} />}
                  {!affordable && <span className="text-[8px] text-red-400/70">No energy</span>}
                </div>
                {skill.description && <p className="text-xs text-gray-400 mt-0.5">{skill.description}</p>}
              </button>
            );
          })}
          {/* Conditionals */}
          {resolved.conditionals.map((skill) => {
            const affordable = canAffordSkill ? canAffordSkill(skill.id) : true;
            return (
            <button key={skill.id} onClick={() => onSelectSkill(skill)} className={`w-full text-left rounded p-2 border transition-colors ${affordable ? "bg-amber-900/20 hover:bg-amber-900/30 border-amber-700/30 hover:border-amber-600/50" : "bg-gray-900/50 border-gray-800/50 opacity-50"}`}>
              <div className="flex items-center gap-2">
                <div className="text-[9px] text-amber-400 uppercase font-medium">Conditional</div>
                <span className="text-[10px] text-amber-400/70">Auto</span>
              </div>
              <span className="text-sm font-semibold text-amber-200">{skill.name}</span>
              {skill.description && <p className="text-xs text-gray-400 mt-0.5">{skill.description}</p>}
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BattleSidePanel({
  characterId,
  isActive,
  getCharacter,
  getSkill,
  skills,
  characterSkills,
  currentHpMap,
  charForms,
  activeFormId,
  buffs,
  characterLevel,
  onSetFormId,
  onSelectSkill,
  onSetHp,
  onAddBuff,
  onRemoveBuff,
}: {
  characterId: string;
  isActive: boolean;
  getCharacter: (id: string) => Character | undefined;
  getSkill: (id: string) => Skill | undefined;
  skills: Skill[];
  characterSkills: CharacterSkill[];
  currentHpMap: Record<string, number>;
  charForms: Form[];
  buffs: BuffDebuff[];
  activeFormId: string | null;
  characterLevel?: number;
  onSetFormId: (formId: string) => void;
  onSelectSkill: (skill: Skill) => void;
  onSetHp: (charId: string, hp: number) => void;
  onAddBuff: (charId: string, buff: Omit<BuffDebuff, "id">) => void;
  onRemoveBuff: (charId: string, buffId: string) => void;
}) {
  const char = getCharacter(characterId);
  if (!char) return null;

  const currentHp = currentHpMap[char.id] ?? char.stats.hp;
  const maxHp = char.stats.hp;
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500";

  const formId = activeFormId ?? charForms[0]?.id ?? null;
  const activeForm = charForms.find((f) => f.id === formId);
  const panelPhoto = activeForm?.photoUrl ?? char.photoUrl;
  const panelType = activeForm?.typeOverride ?? char.type;
  const panelEnergy = activeForm?.energyOverride ?? char.energyGeneration;
  const panelStatsRaw = activeForm?.statOverrides
    ? { ...char.stats, ...activeForm.statOverrides }
    : char.stats;
  const panelStats = applyCharLevelStats(panelStatsRaw, characterLevel ?? 0);

  // Compute buffed stats for display
  const buffedStats = (() => {
    const result: Record<string, { base: number; buffed: number; modifier: number }> = {};
    for (const key of ALL_STATS) {
      const base = panelStats[key];
      const totalMod = getBuffModifier(buffs, key);
      const clamped = Math.max(-90, Math.min(200, totalMod));
      result[key] = {
        base,
        buffed: Math.round(base * (1 + clamped / 100)),
        modifier: totalMod,
      };
    }
    return result;
  })();

  // Resolved elemental values (form overrides + buff modifiers)
  const panelElemRes = activeForm?.elementalResOverride
    ? { ...char.elementalResistance, ...activeForm.elementalResOverride }
    : char.elementalResistance;
  const panelElemDmg = activeForm?.elementalDmgOverride
    ? { ...char.elementalDamage, ...activeForm.elementalDmgOverride }
    : char.elementalDamage;

  // Apply elemental buffs
  const buffedElemRes: Record<string, number> = {};
  const buffedElemDmg: Record<string, number> = {};
  for (const elem of ELEMENTS) {
    buffedElemRes[elem] = panelElemRes[elem] + getBuffModifier(buffs, `eleRes.${elem}`);
    buffedElemDmg[elem] = panelElemDmg[elem] + getBuffModifier(buffs, `eleDmg.${elem}`);
  }

  const battleState: BattleState = {
    buffs,
    currentHp: currentHpMap[char.id] ?? char.stats.hp,
    maxHp: char.stats.hp,
  };
  const resolved = resolveFormView(char, formId, skills, characterSkills, battleState);
  const equippedInnate = resolved.innate;
  const equippedBasic = resolved.basic;
  const equippedAbilities = resolved.abilities;
  const activeConditionals = resolved.conditionals;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {panelPhoto ? (
          <img
            src={panelPhoto}
            alt={char.name}
            className="w-14 h-14 rounded-lg object-cover border border-gray-700"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-xl font-bold text-gray-600">
            {char.name.charAt(0)}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white">{char.name}</h3>
            {isActive && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-300 font-bold px-1.5 py-0.5 rounded uppercase">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
            {char.series && <span>{char.series}</span>}
            {char.series && <span className="text-gray-600">·</span>}
            <span>{panelType}</span>
          </div>
          <div className="flex gap-0.5 mt-1">
            {panelEnergy.map((eg) =>
              Array.from({ length: eg.amount }).map((_, j) => (
                <EnergyBadge key={`${eg.color}-${j}`} color={eg.color} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Form Switcher */}
      {charForms.length > 1 && (
        <div className="flex gap-1">
          {charForms.map((f) => (
            <button
              key={f.id}
              onClick={() => onSetFormId(f.id)}
              className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                formId === f.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-gray-200"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* HP Bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-500 font-medium text-[10px] uppercase">HP</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSetHp(char.id, Math.max(0, currentHp - 10))}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
            >
              -10
            </button>
            <button
              onClick={() => onSetHp(char.id, Math.max(0, currentHp - 1))}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
            >
              -1
            </button>
            <span className="text-xs font-bold text-white tabular-nums mx-1">
              {currentHp} / {maxHp}
            </span>
            <button
              onClick={() => onSetHp(char.id, Math.min(maxHp, currentHp + 1))}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
            >
              +1
            </button>
            <button
              onClick={() => onSetHp(char.id, Math.min(maxHp, currentHp + 10))}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
            >
              +10
            </button>
          </div>
        </div>
        <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${hpColor} transition-all duration-300 rounded-full`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {char.summary && (
        <p className="text-xs text-gray-400 italic">{char.summary}</p>
      )}

      {/* Stats */}
      <div>
        <span className="text-gray-500 font-medium text-[10px] uppercase">Stats</span>
        <div className="grid grid-cols-5 gap-1.5 mt-1">
          {(["atk", "mAtk", "def", "spi", "spd"] as const).map((key) => {
            const { base, buffed, modifier } = buffedStats[key];
            const formOverridden = panelStats[key] !== char.stats[key];
            const hasBuffMod = modifier !== 0;
            return (
            <div key={key} className="text-center bg-gray-800 rounded p-1">
              <div className="text-[9px] uppercase text-gray-500">{key}</div>
              <div className={`text-sm font-bold ${
                hasBuffMod
                  ? modifier > 0 ? "text-green-400" : "text-red-400"
                  : formOverridden
                  ? panelStats[key] > char.stats[key] ? "text-green-400" : "text-red-400"
                  : "text-white"
              }`}>
                {hasBuffMod ? buffed : base}
              </div>
              {hasBuffMod && (
                <div className={`text-[8px] ${modifier > 0 ? "text-green-500" : "text-red-500"}`}>
                  {modifier > 0 ? "+" : ""}{modifier}%
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Elemental */}
      <div>
        <span className="text-gray-500 font-medium text-[10px] uppercase">Elemental</span>
        <div className="grid grid-cols-7 gap-1 mt-1">
          {ELEMENTS.map((elem) => {
            const res = buffedElemRes[elem];
            const dmg = buffedElemDmg[elem];
            const baseRes = panelElemRes[elem];
            const baseDmg = panelElemDmg[elem];
            const resBuffed = res !== baseRes;
            const dmgBuffed = dmg !== baseDmg;
            return (
              <div key={elem} className="text-center bg-gray-800 rounded p-1">
                <div className="text-[9px]">{ELEMENT_ICONS[elem]}</div>
                <div className={`text-[10px] font-bold ${
                  resBuffed
                    ? res > baseRes ? "text-green-400" : "text-red-400"
                    : res < 100 ? "text-red-400" : res > 100 ? "text-green-400" : "text-gray-400"
                }`}>
                  {res}%
                </div>
                <div className="text-[7px] text-gray-600 -mt-0.5">res</div>
                <div className={`text-[10px] font-bold ${
                  dmgBuffed
                    ? dmg > baseDmg ? "text-blue-400" : "text-orange-400"
                    : dmg > 100 ? "text-blue-400" : dmg < 100 ? "text-orange-400" : "text-gray-400"
                }`}>
                  {dmg}%
                </div>
                <div className="text-[7px] text-gray-600 -mt-0.5">dmg</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Damage Type Resistances */}
      {(() => {
        const dmgTypes = [
          { key: "dmgCatRes.physical", label: "Physical", icon: "⚔️" },
          { key: "dmgCatRes.magical", label: "Magical", icon: "🔮" },
          { key: "dmgSrcRes.direct", label: "Direct", icon: "🎯" },
          { key: "dmgSrcRes.indirect", label: "Indirect", icon: "💫" },
          { key: "dmgSrcRes.aoe", label: "AOE", icon: "💥" },
        ];
        const values = dmgTypes.map((dt) => {
          const mod = getBuffModifier(buffs, dt.key);
          return { ...dt, value: 100 + mod, mod };
        });
        return (
          <div>
            <span className="text-gray-500 font-medium text-[10px] uppercase">Damage Resistances</span>
            <div className="grid grid-cols-5 gap-1 mt-1">
              {values.map((dt) => (
                <div key={dt.key} className="text-center bg-gray-800 rounded p-1">
                  <div className="text-[9px]">{dt.icon}</div>
                  <div className={`text-[10px] font-bold ${
                    dt.mod > 0 ? "text-green-400" : dt.mod < 0 ? "text-red-400" : "text-gray-400"
                  }`}>
                    {dt.value}%
                  </div>
                  <div className="text-[7px] text-gray-600 -mt-0.5">{dt.label}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Status Resistance */}
      <StatusResistanceDisplay characterId={characterId} getCharacter={getCharacter} activeForm={activeForm} passiveGrants={getPassiveResistanceGrants(char, formId, skills, characterSkills.filter((cs) => cs.characterId === characterId), {})} />

      {/* Innate */}
      <div>
        <span className="text-gray-500 font-medium text-[10px] uppercase">Innate</span>
        {equippedInnate ? (
          <button
            onClick={() => onSelectSkill(equippedInnate)}
            className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 mt-1 border border-transparent hover:border-gray-600 transition-colors"
          >
            <span className="text-sm font-semibold text-white">{equippedInnate.name}</span>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {equippedInnate.description || equippedInnate.levels[0].description ? <GlossaryText text={equippedInnate.description || equippedInnate.levels[0].description} /> : "(no description)"}
            </p>
          </button>
        ) : (
          <p className="text-xs text-gray-500 mt-1">None equipped</p>
        )}
      </div>

      {/* Basic */}
      <div>
        <span className="text-gray-500 font-medium text-[10px] uppercase">Basic</span>
        {equippedBasic ? (
          <button
            onClick={() => onSelectSkill(equippedBasic)}
            className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 mt-1 border border-transparent hover:border-gray-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{equippedBasic.name}</span>
              <EnergyCostDisplay cost={equippedBasic.levels[0].cost} />
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {equippedBasic.description || equippedBasic.levels[0].description ? <GlossaryText text={equippedBasic.description || equippedBasic.levels[0].description} /> : "(no description)"}
            </p>
          </button>
        ) : (
          <p className="text-xs text-gray-500 mt-1">None equipped</p>
        )}
      </div>

      {/* Abilities (equipped + active conditionals merged) */}
      <div>
        {(() => {
          const allAbilities = [...equippedAbilities, ...activeConditionals];
          return (
            <>
              <span className="text-gray-500 font-medium text-[10px] uppercase">
                Abilities ({allAbilities.length})
              </span>
              {allAbilities.length === 0 ? (
                <p className="text-xs text-gray-500 mt-1">None equipped</p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  {allAbilities.map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => onSelectSkill(skill)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 border border-transparent hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {skill.name}
                        </span>
                        <RangeTagIcons tags={skill.levels[0].rangeTags} />
                        {skill.levels[0].cost.length > 0 && (
                          <EnergyCostDisplay cost={skill.levels[0].cost} />
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {skill.description || skill.levels[0].description ? <GlossaryText text={skill.description || skill.levels[0].description} /> : "(no description)"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </div>
      {/* Buffs / Debuffs */}
      <BuffDebuffSection
        characterId={characterId}
        buffs={buffs}
        onAdd={(buff) => onAddBuff(characterId, buff)}
        onRemove={(buffId) => onRemoveBuff(characterId, buffId)}
      />
    </div>
  );
}

function BuffDebuffSection({
  characterId,
  buffs,
  onAdd,
  onRemove,
}: {
  characterId: string;
  buffs: BuffDebuff[];
  onAdd: (buff: Omit<BuffDebuff, "id">) => void;
  onRemove: (buffId: string) => void;
}) {
  const { statusEffects } = useStore();
  const [adding, setAdding] = useState(false);
  const [selectedEffectId, setSelectedEffectId] = useState("");
  const [newModifier, setNewModifier] = useState(20);
  const [newDuration, setNewDuration] = useState(3);
  const [newSource, setNewSource] = useState("");

  const selectedEffect = statusEffects.find((se) => se.id === selectedEffectId);

  // When effect changes, pre-fill modifier from default
  const handleEffectChange = (effectId: string) => {
    setSelectedEffectId(effectId);
    const eff = statusEffects.find((se) => se.id === effectId);
    if (eff?.defaultModifier !== undefined) setNewModifier(eff.defaultModifier);
  };

  const buffEffects = statusEffects.filter((se) => se.category === "buff");
  const debuffEffects = statusEffects.filter((se) => se.category === "debuff");
  const statusOnlyEffects = statusEffects.filter((se) => se.category === "status");

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-gray-500 font-medium text-[10px] uppercase">
          Buffs / Debuffs ({buffs.length})
        </span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            + Add
          </button>
        )}
      </div>

      {buffs.length === 0 && !adding && (
        <p className="text-[10px] text-gray-600 mt-1">None active</p>
      )}

      {buffs.length > 0 && (
        <div className="mt-1 space-y-1">
          {buffs.map((b) => {
            const se = statusEffects.find((s) => s.id === b.effectId);
            const nonDispellable = se?.dispellable === false;
            return (
            <div key={b.id} className="flex items-center gap-1.5 text-[11px] bg-gray-800/50 rounded px-2 py-1">
              <span className={`font-bold ${b.category === "buff" ? "text-green-400" : b.category === "status" ? "text-yellow-400" : "text-red-400"}`}>
                {b.effectName}
              </span>
              {nonDispellable && (
                <span className="text-[10px] text-gray-500" title="Non-dispellable — cannot be removed by dispel effects">🔒</span>
              )}
              {!b.stats.includes("none") && b.stats.length > 0 && (
                <span className="text-gray-400">
                  {b.modifier > 0 ? "+" : ""}{b.modifier}%{(b.stacks ?? 1) > 1 ? ` x${b.stacks}` : ""}
                </span>
              )}
              <span className="text-gray-600">
                {b.duration < 0 ? "∞" : `${b.duration}t`}
              </span>
              {b.source && <span className="text-gray-600 truncate text-[9px]">({b.source})</span>}
              {b.stackable && <span className="text-[8px] text-purple-400 uppercase">stack {b.stacks ?? 1}/{b.maxStacks ?? "∞"}</span>}
              <button
                onClick={() => onRemove(b.id)}
                className="ml-auto text-gray-600 hover:text-red-400 text-[10px]"
              >
                x
              </button>
            </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="mt-2 bg-gray-800 rounded p-2 space-y-2">
          {statusEffects.length === 0 && (
            <p className="text-[10px] text-gray-500">No status effects defined. Create them in /config.</p>
          )}
          <select
            className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
            value={selectedEffectId}
            onChange={(e) => handleEffectChange(e.target.value)}
          >
            <option value="">Select status effect...</option>
            {buffEffects.length > 0 && (
              <optgroup label="Buffs">
                {buffEffects.map((se) => (
                  <option key={se.id} value={se.id}>{se.name}</option>
                ))}
              </optgroup>
            )}
            {debuffEffects.length > 0 && (
              <optgroup label="Debuffs">
                {debuffEffects.map((se) => (
                  <option key={se.id} value={se.id}>{se.name}</option>
                ))}
              </optgroup>
            )}
            {statusOnlyEffects.length > 0 && (
              <optgroup label="Statuses">
                {statusOnlyEffects.map((se) => (
                  <option key={se.id} value={se.id}>{se.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          {selectedEffect && (
            <div className="flex gap-1.5">
              {!selectedEffect.stats.includes("none") && selectedEffect.stats.length > 0 && (
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  Modifier %
                  <input
                    type="number"
                    className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                    value={newModifier}
                    onChange={(e) => setNewModifier(parseInt(e.target.value) || 0)}
                  />
                </label>
              )}
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                Duration
                <input
                  type="number"
                  className="w-10 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                  value={newDuration}
                  onChange={(e) => setNewDuration(parseInt(e.target.value) || 0)}
                  title="Turns (-1 = permanent)"
                />
              </label>
            </div>
          )}
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            placeholder="Source skill (e.g. Saintly Wall Lv2)"
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                if (!selectedEffect) return;
                const buff: Omit<BuffDebuff, "id"> = {
                  effectId: selectedEffect.id,
                  effectName: selectedEffect.name,
                  category: selectedEffect.category,
                  stats: selectedEffect.stats,
                  modifier: !selectedEffect.stats.includes("none") && selectedEffect.stats.length > 0 ? newModifier : 0,
                  duration: newDuration,
                  source: newSource || selectedEffect.name,
                  ...(selectedEffect.stackable ? {
                    stackable: true,
                    maxStacks: selectedEffect.maxStacks,
                    stacks: 1,
                    ...(selectedEffect.onMaxStacks ? { onMaxStacks: selectedEffect.onMaxStacks } : {}),
                  } : {}),
                };
                onAdd(buff);
                setAdding(false);
                setNewSource("");
                setSelectedEffectId("");
              }}
              disabled={!selectedEffectId}
              className="text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setSelectedEffectId(""); }}
              className="text-[10px] px-2 py-1 rounded bg-gray-700 text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CharacterDetailPanel({
  characterId,
  getCharacter,
  skills,
  characterSkills,
  isPlaced,
  charForms,
  selectedFormId,
  onSelectForm,
  onClose,
  onSelectSkill,
  onToggleEquip,
}: {
  characterId: string;
  getCharacter: (id: string) => Character | undefined;
  skills: Skill[];
  characterSkills: CharacterSkill[];
  isPlaced: boolean;
  charForms: Form[];
  selectedFormId?: string;
  onSelectForm?: (formId: string) => void;
  onClose: () => void;
  onSelectSkill: (skill: Skill) => void;
  onToggleEquip: (charId: string, skillId: string) => void;
}) {
  const char = getCharacter(characterId);
  if (!char) return null;

  // Resolve active form
  const activeFormId = selectedFormId ?? charForms.find((f) => f.startable !== false)?.id ?? charForms[0]?.id ?? null;
  const activeForm = charForms.find((f) => f.id === activeFormId);
  const displayPhoto = activeForm?.photoUrl ?? char.photoUrl;
  const displayType = activeForm?.typeOverride ?? char.type;
  const displayEnergy = activeForm?.energyOverride ?? char.energyGeneration;
  const displayStats = activeForm?.statOverrides ? { ...char.stats, ...activeForm.statOverrides } : char.stats;

  const lo = char.equippedLoadout;
  const charAssigns = characterSkills.filter((cs) => cs.characterId === characterId);
  // Filter skills by form — only show skills available in the active form
  const formFilteredAssigns = charAssigns.filter((cs) => cs.formId === null || cs.formId === activeFormId);
  // Hide status-conditional variants (e.g. Flamestrike/Froststrike/Sparkstrike) — only the base
  // skill of a variant group is equippable; the variants swap in automatically when their
  // status condition is met.
  const equippableAssigns = formFilteredAssigns.filter((cs) => !cs.statusConditionId);
  const formSkillIds = new Set(equippableAssigns.map((cs) => cs.skillId));
  const baseSkills = skills.filter(
    (s) => formSkillIds.has(s.id) && s.skillType !== "conditional"
  );
  const isSkillEquipped = (skill: Skill) => {
    if (skill.skillType === "innate") return lo.innateId === skill.id;
    if (skill.skillType === "basic") return lo.basicId === skill.id;
    return lo.abilityIds.includes(skill.id);
  };
  const canEquipMore = (type: string) => {
    if (type === "innate") return !lo.innateId;
    if (type === "basic") return !lo.basicId;
    return lo.abilityIds.length < 3;
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {displayPhoto ? (
            <img
              src={displayPhoto}
              alt={char.name}
              className="w-12 h-12 rounded-lg object-cover border border-gray-700"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-lg font-bold text-gray-600">
              {char.name.charAt(0)}
            </div>
          )}
          <div>
            <h3 className="font-bold text-white text-lg">{char.name}</h3>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {char.series && <span>{char.series}</span>}
              {char.series && <span className="text-gray-600">·</span>}
              <span>{displayType}</span>
              <span className="text-gray-600">·</span>
              <span className="inline-flex gap-0.5">
                {displayEnergy.map((eg) =>
                  Array.from({ length: eg.amount }).map((_, j) => (
                    <EnergyBadge key={`${eg.color}-${j}`} color={eg.color} />
                  ))
                )}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
        >
          Close
        </button>
      </div>

      {char.summary && (
        <p className="text-sm text-gray-400 italic">{char.summary}</p>
      )}

      {/* Starting Form selector */}
      {onSelectForm && charForms.filter((f) => f.startable !== false).length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase font-medium">Starting Form:</span>
          <div className="flex gap-1">
            {charForms.filter((f) => f.startable !== false).map((f) => (
              <button
                key={f.id}
                onClick={() => onSelectForm(f.id)}
                className={`text-[11px] px-2 py-1 rounded font-medium transition-colors ${
                  (selectedFormId ?? charForms.find((ff) => ff.startable !== false)?.id) === f.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-6 gap-2 max-w-sm">
        {(["hp", "atk", "mAtk", "def", "spi", "spd"] as const).map((key) => {
          const base = char.stats[key];
          const display = displayStats[key];
          const isOverridden = key !== "hp" && display !== base;
          return (
            <div key={key} className="text-center bg-gray-800 rounded p-1.5">
              <div className="text-[10px] uppercase text-gray-500">{key}</div>
              <div className={`text-sm font-bold ${isOverridden ? display > base ? "text-green-400" : "text-red-400" : "text-white"}`}>{display}</div>
            </div>
          );
        })}
      </div>

      {/* Skills */}
      {(["innate", "basic", "ability"] as const).map((type) => {
        const typeSkills = baseSkills.filter((s) => s.skillType === type);
        const label = type === "innate" ? "Innate" : type === "basic" ? "Basic" : "Abilities";
        const eqCount = type === "ability" ? lo.abilityIds.length : (type === "innate" ? (lo.innateId ? 1 : 0) : (lo.basicId ? 1 : 0));
        const maxEquip = type === "ability" ? 3 : 1;

        return (
          <div key={type}>
            <span className="text-gray-500 font-medium text-xs uppercase">
              {label} ({eqCount}/{maxEquip})
            </span>
            {typeSkills.length === 0 ? (
              <p className="text-xs text-gray-500 mt-1">None available</p>
            ) : (
              <div className="mt-1 space-y-1.5">
                {typeSkills.map((skill) => {
                  const equipped = isSkillEquipped(skill);
                  const canEquip = canEquipMore(type);
                  return (
                    <div key={skill.id}
                      className={`flex items-center gap-2 rounded p-2 border transition-colors ${equipped ? "bg-gray-800 border-blue-500/50" : "bg-gray-800/50 border-gray-700"}`}>
                      <button onClick={() => onSelectSkill(skill)} className="flex-1 text-left flex items-center gap-2 min-w-0">
                        <span className={`text-sm font-medium truncate ${equipped ? "text-white" : "text-gray-400"}`}>{skill.name}</span>
                        {skill.levels[0].cost.length > 0 && <EnergyCostDisplay cost={skill.levels[0].cost} />}
                        {equipped && <span className="text-[10px] text-blue-400 font-medium uppercase shrink-0">Equipped</span>}
                      </button>
                      <button
                        onClick={() => onToggleEquip(characterId, skill.id)}
                        disabled={!equipped && !canEquip}
                        className={`text-xs px-2 py-1 rounded shrink-0 ${equipped ? "bg-blue-600 hover:bg-blue-500 text-white" : canEquip ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-800 text-gray-600 cursor-not-allowed"}`}>
                        {equipped ? "Unequip" : "Equip"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkillModal({
  skill,
  allSkills,
  forms,
  templateActions,
  templates,
  attackerChar,
  teams: modalTeams,
  getCharacterFn,
  buffsMap,
  battleFormMap,
  getFormsForCharacter,
  currentHpMap,
  skillLevelMap,
  characterLevelMap: modalCharLevelMap,
  levelingMode,
  onClose,
  onViewSkill,
  onApplyDamage,
  onApplyAndUse,
  canAfford,
  stolenEnergyByChar,
  teamEnergy,
  attackerSide,
}: {
  skill: Skill;
  allSkills: Skill[];
  forms: Form[];
  templateActions: TemplateAction[];
  templates: SkillTemplate[];
  attackerChar?: Character;
  teams?: Team[];
  getCharacterFn?: (id: string) => Character | undefined;
  buffsMap?: Record<string, BuffDebuff[]>;
  battleFormMap?: Record<string, string>;
  getFormsForCharacter?: (charId: string) => Form[];
  onClose: () => void;
  onViewSkill: (skill: Skill) => void;
  currentHpMap?: Record<string, number>;
  skillLevelMap?: Record<string, number>;
  characterLevelMap?: Record<string, number>;
  levelingMode?: boolean;
  onApplyDamage?: (targetId: string, newHp: number) => void;
  onApplyAndUse?: (targets: { targetId: string; newHp: number; amount: number; isHealing: boolean; category?: string; element?: string | null; isSplash?: boolean }[], skill: Skill, opts?: { variableRepeats?: number; variableColor?: EnergyColor; variableSpend?: Partial<Record<EnergyColor, number>>; chosenPoolEffects?: SkillEffect[] }) => void;
  canAfford?: boolean;
  stolenEnergyByChar?: Record<string, number>;
  teamEnergy?: Record<string, Partial<Record<EnergyColor | "rainbow", number>>>;
  attackerSide?: string;
}) {
  const { characterSkills: modalCharSkills } = useStore();
  const [previewTargetId, setPreviewTargetId] = useState<string>("");
  // Player choices for chooseEffectPools: poolIndex -> selected effect indices
  const [poolChoices, setPoolChoices] = useState<Record<number, number[]>>({});
  const currentSkillLevel = skillLevelMap?.[skill.id] ?? 1;
  const [previewLevel, setPreviewLevel] = useState(currentSkillLevel - 1);
  const [variableRepeats, setVariableRepeats] = useState(1);
  const [variableColor, setVariableColor] = useState<EnergyColor>("red");
  const [variableSpend, setVariableSpend] = useState<Partial<Record<EnergyColor, number>>>({});
  // Block Apply buttons when an "any"-color variable-repeat skill has no energy selected
  const _vrLevel = skill.levels[skillLevelMap ? currentSkillLevel - 1 : previewLevel];
  const _variableAnyBlocked = !!_vrLevel?.variableRepeat && _vrLevel.variableRepeat.color === "any" && Object.values(variableSpend).reduce((s, n) => s + (n ?? 0), 0) === 0;
  const getTemplateForLevel = (levelIdx: number) => {
    const tid = skill.levels[levelIdx]?.templateId;
    if (!tid) return null;
    return templates.find((t) => t.id === tid) ?? null;
  };
  const getActionsForLevel = (levelIdx: number) => {
    const tid = skill.levels[levelIdx]?.templateId;
    if (!tid) return [];
    return templateActions.filter((a) => a.templateId === tid).sort((a, b) => a.sortOrder - b.sortOrder);
  };
  const hasAnyTemplate = skill.levels.some((lv) => lv.templateId);
  const variants: Skill[] = [];

  const getForm = (formId: string | null) => {
    if (!formId) return null;
    return forms.find((f) => f.id === formId) ?? null;
  };

  const FormTag = ({ formId }: { formId: string | null }) => {
    if (!formId) return <span className="text-gray-300 font-medium">All Forms</span>;
    const form = getForm(formId);
    if (!form) return <span className="text-gray-300 font-medium">Unknown</span>;
    // Use glossary tooltip if a matching keyword exists, otherwise fall back to form summary
    return <Tooltip keyword={form.name.toLowerCase()}>{form.name}</Tooltip>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 space-y-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">{skill.name}</h2>
            <span className="text-[10px] text-gray-500 uppercase font-medium">
              {SKILL_TYPE_LABELS[skill.skillType]}
            </span>
            <RangeTagIcons tags={skill.levels[0].rangeTags} size="md" />
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {skill.description && (
          <p className="text-sm text-gray-400">{skill.description}</p>
        )}


        {(skill.skillType === "ability" || (skill.skillType === "conditional" && skill.leveled)) ? (
          <div className="space-y-3">
            {(levelingMode ? [0, 1, 2] : skillLevelMap ? [currentSkillLevel - 1] : [0, 1, 2]).map((i) => {
              const level = skill.levels[i];
              if (!level) return null;
              const lvTemplate = getTemplateForLevel(i);
              const lvActions = getActionsForLevel(i);
              const isCurrent = levelingMode && i + 1 === currentSkillLevel;
              const isNext = levelingMode && i + 1 === currentSkillLevel + 1;
              const cardBorder = isCurrent
                ? "border-blue-500/60 ring-1 ring-blue-500/30"
                : isNext
                  ? "border-yellow-500/60 ring-1 ring-yellow-500/30"
                  : "border-gray-700";
              return (
                <div key={i} className={`bg-gray-800 border ${cardBorder} rounded-lg p-3 space-y-2`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase">
                      Level {i + 1}
                    </span>
                    {isCurrent && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-600/40 text-blue-200 font-semibold uppercase">Current</span>}
                    {isNext && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-600/40 text-yellow-200 font-semibold uppercase">Next ↑</span>}
                    {level.cost.length > 0 && <EnergyCostDisplay cost={level.cost} />}
                  </div>
                  {level.costNote && (
                    <p className="text-[10px] text-yellow-500/70 italic">{level.costNote}</p>
                  )}
                  {level.description && (
                    <p className="text-sm text-gray-300">
                      <GlossaryText text={level.description} />
                    </p>
                  )}
                  {level.effects && level.effects.length > 0 && (
                    <div className="space-y-0.5 mt-1">
                      <span className="text-[9px] text-purple-400 uppercase font-medium">Effects</span>
                      {level.effects.map((eff, ei) => (
                        <SkillEffectDisplay key={ei} effect={eff} />
                      ))}
                    </div>
                  )}
                  {lvTemplate && lvActions.length > 0 && (
                    <div className="space-y-1.5 mt-1">
                      <span className="text-[10px] text-blue-400 uppercase font-medium">
                        Grants: {lvTemplate.name}
                      </span>
                      {lvActions.map((action) => {
                        const actionSkill = allSkills.find((s) => s.id === action.skillId);
                        if (!actionSkill) return null;
                        return (
                          <div key={action.id} className="bg-gray-900/50 rounded p-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-white">{actionSkill.name}</span>
                              {actionSkill.levels[0].cost.length > 0 && <EnergyCostDisplay cost={actionSkill.levels[0].cost} />}
                            </div>
                            {actionSkill.description && (
                              <p className="text-[10px] text-gray-400 mt-0.5"><GlossaryText text={actionSkill.description} /></p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <p className="text-sm text-gray-300">
              {skill.levels[0].description ? <GlossaryText text={skill.levels[0].description} /> : "(no description)"}
            </p>
          </div>
        )}

        {/* Variant transformations */}
        {variants.length > 0 && (
          <div className="border-t border-gray-800 pt-3 space-y-2">
            <span className="text-[10px] text-gray-500 uppercase font-medium">
              Transforms
            </span>
            {variants.map((v) => (
              <button
                key={v.id}
                onClick={() => onViewSkill(v)}
                className="w-full text-left bg-gray-800/50 hover:bg-gray-800 rounded p-2.5 border border-gray-700/50 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                  <span>Becomes</span>
                  <span className="text-white font-semibold">{v.name}</span>
                  <span>while</span>
                  <span className="text-blue-400">another form</span>
                  <span>is active</span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {v.description || v.levels[0].description ? <GlossaryText text={v.description || v.levels[0].description} /> : "(no description)"}
                </p>
                {v.levels[0].cost.length > 0 && (
                  <div className="mt-1">
                    <EnergyCostDisplay cost={v.levels[0].cost} />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Variable Repeats selector */}
        {(() => {
          const effLv = skillLevelMap ? currentSkillLevel - 1 : previewLevel;
          const vr = skill.levels[effLv]?.variableRepeat;
          if (!vr) return null;
          const isAny = vr.color === "any";
          const sidePool = (attackerSide && teamEnergy) ? (teamEnergy[attackerSide] ?? {}) : {};
          const spendTotal = Object.values(variableSpend).reduce((s, n) => s + (n ?? 0), 0);
          if (!isAny) {
            // Cap max hits by available energy of this color (base cost already accounted for; each repeat = 1 extra)
            const baseCost = (skill.levels[effLv]?.cost ?? []).find((c) => c.color === vr.color)?.amount ?? 0;
            const available = (sidePool[vr.color as EnergyColor] ?? 0);
            // Available extra = what's left after paying the base cost for this color
            const extraAvailable = Math.max(0, available - baseCost);
            const maxAffordable = Math.min(vr.max, 1 + extraAvailable);
            // Clamp current selection to what's affordable
            if (variableRepeats > maxAffordable) setVariableRepeats(maxAffordable);
            return (
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 uppercase font-medium">Hits ({variableRepeats}/{maxAffordable})</span>
                  <span className="text-[10px] text-gray-500">+1 {vr.color} energy per hit</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: vr.max }, (_, idx) => {
                    const hitNum = idx + 1;
                    const affordable = hitNum <= maxAffordable;
                    const active = hitNum <= variableRepeats;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={!affordable}
                        onClick={() => setVariableRepeats(hitNum)}
                        title={affordable ? `${hitNum} hit${hitNum > 1 ? "s" : ""}` : "Not enough energy"}
                        className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center text-[10px] font-bold ${
                          !affordable
                            ? "bg-gray-800 border-gray-700 text-gray-600 opacity-40 cursor-not-allowed"
                            : active
                            ? `${({red:"bg-energy-red",blue:"bg-energy-blue",green:"bg-energy-green",purple:"bg-energy-purple",yellow:"bg-energy-yellow"} as Record<string,string>)[vr.color] ?? "bg-gray-600"} border-white/60 text-white`
                            : `bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-400 cursor-pointer`
                        }`}
                      >
                        {hitNum}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500">Click to set hits. {skill.levels[effLv]?.targetType === "random-enemy" ? "Each hit re-rolls a random enemy." : "Each hit targets the same enemy."}</p>
              </div>
            );
          }
          const colorList: EnergyColor[] = ["red","blue","green","purple","yellow"];
          return (
            <div className="border-t border-gray-800 pt-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase font-medium">Hits</span>
                <span className="text-xs text-white font-bold">{spendTotal} / {vr.max}</span>
              </div>
              <div className="space-y-1">
                {colorList.map((c) => {
                  const available = (sidePool[c] ?? 0);
                  const chosen = variableSpend[c] ?? 0;
                  const canAdd = chosen < available && spendTotal < vr.max;
                  return (
                    <div key={c} className="flex items-center gap-2">
                      <span className="text-[10px] w-12 capitalize text-gray-300">{c}</span>
                      <span className="text-[10px] text-gray-500 w-16">avail: {available}</span>
                      <button
                        type="button"
                        disabled={chosen <= 0}
                        onClick={() => setVariableSpend((prev) => ({ ...prev, [c]: Math.max(0, (prev[c] ?? 0) - 1) }))}
                        className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] disabled:opacity-30"
                      >-</button>
                      <span className="text-[11px] text-white w-6 text-center font-bold">{chosen}</span>
                      <button
                        type="button"
                        disabled={!canAdd}
                        onClick={() => setVariableSpend((prev) => ({ ...prev, [c]: (prev[c] ?? 0) + 1 }))}
                        className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] disabled:opacity-30"
                      >+</button>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500">Select which energies to spend. Each energy = 1 hit ({skill.levels[effLv]?.targetType === "random-enemy" ? "re-rolls a random enemy" : "hits the same target"}).</p>
            </div>
          );
        })()}

        {/* Damage Preview */}
        {attackerChar && modalTeams && getCharacterFn && skill.levels.some((lv) => lv.damageCategory) && (() => {
          const effectiveLevel = skillLevelMap ? currentSkillLevel - 1 : previewLevel;
          const level = skill.levels[effectiveLevel];
          if (!level?.damageCategory) return null;

          const rawTargeting = resolveTargets(level.targetType, attackerChar.id, modalTeams, getCharacterFn, currentHpMap);
          // Apply force-target override
          const attackCategory = getAttackCategory(level.targetType, level.damageSourceOverride);
          const attackerBuffs = buffsMap?.[attackerChar.id] ?? [];
          const forcedTargetId = getForceTarget(attackerBuffs, attackCategory);
          const targeting = forcedTargetId && rawTargeting.mode === "dropdown" && rawTargeting.targets.some((t) => t.characterId === forcedTargetId)
            ? { ...rawTargeting, targets: rawTargeting.targets.filter((t) => t.characterId === forcedTargetId) }
            : rawTargeting;
          const isAoe = targeting.mode === "aoe";
          const isSelf = targeting.mode === "self";

          // Choose-effect pools (for skills like Elemental Strike that deal damage AND let the player pick a follow-up effect)
          const damageChoosePools = level.chooseEffectPools ?? [];
          const damageChosenPoolEffects: SkillEffect[] = [];
          let damageAllChosen = true;
          damageChoosePools.forEach((pool, pi) => {
            const sel = poolChoices[pi] ?? [];
            if (sel.length < pool.pickCount) damageAllChosen = false;
            sel.forEach((ei) => {
              if (pool.effects[ei]) damageChosenPoolEffects.push(pool.effects[ei]);
            });
          });
          const renderChoosePoolPicker = () => damageChoosePools.length === 0 ? null : (
            <div className="space-y-2 border-t border-gray-700 pt-2 mt-1">
              {damageChoosePools.map((pool, pi) => {
                const selected = poolChoices[pi] ?? [];
                const remaining = pool.pickCount - selected.length;
                const toggle = (ei: number) => {
                  const cur = poolChoices[pi] ?? [];
                  if (cur.includes(ei)) {
                    setPoolChoices({ ...poolChoices, [pi]: cur.filter((x) => x !== ei) });
                  } else if (cur.length < pool.pickCount) {
                    setPoolChoices({ ...poolChoices, [pi]: [...cur, ei] });
                  }
                };
                return (
                  <div key={`dc-${pi}`}>
                    <span className="text-[10px] text-emerald-300 uppercase font-medium">
                      Choose {pool.pickCount} of {pool.effects.length}
                      {remaining > 0 && <span className="ml-2 text-yellow-400 normal-case">({remaining} more)</span>}
                    </span>
                    <div className="space-y-1 mt-1">
                      {pool.effects.map((eff, ei) => {
                        const isSel = selected.includes(ei);
                        return (
                          <button
                            key={ei}
                            type="button"
                            onClick={() => toggle(ei)}
                            className={`w-full text-left rounded px-2 py-1 border transition-colors ${isSel ? "bg-emerald-900/40 border-emerald-500/60" : "bg-gray-800 border-gray-700 hover:border-gray-600"}`}
                          >
                            <SkillEffectDisplay effect={eff} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );

          // Resolve attacker combat stats
          const aFormId = battleFormMap?.[attackerChar.id];
          const aForm = aFormId && getFormsForCharacter ? getFormsForCharacter(attackerChar.id).find((f) => f.id === aFormId) : null;
          const aStats = applyCharLevelStats(aForm?.statOverrides ? { ...attackerChar.stats, ...aForm.statOverrides } : attackerChar.stats, modalCharLevelMap?.[attackerChar.id] ?? 0);
          const aElemDmg = aForm?.elementalDmgOverride ? { ...attackerChar.elementalDamage, ...aForm.elementalDmgOverride } : attackerChar.elementalDamage;
          // Resolve grid columns from modalTeams for row modifiers
          const colOf = (cid: string): number | undefined => {
            for (const team of modalTeams ?? []) {
              const p = team.placements.find((pp) => pp.characterId === cid);
              if (p) return p.position.col;
            }
            return undefined;
          };
          const attackerCombat = { stats: aStats, elementalResistance: attackerChar.elementalResistance, elementalDamage: aElemDmg, buffs: buffsMap?.[attackerChar.id] ?? [], currentHp: currentHpMap?.[attackerChar.id] ?? attackerChar.stats.hp, stolenEnergyCount: stolenEnergyByChar?.[attackerChar.id] ?? 0, col: colOf(attackerChar.id) };

          // Splash hit helper: compute splash damage for a target using a synthetic level that
          // pulls tier/category/source/element from the splash config. Inherits the parent skill's
          // resolved element when inheritElement is true.
          const calcSplashForTarget = (targetId: string, primaryResult: DamageResult | null): DamageResult | null => {
            const splash = level.splashHit;
            if (!splash) return null;
            const targetChar = getCharacterFn(targetId);
            if (!targetChar) return null;
            const inheritedElement = splash.inheritElement === false ? null : (primaryResult?.element ?? level.element ?? null);
            const splashLevel: SkillLevel = {
              ...level,
              damageCategory: splash.damageCategory,
              damageTier: splash.damageTier,
              damageSourceOverride: splash.damageSourceOverride ?? "indirect",
              element: (inheritedElement ?? undefined) as SkillLevel["element"],
              // Strip riders/scalings — splash is the rider itself, not a separate amplified hit
              ignoreDefense: undefined,
              ignoreSpirit: undefined,
              casterMissingHpScaling: undefined,
              giantSlayerMaxBonus: undefined,
              executeBonus: undefined,
              bonusHpDamage: undefined,
              bonusDamageVsStatus: undefined,
              stolenEnergyScaling: undefined,
              splashHit: undefined,
            };
            const dFormId = battleFormMap?.[targetId];
            const dForm = dFormId && getFormsForCharacter ? getFormsForCharacter(targetId).find((f) => f.id === dFormId) : null;
            const dStats = applyCharLevelStats(dForm?.statOverrides ? { ...targetChar.stats, ...dForm.statOverrides } : targetChar.stats, modalCharLevelMap?.[targetChar.id] ?? 0);
            const dElemResBase = dForm?.elementalResOverride ? { ...targetChar.elementalResistance, ...dForm.elementalResOverride } : targetChar.elementalResistance;
            const dPassiveGrants = getPassiveResistanceGrants(targetChar, dFormId ?? null, allSkills, modalCharSkills.filter((cs) => cs.characterId === targetId), skillLevelMap ?? {});
            const dElemRes = applyPassiveElementalGrants(dElemResBase, dPassiveGrants);
            return calculateDamage(attackerCombat, { stats: dStats, elementalResistance: dElemRes as typeof targetChar.elementalResistance, elementalDamage: targetChar.elementalDamage, buffs: buffsMap?.[targetId] ?? [], currentHp: currentHpMap?.[targetId] ?? targetChar.stats.hp, col: colOf(targetId) }, splashLevel);
          };

          // Resolve splash target IDs from a primary target ID + splash pattern.
          const resolveSplashTargets = (primaryId: string): string[] => {
            const splash = level.splashHit;
            if (!splash || !modalTeams) return [];
            // Exclude defeated units from splash target resolution.
            const allUnits = modalTeams
              .flatMap((t) => t.placements.map((p) => ({ charId: p.characterId, side: t.side, row: p.position.row, col: p.position.col })))
              .filter((u) => ((currentHpMap?.[u.charId]) ?? 1) > 0);
            const primary = allUnits.find((u) => u.charId === primaryId);
            if (!primary) return [];
            if (splash.targetPattern === "all-other-enemies") {
              // Splash hits everyone on the same side as the primary target (i.e. the rest of the enemy team)
              return allUnits
                .filter((u) => u.side === primary.side && u.charId !== primaryId)
                .map((u) => u.charId);
            }
            if (splash.targetPattern === "row-behind-target") {
              // Splash hits every unit in the depth lane immediately behind the primary target.
              // col is the depth axis (0 = front, 1 = mid, 2 = back); "behind" = primary.col + 1.
              // Lateral row is unconstrained — up to 3 splash targets, no chaining further back.
              const behindCol = primary.col + 1;
              if (behindCol > 2) return [];
              return allUnits
                .filter((u) => u.side === primary.side && u.col === behindCol)
                .map((u) => u.charId);
            }
            // adjacent-of-target: 4-directional neighbors on the same side as the primary target
            return allUnits
              .filter((u) => u.side === primary.side && u.charId !== primaryId)
              .filter((u) => {
                const dr = Math.abs(u.row - primary.row);
                const dc = Math.abs(u.col - primary.col);
                return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
              })
              .map((u) => u.charId);
          };

          const buildSplashEntries = (primaryId: string, primaryResult: DamageResult | null) => {
            const ids = resolveSplashTargets(primaryId);
            const out: { targetId: string; newHp: number; amount: number; isHealing: boolean; category?: string; element?: string | null; isSplash: boolean }[] = [];
            for (const sid of ids) {
              const r = calcSplashForTarget(sid, primaryResult);
              if (!r) continue;
              const sc = getCharacterFn!(sid);
              const sMax = sc?.stats.hp ?? 100;
              const sCur = (currentHpMap ?? {})[sid] ?? sMax;
              const newHp = Math.max(0, sCur - r.finalDamage);
              out.push({ targetId: sid, newHp, amount: r.finalDamage, isHealing: false, category: level.splashHit?.damageCategory, element: r.element ?? null, isSplash: true });
            }
            return out;
          };

          const calcForTarget = (targetId: string): DamageResult | null => {
            const targetChar = getCharacterFn(targetId);
            if (!targetChar) return null;
            const dFormId = battleFormMap?.[targetId];
            const dForm = dFormId && getFormsForCharacter ? getFormsForCharacter(targetId).find((f) => f.id === dFormId) : null;
            const dStats = applyCharLevelStats(dForm?.statOverrides ? { ...targetChar.stats, ...dForm.statOverrides } : targetChar.stats, modalCharLevelMap?.[targetChar.id] ?? 0);
            const dElemResBase = dForm?.elementalResOverride ? { ...targetChar.elementalResistance, ...dForm.elementalResOverride } : targetChar.elementalResistance;
            const dPassiveGrants = getPassiveResistanceGrants(targetChar, dFormId ?? null, allSkills, modalCharSkills.filter((cs) => cs.characterId === targetId), skillLevelMap ?? {});
            const dElemRes = applyPassiveElementalGrants(dElemResBase, dPassiveGrants);
            return calculateDamage(attackerCombat, { stats: dStats, elementalResistance: dElemRes as typeof targetChar.elementalResistance, elementalDamage: targetChar.elementalDamage, buffs: buffsMap?.[targetId] ?? [], currentHp: currentHpMap?.[targetId] ?? targetChar.stats.hp, col: colOf(targetId) }, level);
          };

          const applyToTarget = (targetId: string, result: DamageResult) => {
            if (!onApplyDamage) return;
            const target = getCharacterFn(targetId);
            if (!target) return;
            const maxHp = target.stats.hp;
            const cur = (currentHpMap ?? {})[targetId] ?? maxHp;
            const newHp = result.isHealing ? Math.min(maxHp, cur + result.finalDamage) : Math.max(0, cur - result.finalDamage);
            onApplyDamage(targetId, newHp);
          };

          // AOE or Self: compute for all targets
          if (isAoe || isSelf) {
            const results = targeting.targets.map((t) => ({ target: t, result: calcForTarget(t.characterId) })).filter((r) => r.result);
            const totalDmg = results.reduce((sum, r) => sum + (r.result?.finalDamage ?? 0), 0);
            const isHealing = results[0]?.result?.isHealing ?? false;

            return (
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <span className="text-[10px] text-gray-500 uppercase font-medium">
                  Damage Preview — {isSelf ? "Self" : `${targeting.targets.length} targets`}
                </span>
                <div className="space-y-1.5">
                  {results.map(({ target, result }) => result && (
                    <div key={target.characterId} className="bg-gray-800 rounded p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-300">{target.label}</span>
                        <span className={`text-sm font-bold ${result.isHealing ? "text-green-400" : "text-red-400"}`}>
                          {result.isHealing ? "+" : "-"}{result.finalDamage}
                        </span>
                      </div>
                    </div>
                  ))}
                  {results.length > 1 && (
                    <div className="flex items-center justify-between px-2">
                      <span className="text-xs text-gray-500 font-medium">Total</span>
                      <span className={`text-lg font-bold ${isHealing ? "text-green-400" : "text-red-400"}`}>
                        {isHealing ? "+" : "-"}{totalDmg}
                      </span>
                    </div>
                  )}
                  {level.effects && level.effects.length > 0 && (
                    <div className="space-y-0.5 border-t border-gray-700 pt-1 mt-1">
                      <span className="text-[9px] text-purple-400 uppercase font-medium">Also Applies</span>
                      {level.effects.map((eff, ei) => (
                        <SkillEffectDisplay key={ei} effect={eff} />
                      ))}
                    </div>
                  )}
                  {level.dispels && level.dispels.length > 0 && (
                    <div className="space-y-0.5 border-t border-gray-700 pt-1 mt-1">
                      <span className="text-[9px] text-cyan-400 uppercase font-medium">Dispels</span>
                      {level.dispels.map((d, di) => (
                        <div key={di} className="text-[10px] text-cyan-400">
                          Remove {d.count === -1 ? "all" : d.count} {d.category === "buff" ? "positive effect" : d.category === "debuff" ? "negative effect" : "effect"}{d.count !== 1 ? "s" : ""} from {TARGET_TYPE_LABELS[d.targetType]}
                        </div>
                      ))}
                    </div>
                  )}
                  {level.hpCost && level.hpCost > 0 && (
                    <div className="border-t border-gray-700 pt-1 mt-1 text-[10px] text-red-400">
                      Self-damage: {level.hpCost}% max HP
                    </div>
                  )}
                  {renderChoosePoolPicker()}
                  {!levelingMode && onApplyAndUse && results.length > 0 && skill.skillType !== "innate" && (
                    <button
                      onClick={() => {
                        const entries: { targetId: string; newHp: number; amount: number; isHealing: boolean; category?: string; element?: string | null; isSplash?: boolean }[] = results.filter((r) => r.result).map(({ target, result }) => {
                          const t = getCharacterFn!(target.characterId);
                          const maxHp = t?.stats.hp ?? 100;
                          const cur = (currentHpMap ?? {})[target.characterId] ?? maxHp;
                          const newHp = result!.isHealing ? Math.min(maxHp, cur + result!.finalDamage) : Math.max(0, cur - result!.finalDamage);
                          return { targetId: target.characterId, newHp, amount: result!.finalDamage, isHealing: result!.isHealing, category: level.damageCategory, element: result!.element ?? level.element ?? null };
                        });
                        // Splash hit on AOE: append splash for each primary entry (deduped)
                        if (level.splashHit) {
                          const seen = new Set(entries.map((e) => e.targetId));
                          for (const primary of [...entries]) {
                            const splashEntries = buildSplashEntries(primary.targetId, results.find((r) => r.target.characterId === primary.targetId)?.result ?? null);
                            for (const se of splashEntries) {
                              if (seen.has(se.targetId)) continue;
                              seen.add(se.targetId);
                              entries.push(se);
                            }
                          }
                        }
                        onApplyAndUse(entries, skill, { variableRepeats, variableColor, variableSpend, chosenPoolEffects: damageChosenPoolEffects });
                      }}
                      disabled={canAfford === false || _variableAnyBlocked || !damageAllChosen}
                      className={`w-full text-[10px] px-2 py-1.5 rounded text-white font-medium ${canAfford === false || _variableAnyBlocked || !damageAllChosen ? "bg-gray-700 text-gray-500 cursor-not-allowed" : isHealing ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
                    >
                      {canAfford === false ? "Not Enough Energy" : _variableAnyBlocked ? "Select Energy" : !damageAllChosen ? "Pick Effects First" : "Apply and Use"}
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // Dropdown mode: single target selection
          if (targeting.mode === "dropdown" && targeting.targets.length > 0) {
            const isRandomTarget = level.targetType === "random-enemy" || level.targetType === "random-ally";
            const selectedTarget = isRandomTarget
              ? (targeting.targets[0]?.characterId || "")
              : (previewTargetId || targeting.targets[0]?.characterId || "");
            const result = selectedTarget ? calcForTarget(selectedTarget) : null;

            return (
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <span className="text-[10px] text-gray-500 uppercase font-medium">Damage Preview</span>
                {isRandomTarget ? (
                  <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-400 italic">Random target (resolved on use)</div>
                ) : (
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none"
                    value={selectedTarget}
                    onChange={(e) => setPreviewTargetId(e.target.value)}
                  >
                    {targeting.targets.map((t) => (
                      <option key={t.characterId} value={t.characterId}>{t.label}</option>
                    ))}
                  </select>
                )}
                {result && (
                  <div className="bg-gray-800 rounded p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-lg font-bold ${result.isHealing ? "text-green-400" : "text-red-400"}`}>
                        {result.isHealing ? "+" : "-"}{result.finalDamage}
                      </span>
                      {!levelingMode && onApplyAndUse && skill.skillType !== "innate" && (
                        <button
                          onClick={() => {
                            // For random-target skills, pick a random target now (the first hit);
                            // variable-repeat will re-roll additional hits in the parent.
                            const chosenId = isRandomTarget
                              ? targeting.targets[Math.floor(Math.random() * targeting.targets.length)].characterId
                              : selectedTarget;
                            const freshResult = isRandomTarget ? (calcForTarget(chosenId) ?? result) : result;
                            const t = getCharacterFn!(chosenId);
                            const maxHp = t?.stats.hp ?? 100;
                            const cur = (currentHpMap ?? {})[chosenId] ?? maxHp;
                            const newHp = freshResult.isHealing ? Math.min(maxHp, cur + freshResult.finalDamage) : Math.max(0, cur - freshResult.finalDamage);
                            const baseEntry = { targetId: chosenId, newHp, amount: freshResult.finalDamage, isHealing: freshResult.isHealing, category: level.damageCategory, element: freshResult.element ?? level.element ?? null };
                            // Column pierce: also hit any enemies behind the chosen target in the same row
                            const entries: { targetId: string; newHp: number; amount: number; isHealing: boolean; category?: string; element?: string | null; isSplash?: boolean }[] = [baseEntry];
                            // Splash hit: append secondary damage to additional targets
                            if (level.splashHit) {
                              const splashEntries = buildSplashEntries(chosenId, freshResult);
                              entries.push(...splashEntries);
                            }
                            if (level.targetType === "column-pierce-enemy" && modalTeams) {
                              const chosenPos = modalTeams.flatMap((tm) => tm.placements.map((p) => ({ ...p, side: tm.side }))).find((p) => p.characterId === chosenId);
                              if (chosenPos) {
                                // Pierce hits exactly one unit directly behind the target (col + 1
                                // in the same lateral row), not every unit in the lane behind it.
                                const behind = modalTeams
                                  .flatMap((tm) => tm.placements.map((p) => ({ ...p, side: tm.side })))
                                  .filter((p) =>
                                    p.side === chosenPos.side &&
                                    p.position.row === chosenPos.position.row &&
                                    p.position.col === chosenPos.position.col + 1 &&
                                    ((currentHpMap?.[p.characterId]) ?? 1) > 0
                                  );
                                for (const b of behind) {
                                  const r = calcForTarget(b.characterId);
                                  if (!r) continue;
                                  const bChar = getCharacterFn!(b.characterId);
                                  const bMax = bChar?.stats.hp ?? 100;
                                  const bCur = (currentHpMap ?? {})[b.characterId] ?? bMax;
                                  const bNewHp = r.isHealing ? Math.min(bMax, bCur + r.finalDamage) : Math.max(0, bCur - r.finalDamage);
                                  entries.push({ targetId: b.characterId, newHp: bNewHp, amount: r.finalDamage, isHealing: r.isHealing, category: level.damageCategory, element: r.element ?? level.element ?? null });
                                }
                              }
                            }
                            onApplyAndUse(entries, skill, { variableRepeats, variableColor, variableSpend, chosenPoolEffects: damageChosenPoolEffects });
                          }}
                          disabled={canAfford === false || _variableAnyBlocked || !damageAllChosen}
                          className={`text-[10px] px-2 py-1 rounded text-white font-medium ${canAfford === false || _variableAnyBlocked || !damageAllChosen ? "bg-gray-700 text-gray-500 cursor-not-allowed" : result.isHealing ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
                        >
                          {canAfford === false ? "Not Enough Energy" : _variableAnyBlocked ? "Select Energy" : !damageAllChosen ? "Pick Effects First" : "Apply and Use"}
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {result.breakdown.map((line, i) => (
                        <p key={i} className="text-[10px] text-gray-400">{line}</p>
                      ))}
                    </div>
                    {level.effects && level.effects.length > 0 && (
                      <div className="space-y-0.5 border-t border-gray-700 pt-1 mt-1">
                        <span className="text-[9px] text-purple-400 uppercase font-medium">Also Applies</span>
                        {level.effects.map((eff, ei) => (
                          <SkillEffectDisplay key={ei} effect={eff} />
                        ))}
                      </div>
                    )}
                    {level.dispels && level.dispels.length > 0 && (
                      <div className="space-y-0.5 border-t border-gray-700 pt-1 mt-1">
                        <span className="text-[9px] text-cyan-400 uppercase font-medium">Dispels</span>
                        {level.dispels.map((d, di) => (
                          <div key={di} className="text-[10px] text-cyan-400">
                            Remove {d.count === -1 ? "all" : d.count} {d.category === "buff" ? "positive effect" : d.category === "debuff" ? "negative effect" : "effect"}{d.count !== 1 ? "s" : ""} from {TARGET_TYPE_LABELS[d.targetType]}
                          </div>
                        ))}
                      </div>
                    )}
                    {level.hpCost && level.hpCost > 0 && (
                      <div className="border-t border-gray-700 pt-1 mt-1 text-[10px] text-red-400">
                        Self-damage: {level.hpCost}% max HP
                      </div>
                    )}
                    {level.splashHit && (() => {
                      if (isRandomTarget) {
                        return (
                          <div className="border-t border-gray-700 pt-1 mt-1">
                            <span className="text-[9px] text-cyan-300 uppercase font-medium">Splash</span>
                            <p className="text-[10px] text-gray-400 italic">{level.splashHit.targetPattern === "all-other-enemies" ? "All other enemies" : level.splashHit.targetPattern === "row-behind-target" ? "Row behind target" : "Adjacent of target"} — resolved on use</p>
                          </div>
                        );
                      }
                      const splashEntries = buildSplashEntries(selectedTarget, result);
                      if (splashEntries.length === 0) {
                        return (
                          <div className="border-t border-gray-700 pt-1 mt-1">
                            <span className="text-[9px] text-cyan-300 uppercase font-medium">Splash</span>
                            <p className="text-[10px] text-gray-500 italic">No additional targets in range.</p>
                          </div>
                        );
                      }
                      const total = splashEntries.reduce((s, e) => s + e.amount, 0);
                      return (
                        <div className="border-t border-gray-700 pt-1 mt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-cyan-300 uppercase font-medium">Splash ({level.splashHit.targetPattern === "all-other-enemies" ? "all others" : level.splashHit.targetPattern === "row-behind-target" ? "row behind" : "adjacent"})</span>
                            <span className="text-[10px] text-gray-500">total -{total}</span>
                          </div>
                          <div className="space-y-0.5 mt-0.5">
                            {splashEntries.map((se) => {
                              const sc = getCharacterFn!(se.targetId);
                              return (
                                <div key={se.targetId} className="flex items-center justify-between text-[10px]">
                                  <span className="text-gray-300 truncate">{sc?.name ?? "Unknown"}</span>
                                  <span className="font-bold text-red-400">-{se.amount}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {renderChoosePoolPicker()}
              </div>
            );
          }

          return null;
        })()}

        {/* Effects/Dispels/Energy-only Apply and Use (for skills with no damage) */}
        {!levelingMode && attackerChar && modalTeams && getCharacterFn && onApplyAndUse && (() => {
          const effectiveLevel = skillLevelMap ? currentSkillLevel - 1 : previewLevel;
          const level = skill.levels[effectiveLevel];
          const effects = level?.effects ?? [];
          const dispels = level?.dispels ?? [];
          const movements = level?.movements ?? [];
          const randomPools = level?.randomEffectPools ?? [];
          const choosePools = level?.chooseEffectPools ?? [];
          const hasEnergySteal = !!level?.energySteal;
          const hasEnergyGenerate = !!level?.energyGenerate;
          const hasAnyAction = effects.length > 0 || dispels.length > 0 || movements.length > 0 || hasEnergySteal || hasEnergyGenerate || randomPools.length > 0 || choosePools.length > 0;
          if (!hasAnyAction) return null;
          // If there's already a damage preview with Apply and Use, don't duplicate
          if (level?.damageCategory) return null;

          return (
            <div className="border-t border-gray-800 pt-3 space-y-2">
              {effects.length > 0 && (
                <>
                  <span className="text-[10px] text-gray-500 uppercase font-medium">Effects</span>
                  <div className="space-y-1">
                    {effects.map((eff, i) => (
                      <SkillEffectDisplay key={i} effect={eff} />
                    ))}
                  </div>
                </>
              )}
              {randomPools.length > 0 && randomPools.map((pool, pi) => (
                <div key={pi}>
                  <span className="text-[10px] text-cyan-300 uppercase font-medium">
                    Random — picks {pool.pickCount} of {pool.effects.length}
                  </span>
                  <div className="space-y-1">
                    {pool.effects.map((eff, ei) => (
                      <SkillEffectDisplay key={ei} effect={eff} />
                    ))}
                  </div>
                </div>
              ))}
              {choosePools.length > 0 && choosePools.map((pool, pi) => {
                const selected = poolChoices[pi] ?? [];
                const remaining = pool.pickCount - selected.length;
                const toggle = (ei: number) => {
                  const cur = poolChoices[pi] ?? [];
                  if (cur.includes(ei)) {
                    setPoolChoices({ ...poolChoices, [pi]: cur.filter((x) => x !== ei) });
                  } else if (cur.length < pool.pickCount) {
                    setPoolChoices({ ...poolChoices, [pi]: [...cur, ei] });
                  }
                };
                return (
                  <div key={`c-${pi}`}>
                    <span className="text-[10px] text-emerald-300 uppercase font-medium">
                      Choose {pool.pickCount} of {pool.effects.length}
                      {remaining > 0 && <span className="ml-2 text-yellow-400 normal-case">({remaining} more to pick)</span>}
                    </span>
                    <div className="space-y-1 mt-1">
                      {pool.effects.map((eff, ei) => {
                        const isSel = selected.includes(ei);
                        return (
                          <button
                            key={ei}
                            onClick={() => toggle(ei)}
                            className={`w-full text-left rounded px-2 py-1 border transition-colors ${
                              isSel
                                ? "bg-emerald-900/30 border-emerald-500/50"
                                : "bg-gray-800/40 border-gray-700 hover:border-gray-600"
                            }`}
                          >
                            <SkillEffectDisplay effect={eff} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {dispels.length > 0 && (
                <>
                  <span className="text-[10px] text-cyan-400 uppercase font-medium">Dispels</span>
                  <div className="space-y-1">
                    {dispels.map((d, i) => (
                      <div key={i} className="text-[11px] text-cyan-400">
                        Remove {d.count === -1 ? "all" : d.count} {d.category === "buff" ? "positive effect" : d.category === "debuff" ? "negative effect" : "effect"}{d.count !== 1 ? "s" : ""} from {TARGET_TYPE_LABELS[d.targetType]}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {hasEnergySteal && level?.energySteal && (
                <div className="text-[11px] text-pink-400">
                  Steal {level.energySteal.count} {level.energySteal.mode} energy from enemy
                </div>
              )}
              {hasEnergyGenerate && level?.energyGenerate && (
                <div className="text-[11px] text-pink-400">
                  Generate {level.energyGenerate.count} {level.energyGenerate.mode}{level.energyGenerate.mode === "specific" ? ` ${level.energyGenerate.color}` : ""} energy
                </div>
              )}
              {skill.skillType !== "innate" && (() => {
                // For single-target non-damage skills, show a target picker
                const skillTargeting = level?.targetType
                  ? resolveTargets(level.targetType, attackerChar.id, modalTeams, getCharacterFn, currentHpMap)
                  : null;
                const isSingleTarget = skillTargeting?.mode === "dropdown" && skillTargeting.targets.length > 0;
                const selectedTarget = previewTargetId || (isSingleTarget ? skillTargeting!.targets[0]?.characterId : "") || "";
                // Collect chosen effects from all choose pools
                const chosenPoolEffects: SkillEffect[] = [];
                let allChosen = true;
                choosePools.forEach((pool, pi) => {
                  const sel = poolChoices[pi] ?? [];
                  if (sel.length < pool.pickCount) allChosen = false;
                  sel.forEach((ei) => {
                    if (pool.effects[ei]) chosenPoolEffects.push(pool.effects[ei]);
                  });
                });
                const handleApply = () => {
                  if (!allChosen) return;
                  if (isSingleTarget && selectedTarget) {
                    const t = getCharacterFn!(selectedTarget);
                    const maxHp = t?.stats.hp ?? 100;
                    const cur = (currentHpMap ?? {})[selectedTarget] ?? maxHp;
                    onApplyAndUse([{ targetId: selectedTarget, newHp: cur, amount: 0, isHealing: false }], skill, { chosenPoolEffects });
                  } else {
                    onApplyAndUse([], skill, { chosenPoolEffects });
                  }
                };
                return (
                  <>
                    {isSingleTarget && (
                      <select
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none"
                        value={selectedTarget}
                        onChange={(e) => setPreviewTargetId(e.target.value)}
                      >
                        {skillTargeting!.targets.map((t) => (
                          <option key={t.characterId} value={t.characterId}>{t.label}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={handleApply}
                      disabled={canAfford === false || !allChosen}
                      className={`w-full text-[10px] px-2 py-1.5 rounded text-white font-medium ${canAfford === false || !allChosen ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500"}`}
                    >
                      {canAfford === false ? "Not Enough Energy" : !allChosen ? "Pick Effects First" : "Apply and Use"}
                    </button>
                  </>
                );
              })()}
            </div>
          );
        })()}

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function BenchDropZone({ bench, selectedCharId, onSelectCharacter }: { bench: Character[]; selectedCharId?: string | null; onSelectCharacter?: (id: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: "bench" });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-wrap gap-2 p-3 rounded-lg border min-h-[60px] transition-colors ${
        isOver
          ? "border-blue-400 bg-blue-500/10"
          : "border-gray-800 bg-gray-900/50"
      }`}
    >
      {bench.length === 0 ? (
        <span className="text-xs text-gray-600">
          All characters are placed. Create more on the Characters page.
        </span>
      ) : (
        bench.map((char) => (
          <DraggableCharacter key={char.id} character={char} source="bench" isSelected={selectedCharId === char.id} onSelect={() => onSelectCharacter?.(char.id)} />
        ))
      )}
    </div>
  );
}
