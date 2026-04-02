"use client";

import { useState, useCallback, useMemo } from "react";
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
import { Character, CharacterType, CHARACTER_TYPES, CharacterSkill, Skill, SkillLevel, SkillEffect, SkillTemplate, TemplateAction, Team, PlacedCharacter, EnergyColor, ENERGY_COLORS, EnergyGeneration, SKILL_TYPE_LABELS, ELEMENTS, ELEMENT_ICONS, ELEMENT_LABELS, TARGET_TYPE_LABELS, Form, BuffDebuff, BattleState, DamageResult, StatusEffect, resolveFormView, toggleEquipLoadout } from "@/lib/types";
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
  const match = existing.find((b) => b.effectId === incoming.effectId && b.source === incoming.source);

  if (!match) {
    // New buff
    return {
      buffs: [...existing, { ...incoming, id: crypto.randomUUID(), stacks: incoming.stacks ?? 1 }],
      triggered: null,
    };
  }

  if (match.stackable && match.maxStacks && (match.stacks ?? 1) < match.maxStacks) {
    // Stackable: increment stacks and refresh duration
    const newStacks = (match.stacks ?? 1) + 1;
    if (newStacks >= match.maxStacks && match.onMaxStacks) {
      // Max stacks reached — remove this buff and trigger special behavior
      return {
        buffs: existing.filter((b) => b.id !== match.id),
        triggered: match.onMaxStacks,
      };
    }
    return {
      buffs: existing.map((b) =>
        b.id === match.id ? { ...b, stacks: newStacks, duration: incoming.duration > 0 ? incoming.duration : b.duration } : b
      ),
      triggered: null,
    };
  }

  // Non-stackable or already at max: refresh duration only
  return {
    buffs: existing.map((b) =>
      b.id === match.id ? { ...b, duration: incoming.duration > 0 ? incoming.duration : b.duration } : b
    ),
    triggered: null,
  };
}

/** Compute the total buff modifier for a stat, including multi-stat buffs and stacks. */
function getBuffModifier(buffs: BuffDebuff[], stat: string): number {
  return buffs
    .filter((b) => b.stats.includes(stat))
    .reduce((sum, b) => sum + b.modifier * (b.stacks ?? 1), 0);
}

function SkillEffectDisplay({ effect }: { effect: SkillEffect }) {
  const { statusEffects } = useStore();
  const se = statusEffects.find((s) => s.id === effect.effectId);
  if (!se) return <span className="text-[10px] text-gray-500">Unknown effect</span>;
  const modText = !se.stats.includes("none") ? ` ${effect.modifier > 0 ? "+" : ""}${effect.modifier}%` : "";
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className={se.category === "buff" ? "text-green-400" : se.category === "status" ? "text-yellow-400" : "text-red-400"}>{se.name}{modText}</span>
      <span className="text-gray-600">{effect.duration}t</span>
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
  const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500";
  const photo = photoOverride ?? character.photoUrl;

  return (
    <div
      className={`px-2 py-1.5 rounded text-xs font-medium bg-gray-700 border text-white select-none flex items-center gap-1.5 transition-colors duration-150 ${
        isDragging ? "opacity-50" : ""
      } ${isSelected ? "border-blue-400 ring-1 ring-blue-400/50" : "border-gray-600"}`}
    >
      {photo ? (
        <img
          src={photo}
          alt={character.name}
          className={`w-7 h-7 rounded-full object-cover shrink-0${flipImage ? " -scale-x-100" : ""}`}
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-[10px] font-bold shrink-0">
          {character.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-bold truncate">{character.name}</div>
        {showHp ? (
          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex-1 h-1.5 bg-gray-600 rounded-full overflow-hidden">
              <div
                className={`h-full ${hpColor} transition-all duration-300 rounded-full`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-400 shrink-0 tabular-nums">
              {currentHp}/{maxHp}
            </span>
          </div>
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
}) {
  const charHp = character && hpMap ? {
    currentHp: hpMap[character.id] ?? character.stats.hp,
    maxHp: character.stats.hp,
  } : {};
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`w-24 h-20 border rounded flex items-center justify-center transition-colors ${
        isOver
          ? "border-blue-400 bg-blue-500/10"
          : "border-gray-700 bg-gray-800/50"
      }`}
      onMouseEnter={() => character && onHoverCharacter?.(character.id)}
      onMouseLeave={() => onHoverCharacter?.(null)}
    >
      {character ? (
        <DraggableCharacter
          character={character}
          source={`${side}-${row}-${col}`}
          flipImage={side === "left"}
          isSelected={selectedCharId === character.id}
          {...charHp}
          photoOverride={character && formPhotoMap ? formPhotoMap[character.id] : undefined}
          onSelect={() => onSelectCharacter?.(character.id)}
        />
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
}: {
  teams: Team[];
  getCharacter: (id: string) => Character | undefined;
  getEnergyForChar?: (charId: string) => EnergyGeneration[];
  currentEnergy?: Record<string, Record<string, number>>;
}) {
  const pools: { side: string; energy: Record<EnergyColor, number> }[] = teams.map((team) => {
    // If we have live energy tracking, use that
    if (currentEnergy && currentEnergy[team.side]) {
      const e = currentEnergy[team.side];
      return {
        side: team.name,
        energy: {
          red: e.red ?? 0,
          blue: e.blue ?? 0,
          green: e.green ?? 0,
          purple: e.purple ?? 0,
          yellow: e.yellow ?? 0,
        } as Record<EnergyColor, number>,
      };
    }
    const energy: Record<EnergyColor, number> = {
      red: 0,
      blue: 0,
      green: 0,
      purple: 0,
      yellow: 0,
    };
    team.placements.forEach((p) => {
      const charEnergy = getEnergyForChar
        ? getEnergyForChar(p.characterId)
        : getCharacter(p.characterId)?.energyGeneration ?? [];
      charEnergy.forEach((eg) => {
        energy[eg.color] += eg.amount;
      });
    });
    return { side: team.name, energy };
  });

  return (
    <div className="flex gap-8 justify-center">
      {pools.map((pool) => (
        <div key={pool.side} className="text-center">
          <div className="text-xs font-medium text-gray-400 mb-1">
            {pool.side} Energy
          </div>
          <div className="flex gap-1 justify-center">
            {(Object.entries(pool.energy) as [EnergyColor, number][]).map(
              ([color, amount]) =>
                amount > 0 && (
                  <span key={color} className="flex items-center gap-0.5">
                    <EnergyBadge color={color} size="md" />
                    <span className="text-xs text-gray-300 font-bold">
                      {amount}
                    </span>
                  </span>
                )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type BattlePhase = "staging" | "battle";

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
}: {
  turnOrder: TurnEntry[];
  currentTurnIndex: number;
  hoveredCharId: string | null;
  getCharacter: (id: string) => Character | undefined;
  formPhotoMap?: Record<string, string>;
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
        return (
          <div
            key={`${entry.characterId}-${i}`}
            className={`flex flex-col items-center w-14 shrink-0 ${
              isPast ? "opacity-40" : ""
            }`}
          >
            <div className="w-8 h-8 flex items-center justify-center">
              {photo ? (
                <img
                  src={photo}
                  alt={char.name}
                  className={`w-8 h-8 rounded-full object-cover border-2 transition-transform duration-150 origin-center ${
                    enlarged ? "scale-150" : "scale-100"
                  } ${
                    isHovered
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
                    isHovered
                      ? "border-blue-400 bg-blue-400/20 text-blue-300"
                      : isCurrent
                      ? "border-yellow-400 bg-yellow-400/20 text-yellow-300"
                      : "border-gray-600 bg-gray-700 text-gray-400"
                  }`}
                >
                  {char.name.charAt(0)}
                </div>
              )}
            </div>
            <span
              className={`text-[9px] mt-1 truncate max-w-[3.5rem] text-center leading-none ${
                isCurrent
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
  const [battleFormMap, setBattleFormMap] = useState<Record<string, string>>({}); // charId -> active formId
  const [skillLevelMap, setSkillLevelMap] = useState<Record<string, number>>({}); // skillId -> current level (1-3, default 1)
  const [expandedTemplateSkillId, setExpandedTemplateSkillId] = useState<string | null>(null);
  const [selectedTemplateActionId, setSelectedTemplateActionId] = useState<string | null>(null);
  const [templatePreviewTargetId, setTemplatePreviewTargetId] = useState<string>("");
  const [teamEnergy, setTeamEnergy] = useState<Record<string, Record<string, number>>>({});
  const [battleLog, setBattleLog] = useState<string[]>([]);

  const addBattleLog = (entry: string) => {
    setBattleLog((prev) => [...prev, entry]);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Characters currently placed on either team
  const placedIds = new Set(
    teams.flatMap((t) => t.placements.map((p) => p.characterId))
  );
  const bench = characters.filter((c) => !placedIds.has(c.id));

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
    // Initialize form map: each character starts with their first form
    const formMap: Record<string, string> = {};
    for (const team of teams) {
      for (const p of team.placements) {
        const charForms = getFormsForCharacter(p.characterId);
        if (charForms.length > 0) formMap[p.characterId] = charForms[0].id;
      }
    }
    setBattleFormMap(formMap);
    setBuffsMap({});
    setSkillLevelMap({});
    setTeamEnergy(generateTeamEnergy(formMap));
    setBattleLog([]);
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
    setTeamEnergy({});
    setHoveredCharId(null);
    setViewedCharId(null);
    setBattleFormMap({});
  };

  // Tick buffs for a specific character (called when their turn ends)
  const tickBuffsForCharacter = (charId: string) => {
    setBuffsMap((prev) => {
      const charBuffs = prev[charId];
      if (!charBuffs || charBuffs.length === 0) return prev;
      const updated = charBuffs
        .map((b) => b.duration <= 0 ? b : { ...b, duration: b.duration - 1 })
        .filter((b) => b.duration !== 0);
      return { ...prev, [charId]: updated };
    });
  };

  // Process effect tags at start of turn. Returns true if the character should skip their turn.
  const processStartOfTurn = (charId: string): boolean => {
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
          addBattleLog(`${char.name} takes ${dmg} ${(p.damageType as string) ?? "true"} damage from ${b.effectName}.`);
        } else if (tag.type === "hot") {
          const pct = ((p.percent as number) ?? 5) / 100;
          const heal = Math.ceil(char.stats.hp * pct);
          const cur = currentHpMap[charId] ?? char.stats.hp;
          setCurrentHpMap((prev) => ({ ...prev, [charId]: Math.min(char.stats.hp, cur + heal) }));
          addBattleLog(`${char.name} heals ${heal} HP from ${b.effectName}.`);
        } else if (tag.type === "skip-turn" || tag.type === "eject") {
          skipTurn = true;
          addBattleLog(`${char.name} is affected by ${b.effectName} and loses their turn!`);
        }
      }
    }
    return skipTurn;
  };

  const advanceToTurn = (nextIdx: number, nextRound?: boolean) => {
    if (nextRound) {
      const order = computeTurnOrder(teams, getCharacter, speedOverrides);
      setTurnOrder(order);
      setRound((prev) => prev + 1);
      setCurrentTurnIndex(0);
      setTeamEnergy(generateTeamEnergy(battleFormMap));
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
    // Tick buffs for the character whose turn just ended
    const endingCharId = turnOrder[currentTurnIndex]?.characterId;
    if (endingCharId) tickBuffsForCharacter(endingCharId);
    advanceToTurn(currentTurnIndex + 1);
  };

  const endRound = () => {
    // Tick buffs for the last character whose turn just ended
    const endingCharId = turnOrder[currentTurnIndex]?.characterId;
    if (endingCharId) tickBuffsForCharacter(endingCharId);
    advanceToTurn(0, true);
  };

  // Spend energy for a skill
  const useSkillEnergy = (skillId: string) => {
    if (!activeCharId) return;
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    const assign = characterSkills.find((cs) => cs.characterId === activeCharId && cs.skillId === skillId);
    const canLevel = (skill.skillType === "ability" && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);
    const currentLevel = canLevel ? (skillLevelMap[skillId] ?? 1) : 1;
    const levelIdx = currentLevel - 1;
    const cost = skill.levels[levelIdx]?.cost ?? [];
    if (cost.length === 0) return;

    // Find which team the active character is on
    const charSide = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
    if (!charSide) return;

    setTeamEnergy((prev) => {
      const sideEnergy = { ...(prev[charSide] ?? {}) };
      for (const c of cost) {
        sideEnergy[c.color] = (sideEnergy[c.color] ?? 0) - c.amount;
      }
      return { ...prev, [charSide]: sideEnergy };
    });
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
    return cost.every((c) => (sideEnergy[c.color] ?? 0) >= c.amount);
  };

  const isLastTurn = currentTurnIndex >= turnOrder.length - 1;
  const activeCharId = turnOrder[currentTurnIndex]?.characterId ?? null;
  const currentTurnChar = activeCharId ? getCharacter(activeCharId) : null;
  // The side panel shows the viewed char, or falls back to the active turn char
  const panelCharId = phase === "battle" ? (viewedCharId ?? activeCharId) : null;
  const isViewingNonActive = viewedCharId !== null && viewedCharId !== activeCharId;
  // During battle, highlight the panel character on the grid
  const gridSelectedId = phase === "battle" ? panelCharId : selectedCharId;

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
            {isLastTurn ? (
              <button
                onClick={endRound}
                className="text-xs px-4 py-1.5 rounded bg-yellow-600 hover:bg-yellow-500 text-white font-medium"
              >
                End Round
              </button>
            ) : (
              <button
                onClick={nextTurn}
                className="text-xs px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                Next Turn
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
          {/* Left column: Battlefield (top) + Active character (bottom) */}
          <div className="shrink-0 space-y-3">
            {/* Battlefield grid */}
            <div>
              <EnergyPool teams={teams} getCharacter={getCharacter} getEnergyForChar={getEnergyForChar} currentEnergy={teamEnergy} />
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

              return (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
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

                  {/* Skills row */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      ...(aResolved.innate ? [{ skill: aResolved.innate, type: "innate" as const }] : []),
                      ...(aResolved.basic ? [{ skill: aResolved.basic, type: "basic" as const }] : []),
                      ...aResolved.abilities.map((s) => ({ skill: s, type: "ability" as const })),
                      ...aResolved.conditionals.map((s) => ({ skill: s, type: "conditional" as const })),
                    ].map(({ skill, type }) => {
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

                      return (
                        <div key={skill.id} className={`w-24 ${bgClass} border rounded text-left transition-colors flex flex-col ${isExpanded ? "ring-1 ring-blue-400/50" : ""}`}>
                          <button
                            onClick={() => {
                              if (hasTemplate) {
                                setExpandedTemplateSkillId(isExpanded ? null : skill.id);
                              } else {
                                setSelectedSkill(skill);
                              }
                            }}
                            className="px-2 py-1 flex-1 flex flex-col"
                          >
                            <div className="flex items-center justify-between shrink-0">
                              <span className={`text-[9px] ${typeColor} uppercase font-medium`}>{typeLabel}</span>
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
                          {canLevel && currentLevel < maxLevel && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSkillLevelMap((prev) => {
                                  const next = { ...prev, [skill.id]: currentLevel + 1 };
                                  // Sync variant group — all skills with same variantGroupId share level
                                  if (skillAssign?.variantGroupId) {
                                    for (const cs of characterSkills) {
                                      if (cs.variantGroupId === skillAssign.variantGroupId && cs.skillId !== skill.id) {
                                        next[cs.skillId] = currentLevel + 1;
                                      }
                                    }
                                  }
                                  return next;
                                });
                              }}
                              className="w-full text-[8px] text-center py-0.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 font-medium border-t border-gray-700/50 transition-colors"
                            >
                              ↑ Upgrade
                            </button>
                          )}
                          {(
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                useSkillEnergy(skill.id);
                                addBattleLog(`Round ${round}. ${aChar.name} uses ${skill.name}.`);
                              }}
                              disabled={!canAffordSkill(skill.id)}
                              className={`w-full text-[8px] text-center py-0.5 font-medium border-t border-gray-700/50 transition-colors ${
                                canAffordSkill(skill.id)
                                  ? "bg-green-600/20 hover:bg-green-600/40 text-green-300"
                                  : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
                              }`}
                            >
                              Use
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

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
                    const validTargets = allPlaced.filter((p) => {
                      if (isAllyTarget) return p.side === attackerSideLocal && (isSelfTarget || p.charId !== activeCharId);
                      if (isSelfTarget && targetType === "self") return p.charId === activeCharId;
                      if (isEnemyTarget) return p.side !== attackerSideLocal;
                      return p.charId !== activeCharId; // default: everyone except self
                    });
                    // For self-only or ally-or-self, include self
                    if (isSelfTarget && !validTargets.some((t) => t.charId === activeCharId)) {
                      validTargets.unshift({ charId: activeCharId, side: attackerSideLocal ?? "left" });
                    }

                    const previewTarget = templatePreviewTargetId || validTargets[0]?.charId || "";

                    // Compute damage preview for selected template action
                    let actionPreview: DamageResult | null = null;
                    if (selSkill?.levels[0]?.damageCategory && activeCharId) {
                      const aFormId2 = battleFormMap[activeCharId] ?? null;
                      const aForm2 = aFormId2 ? getFormsForCharacter(activeCharId).find((f) => f.id === aFormId2) : null;
                      const aChar2 = getCharacter(activeCharId);
                      const targetChar = previewTarget ? getCharacter(previewTarget) : null;
                      if (aChar2 && targetChar) {
                        const aStats2 = aForm2?.statOverrides ? { ...aChar2.stats, ...aForm2.statOverrides } : aChar2.stats;
                        const aElemDmg2 = aForm2?.elementalDmgOverride ? { ...aChar2.elementalDamage, ...aForm2.elementalDmgOverride } : aChar2.elementalDamage;
                        const dFormId2 = battleFormMap[targetChar.id] ?? null;
                        const dForm2 = dFormId2 ? getFormsForCharacter(targetChar.id).find((f) => f.id === dFormId2) : null;
                        const dStats2 = dForm2?.statOverrides ? { ...targetChar.stats, ...dForm2.statOverrides } : targetChar.stats;
                        const dElemRes2 = dForm2?.elementalResOverride ? { ...targetChar.elementalResistance, ...dForm2.elementalResOverride } : targetChar.elementalResistance;
                        actionPreview = calculateDamage(
                          { stats: aStats2, elementalResistance: aChar2.elementalResistance, elementalDamage: aElemDmg2, buffs: buffsMap[activeCharId] ?? [] },
                          { stats: dStats2, elementalResistance: dElemRes2, elementalDamage: targetChar.elementalDamage, buffs: buffsMap[targetChar.id] ?? [] },
                          selSkill.levels[0]
                        );
                      }
                    }

                    return (
                      <div className="bg-gray-800/50 border border-gray-700 rounded p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-blue-400 font-medium">{tmpl.name}</span>
                          <button onClick={() => { setExpandedTemplateSkillId(null); setSelectedTemplateActionId(null); }} className="text-[10px] text-gray-500 hover:text-gray-300">×</button>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {resolvedActions.map(({ action, skill }) => {
                            const spellCost = skill!.levels[0].cost;
                            const canAffordSpell = (() => {
                              if (spellCost.length === 0) return true;
                              const charSide = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
                              if (!charSide) return false;
                              const sideEnergy = teamEnergy[charSide] ?? {};
                              return spellCost.every((c) => (sideEnergy[c.color] ?? 0) >= c.amount);
                            })();
                            return (
                              <div key={action.id} className={`bg-gray-800 border rounded overflow-hidden transition-colors ${
                                selectedTemplateActionId === action.id ? "border-blue-500 ring-1 ring-blue-500/30" : "border-gray-700"
                              }`}>
                                <button
                                  onClick={() => setSelectedTemplateActionId(selectedTemplateActionId === action.id ? null : action.id)}
                                  className="w-full px-2 py-1 text-left hover:bg-gray-700 transition-colors"
                                >
                                  <div className="text-[11px] text-white font-medium">{skill!.name}</div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {spellCost.length > 0 && <EnergyCostDisplay cost={spellCost} />}
                                    {skill!.levels[0].damageCategory && (
                                      <span className="text-[8px] text-gray-500">
                                        {DAMAGE_TIER_LABELS[(skill!.levels[0].damageTier ?? "moderate") as DamageTier]} {DAMAGE_CATEGORY_LABELS[skill!.levels[0].damageCategory]}
                                      </span>
                                    )}
                                  </div>
                                </button>
                                {(
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!canAffordSpell || !activeCharId) return;
                                      if (spellCost.length > 0) {
                                        const charSide = teams.find((t) => t.placements.some((p) => p.characterId === activeCharId))?.side;
                                        if (!charSide) return;
                                        setTeamEnergy((prev) => {
                                          const sideEnergy = { ...(prev[charSide] ?? {}) };
                                          for (const c of spellCost) {
                                            sideEnergy[c.color] = (sideEnergy[c.color] ?? 0) - c.amount;
                                          }
                                          return { ...prev, [charSide]: sideEnergy };
                                        });
                                      }
                                      addBattleLog(`Round ${round}. ${aChar.name} uses ${skill!.name}.`);
                                    }}
                                    disabled={!canAffordSpell}
                                    className={`w-full text-[8px] text-center py-0.5 font-medium border-t border-gray-700/50 transition-colors ${
                                      canAffordSpell
                                        ? "bg-green-600/20 hover:bg-green-600/40 text-green-300"
                                        : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
                                    }`}
                                  >
                                    Use
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Selected action detail + damage preview */}
                        {selSkill && (
                          <div className="bg-gray-900/50 rounded p-2 space-y-2">
                            <div className="text-xs text-white font-medium">{selSkill.name}</div>
                            {selSkill.description && <p className="text-[10px] text-gray-400"><GlossaryText text={selSkill.description} /></p>}
                            {selSkill.levels[0].targetType && <span className="text-[9px] text-gray-500">{TARGET_TYPE_LABELS[selSkill.levels[0].targetType]}</span>}

                            {selSkill.levels[0].damageCategory && (
                              <div className="border-t border-gray-800 pt-2 space-y-1">
                                <span className="text-[9px] text-gray-500 uppercase">Damage Preview</span>
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
                                {actionPreview && (
                                  <div className="mt-1">
                                    <span className={`text-lg font-bold ${actionPreview.isHealing ? "text-green-400" : "text-red-400"}`}>
                                      {actionPreview.isHealing ? "+" : "-"}{actionPreview.finalDamage}
                                    </span>
                                    <div className="space-y-0.5 mt-1">
                                      {actionPreview.breakdown.map((line, i) => (
                                        <p key={i} className="text-[9px] text-gray-500">{line}</p>
                                      ))}
                                    </div>
                                    {previewTarget && actionPreview.finalDamage > 0 && (
                                      <button
                                        onClick={() => {
                                          const target = getCharacter(previewTarget);
                                          if (!target) return;
                                          const maxHp = target.stats.hp;
                                          const cur = currentHpMap[previewTarget] ?? maxHp;
                                          const newHp = actionPreview!.isHealing
                                            ? Math.min(maxHp, cur + actionPreview!.finalDamage)
                                            : Math.max(0, cur - actionPreview!.finalDamage);
                                          setCurrentHpMap((prev) => ({ ...prev, [previewTarget]: newHp }));
                                          setViewedCharId(previewTarget);
                                          // Use energy for the parent template skill
                                          if (expandedTemplateSkillId) useSkillEnergy(expandedTemplateSkillId);
                                          // Log
                                          const dmgText = actionPreview!.isHealing
                                            ? `healing ${target.name} for ${actionPreview!.finalDamage} HP`
                                            : `dealing ${actionPreview!.finalDamage} ${selSkill!.levels[0].damageCategory ?? "physical"} damage`;
                                          addBattleLog(`Round ${round}. ${aChar.name} uses ${selSkill!.name} on ${target.name} ${dmgText}.`);
                                          // Auto-advance turn if parent skill is not instant
                                          if (!expSkill.levels[expLevel]?.instant) {
                                            if (isLastTurn) { endRound(); } else { nextTurn(); }
                                          }
                                        }}
                                        className={`mt-1 text-[10px] px-2 py-1 rounded text-white font-medium ${actionPreview.isHealing ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
                                      >
                                        Apply and Use
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>

          {/* Right column: Selected character details (full height) */}
          <div className="flex-1 min-w-0">
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
                onSetFormId={(fid) => setBattleFormMap((prev) => ({ ...prev, [viewedCharId]: fid }))}
                onSelectSkill={setSelectedSkill}
                onSetHp={(charId, hp) =>
                  setCurrentHpMap((prev) => ({ ...prev, [charId]: hp }))
                }
                onAddBuff={(charId, buff) => {
                  setBuffsMap((prev) => {
                    const existing = prev[charId] ?? [];
                    const { buffs: updated, triggered } = applyBuffStacking(existing, buff);
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

      {/* Battle Log */}
      {phase === "battle" && battleLog.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800">
            <span className="text-xs text-gray-400 font-medium">Battle Log</span>
            <button
              onClick={() => setBattleLog([])}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto p-2 space-y-0.5">
            {battleLog.map((entry, i) => (
              <p key={i} className="text-[11px] text-gray-300">{entry}</p>
            ))}
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
          attackerChar={phase === "battle" && panelCharId ? getCharacter(panelCharId) : undefined}
          teams={phase === "battle" ? teams : undefined}
          getCharacterFn={getCharacter}
          buffsMap={phase === "battle" ? buffsMap : undefined}
          battleFormMap={phase === "battle" ? battleFormMap : undefined}
          getFormsForCharacter={getFormsForCharacter}
          currentHpMap={phase === "battle" ? currentHpMap : undefined}
          skillLevelMap={phase === "battle" ? skillLevelMap : undefined}
          onClose={() => setSelectedSkill(null)}
          onViewSkill={setSelectedSkill}
          onApplyDamage={phase === "battle" ? (targetId, newHp) => {
            setCurrentHpMap((prev) => ({ ...prev, [targetId]: newHp }));
          } : undefined}
          onApplyAndUse={phase === "battle" ? (targetEntries, skillUsed) => {
            // Apply all damage/healing
            setCurrentHpMap((prev) => {
              const next = { ...prev };
              for (const { targetId, newHp } of targetEntries) {
                next[targetId] = newHp;
              }
              return next;
            });
            // Use energy
            useSkillEnergy(skillUsed.id);
            // Log
            const attackerName = panelCharId ? getCharacter(panelCharId)?.name ?? "Unknown" : "Unknown";
            if (targetEntries.length === 1) {
              const t = targetEntries[0];
              const targetName = getCharacter(t.targetId)?.name ?? "Unknown";
              const dmgText = t.isHealing
                ? `healing ${targetName} for ${t.amount} HP`
                : `dealing ${t.amount} ${t.category ?? "physical"} damage to ${targetName}`;
              addBattleLog(`Round ${round}. ${attackerName} uses ${skillUsed.name} ${dmgText}.`);
            } else {
              const totalDmg = targetEntries.reduce((sum, t) => sum + t.amount, 0);
              const isHealing = targetEntries[0]?.isHealing ?? false;
              const dmgText = isHealing
                ? `healing ${targetEntries.length} targets for ${totalDmg} total HP`
                : `dealing ${totalDmg} total ${targetEntries[0]?.category ?? "physical"} damage to ${targetEntries.length} targets`;
              addBattleLog(`Round ${round}. ${attackerName} uses ${skillUsed.name} ${dmgText}.`);
            }
            // Apply skill effects (buff/debuff applications)
            const canLevel = (skillUsed.skillType === "ability" && skillUsed.leveled !== false) || (skillUsed.skillType === "conditional" && skillUsed.leveled);
            const lvlIdx = canLevel ? (skillLevelMap[skillUsed.id] ?? 1) - 1 : 0;
            const levelEffects = skillUsed.levels[lvlIdx]?.effects ?? [];
            if (levelEffects.length > 0 && panelCharId) {
              for (const eff of levelEffects) {
                const se = statusEffects.find((s) => s.id === eff.effectId);
                if (!se) continue;
                // Roll chance
                if (eff.chance !== undefined && eff.chance < 100) {
                  const roll = Math.random() * 100;
                  if (roll >= eff.chance) {
                    addBattleLog(`${attackerName}'s ${se.name} missed! (${eff.chance}% chance)`);
                    continue;
                  }
                }
                // Resolve targets for this effect
                const effTargets = resolveTargets(eff.targetType, panelCharId, teams, getCharacter);
                const targetIds = effTargets.targets.map((t) => t.characterId);
                // If the effect targets the same as the damage targets and there's only one, use that
                const resolvedIds = targetIds.length > 0 ? targetIds
                  : targetEntries.length > 0 ? targetEntries.map((t) => t.targetId)
                  : [];
                const buff: Omit<BuffDebuff, "id"> = {
                  effectId: se.id,
                  effectName: se.name,
                  category: se.category,
                  stats: se.stats,
                  modifier: !se.stats.includes("none") ? eff.modifier : 0,
                  duration: eff.duration,
                  source: skillUsed.name,
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
                  addBattleLog(`${se.name}${modText} applied to ${tName} for ${eff.duration} turns.`);
                }
              }
            }
            // Close modal
            setSelectedSkill(null);
            if (!skillUsed.levels[lvlIdx]?.instant) {
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
  onSetFormId,
  onSelectSkill,
  onSetHp,
  onAddBuff,
  onRemoveBuff,
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
  onSetFormId: (formId: string) => void;
  onSelectSkill: (skill: Skill) => void;
  onSetHp: (charId: string, hp: number) => void;
  onAddBuff: (charId: string, buff: Omit<BuffDebuff, "id">) => void;
  onRemoveBuff: (charId: string, buffId: string) => void;
  onClose: () => void;
}) {
  const char = getCharacter(characterId);
  if (!char) return null;

  const formId = activeFormId ?? charForms[0]?.id ?? null;
  const activeForm = charForms.find((f) => f.id === formId);
  const panelPhoto = activeForm?.photoUrl ?? char.photoUrl;
  const panelType = activeForm?.typeOverride ?? char.type;
  const panelEnergy = activeForm?.energyOverride ?? char.energyGeneration;
  const panelStats = activeForm?.statOverrides ? { ...char.stats, ...activeForm.statOverrides } : char.stats;

  const currentHp = currentHpMap[char.id] ?? char.stats.hp;
  const maxHp = char.stats.hp;
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500";

  const panelElemRes = activeForm?.elementalResOverride ? { ...char.elementalResistance, ...activeForm.elementalResOverride } : char.elementalResistance;
  const panelElemDmg = activeForm?.elementalDmgOverride ? { ...char.elementalDamage, ...activeForm.elementalDmgOverride } : char.elementalDamage;

  const buffedElemRes: Record<string, number> = {};
  const buffedElemDmg: Record<string, number> = {};
  for (const elem of ELEMENTS) {
    buffedElemRes[elem] = panelElemRes[elem] + getBuffModifier(buffs, `eleRes.${elem}`);
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
          {resolved.basic && (
            <button onClick={() => onSelectSkill(resolved.basic!)} className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 border border-transparent hover:border-gray-600 transition-colors">
              <div className="text-[9px] text-blue-400 uppercase font-medium">Basic</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{resolved.basic.name}</span>
                {resolved.basic.levels[0].cost.length > 0 && <EnergyCostDisplay cost={resolved.basic.levels[0].cost} />}
              </div>
              {resolved.basic.description && <p className="text-xs text-gray-400 mt-0.5">{resolved.basic.description}</p>}
            </button>
          )}
          {/* Abilities */}
          {resolved.abilities.map((skill) => (
            <button key={skill.id} onClick={() => onSelectSkill(skill)} className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 border border-transparent hover:border-gray-600 transition-colors">
              <div className="text-[9px] text-green-400 uppercase font-medium">Ability</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{skill.name}</span>
                {skill.levels[0].cost.length > 0 && <EnergyCostDisplay cost={skill.levels[0].cost} />}
              </div>
              {skill.description && <p className="text-xs text-gray-400 mt-0.5">{skill.description}</p>}
            </button>
          ))}
          {/* Conditionals */}
          {resolved.conditionals.map((skill) => (
            <button key={skill.id} onClick={() => onSelectSkill(skill)} className="w-full text-left bg-amber-900/20 hover:bg-amber-900/30 rounded p-2 border border-amber-700/30 hover:border-amber-600/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="text-[9px] text-amber-400 uppercase font-medium">Conditional</div>
                <span className="text-[10px] text-amber-400/70">Auto</span>
              </div>
              <span className="text-sm font-semibold text-amber-200">{skill.name}</span>
              {skill.description && <p className="text-xs text-gray-400 mt-0.5">{skill.description}</p>}
            </button>
          ))}
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
  const panelStats = activeForm?.statOverrides
    ? { ...char.stats, ...activeForm.statOverrides }
    : char.stats;

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
          {buffs.map((b) => (
            <div key={b.id} className="flex items-center gap-1.5 text-[11px] bg-gray-800/50 rounded px-2 py-1">
              <span className={`font-bold ${b.category === "buff" ? "text-green-400" : b.category === "status" ? "text-yellow-400" : "text-red-400"}`}>
                {b.effectName}
              </span>
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
          ))}
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
  onClose: () => void;
  onSelectSkill: (skill: Skill) => void;
  onToggleEquip: (charId: string, skillId: string) => void;
}) {
  const char = getCharacter(characterId);
  if (!char) return null;

  const lo = char.equippedLoadout;
  const charAssigns = characterSkills.filter((cs) => cs.characterId === characterId);
  const charSkillIds = new Set(charAssigns.map((cs) => cs.skillId));
  const baseSkills = skills.filter(
    (s) => charSkillIds.has(s.id) && s.skillType !== "conditional"
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
          {char.photoUrl ? (
            <img
              src={char.photoUrl}
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
              <span>{char.type}</span>
              <span className="text-gray-600">·</span>
              <span className="inline-flex gap-0.5">
                {char.energyGeneration.map((eg) =>
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

      {/* Stats */}
      <div className="grid grid-cols-6 gap-2 max-w-sm">
        {(["hp", "atk", "mAtk", "def", "spi", "spd"] as const).map((key) => (
          <div key={key} className="text-center bg-gray-800 rounded p-1.5">
            <div className="text-[10px] uppercase text-gray-500">{key}</div>
            <div className="text-sm font-bold text-white">{char.stats[key]}</div>
          </div>
        ))}
      </div>

      {/* Skills */}
      {(["innate", "basic", "ability"] as const).map((type) => {
        const typeSkills = baseSkills.filter((s) => s.skillType === type);
        const label = type === "innate" ? "Innate" : type === "basic" ? "Basic" : "Abilities";
        const eqCount = type === "ability" ? lo.abilityIds.length : (type === "innate" ? (lo.innateId ? 1 : 0) : (lo.basicId ? 1 : 0));
        const maxEquip = type === "ability" ? 3 : 1;

        if (isPlaced) {
          const equipped = typeSkills.filter((s) => isSkillEquipped(s));
          return (
            <div key={type}>
              <span className="text-gray-500 font-medium text-xs uppercase">
                {label} ({eqCount}/{maxEquip})
              </span>
              {equipped.length === 0 ? (
                <p className="text-xs text-gray-500 mt-1">None equipped</p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  {equipped.map((skill) => (
                    <button key={skill.id} onClick={() => onSelectSkill(skill)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 border border-transparent hover:border-gray-600 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{skill.name}</span>
                        {skill.levels[0].cost.length > 0 && <EnergyCostDisplay cost={skill.levels[0].cost} />}
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{skill.description || skill.levels[0].description ? <GlossaryText text={skill.description || skill.levels[0].description} /> : "(no description)"}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }

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
  onClose,
  onViewSkill,
  onApplyDamage,
  onApplyAndUse,
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
  onApplyDamage?: (targetId: string, newHp: number) => void;
  onApplyAndUse?: (targets: { targetId: string; newHp: number; amount: number; isHealing: boolean; category?: string }[], skill: Skill) => void;
}) {
  const [previewTargetId, setPreviewTargetId] = useState<string>("");
  const currentSkillLevel = skillLevelMap?.[skill.id] ?? 1;
  const [previewLevel, setPreviewLevel] = useState(currentSkillLevel - 1);
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
            {(skillLevelMap ? [currentSkillLevel - 1] : [0, 1, 2]).map((i) => {
              const level = skill.levels[i];
              if (!level) return null;
              const lvTemplate = getTemplateForLevel(i);
              const lvActions = getActionsForLevel(i);
              return (
                <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase">
                      Level {i + 1}
                    </span>
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

        {/* Damage Preview */}
        {attackerChar && modalTeams && getCharacterFn && skill.levels.some((lv) => lv.damageCategory) && (() => {
          const effectiveLevel = skillLevelMap ? currentSkillLevel - 1 : previewLevel;
          const level = skill.levels[effectiveLevel];
          if (!level?.damageCategory) return null;

          const targeting = resolveTargets(level.targetType, attackerChar.id, modalTeams, getCharacterFn);
          const isAoe = targeting.mode === "aoe";
          const isSelf = targeting.mode === "self";

          // Resolve attacker combat stats
          const aFormId = battleFormMap?.[attackerChar.id];
          const aForm = aFormId && getFormsForCharacter ? getFormsForCharacter(attackerChar.id).find((f) => f.id === aFormId) : null;
          const aStats = aForm?.statOverrides ? { ...attackerChar.stats, ...aForm.statOverrides } : attackerChar.stats;
          const aElemDmg = aForm?.elementalDmgOverride ? { ...attackerChar.elementalDamage, ...aForm.elementalDmgOverride } : attackerChar.elementalDamage;
          const attackerCombat = { stats: aStats, elementalResistance: attackerChar.elementalResistance, elementalDamage: aElemDmg, buffs: buffsMap?.[attackerChar.id] ?? [] };

          const calcForTarget = (targetId: string): DamageResult | null => {
            const targetChar = getCharacterFn(targetId);
            if (!targetChar) return null;
            const dFormId = battleFormMap?.[targetId];
            const dForm = dFormId && getFormsForCharacter ? getFormsForCharacter(targetId).find((f) => f.id === dFormId) : null;
            const dStats = dForm?.statOverrides ? { ...targetChar.stats, ...dForm.statOverrides } : targetChar.stats;
            const dElemRes = dForm?.elementalResOverride ? { ...targetChar.elementalResistance, ...dForm.elementalResOverride } : targetChar.elementalResistance;
            return calculateDamage(attackerCombat, { stats: dStats, elementalResistance: dElemRes, elementalDamage: targetChar.elementalDamage, buffs: buffsMap?.[targetId] ?? [] }, level);
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
                  {onApplyAndUse && results.length > 0 && (
                    <button
                      onClick={() => {
                        const entries = results.filter((r) => r.result).map(({ target, result }) => {
                          const t = getCharacterFn!(target.characterId);
                          const maxHp = t?.stats.hp ?? 100;
                          const cur = (currentHpMap ?? {})[target.characterId] ?? maxHp;
                          const newHp = result!.isHealing ? Math.min(maxHp, cur + result!.finalDamage) : Math.max(0, cur - result!.finalDamage);
                          return { targetId: target.characterId, newHp, amount: result!.finalDamage, isHealing: result!.isHealing, category: level.damageCategory };
                        });
                        onApplyAndUse(entries, skill);
                      }}
                      className={`w-full text-[10px] px-2 py-1.5 rounded text-white font-medium ${isHealing ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
                    >
                      Apply and Use
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // Dropdown mode: single target selection
          if (targeting.mode === "dropdown" && targeting.targets.length > 0) {
            const selectedTarget = previewTargetId || targeting.targets[0]?.characterId || "";
            const result = selectedTarget ? calcForTarget(selectedTarget) : null;

            return (
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <span className="text-[10px] text-gray-500 uppercase font-medium">Damage Preview</span>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none"
                  value={selectedTarget}
                  onChange={(e) => setPreviewTargetId(e.target.value)}
                >
                  {targeting.targets.map((t) => (
                    <option key={t.characterId} value={t.characterId}>{t.label}</option>
                  ))}
                </select>
                {result && (
                  <div className="bg-gray-800 rounded p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-lg font-bold ${result.isHealing ? "text-green-400" : "text-red-400"}`}>
                        {result.isHealing ? "+" : "-"}{result.finalDamage}
                      </span>
                      {onApplyAndUse && (
                        <button
                          onClick={() => {
                            const t = getCharacterFn!(selectedTarget);
                            const maxHp = t?.stats.hp ?? 100;
                            const cur = (currentHpMap ?? {})[selectedTarget] ?? maxHp;
                            const newHp = result.isHealing ? Math.min(maxHp, cur + result.finalDamage) : Math.max(0, cur - result.finalDamage);
                            onApplyAndUse([{ targetId: selectedTarget, newHp, amount: result.finalDamage, isHealing: result.isHealing, category: level.damageCategory }], skill);
                          }}
                          className={`text-[10px] px-2 py-1 rounded text-white font-medium ${result.isHealing ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
                        >
                          Apply and Use
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {result.breakdown.map((line, i) => (
                        <p key={i} className="text-[10px] text-gray-400">{line}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return null;
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
