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
import { Character, Skill, Team, PlacedCharacter, EnergyColor, SKILL_TYPE_LABELS } from "@/lib/types";
import { EnergyBadge, EnergyCostDisplay } from "@/components/EnergyBadge";

const COL_LABELS = ["Front", "Mid", "Back"];
const COLS = [0, 1, 2];
const ROWS = [0, 1, 2];

function CharacterChip({
  character,
  isDragging,
  flipImage,
  isSelected,
  currentHp,
  maxHp,
}: {
  character: Character;
  isDragging?: boolean;
  flipImage?: boolean;
  isSelected?: boolean;
  currentHp?: number;
  maxHp?: number;
}) {
  const showHp = currentHp !== undefined && maxHp !== undefined;
  const hpPct = showHp ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div
      className={`px-2 py-1.5 rounded text-xs font-medium bg-gray-700 border text-white select-none flex items-center gap-1.5 transition-colors duration-150 ${
        isDragging ? "opacity-50" : ""
      } ${isSelected ? "border-blue-400 ring-1 ring-blue-400/50" : "border-gray-600"}`}
    >
      {character.photoUrl ? (
        <img
          src={character.photoUrl}
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
  onSelect,
}: {
  character: Character;
  source: string;
  flipImage?: boolean;
  isSelected?: boolean;
  currentHp?: number;
  maxHp?: number;
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
      <CharacterChip character={character} isDragging={isDragging} flipImage={flipImage} isSelected={isSelected} currentHp={currentHp} maxHp={maxHp} />
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

function EnergyPool({ teams, getCharacter }: { teams: Team[]; getCharacter: (id: string) => Character | undefined }) {
  const pools: { side: string; energy: Record<EnergyColor, number> }[] = teams.map((team) => {
    const energy: Record<EnergyColor, number> = {
      red: 0,
      blue: 0,
      green: 0,
      purple: 0,
      yellow: 0,
    };
    team.placements.forEach((p) => {
      const char = getCharacter(p.characterId);
      if (char) {
        char.energyGeneration.forEach((eg) => {
          energy[eg.color] += eg.amount;
        });
      }
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
}: {
  turnOrder: TurnEntry[];
  currentTurnIndex: number;
  hoveredCharId: string | null;
  getCharacter: (id: string) => Character | undefined;
}) {
  return (
    <div className="flex gap-1 items-center justify-center flex-wrap h-[72px]">
      {turnOrder.map((entry, i) => {
        const char = getCharacter(entry.characterId);
        if (!char) return null;
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
              {char.photoUrl ? (
                <img
                  src={char.photoUrl}
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
  const { characters, skills, teams, updateTeam, updateCharacter, getCharacter, getSkill } = useStore();
  const [activeChar, setActiveChar] = useState<Character | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);

  // Battle state
  const [phase, setPhase] = useState<BattlePhase>("staging");
  const [round, setRound] = useState(1);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [turnOrder, setTurnOrder] = useState<TurnEntry[]>([]);
  const [speedOverrides, setSpeedOverrides] = useState<Record<string, number>>({});
  const [currentHpMap, setCurrentHpMap] = useState<Record<string, number>>({});
  const [viewedCharId, setViewedCharId] = useState<string | null>(null); // battle side panel

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
    setPhase("battle");
  };

  const endBattle = () => {
    setPhase("staging");
    setTurnOrder([]);
    setRound(1);
    setCurrentTurnIndex(0);
    setSpeedOverrides({});
    setCurrentHpMap({});
    setHoveredCharId(null);
    setViewedCharId(null);
  };

  const nextTurn = () => {
    setCurrentTurnIndex((prev) => prev + 1);
    setViewedCharId(null); // snap back to active
  };

  const endRound = () => {
    const order = computeTurnOrder(teams, getCharacter, speedOverrides);
    setTurnOrder(order);
    setRound((prev) => prev + 1);
    setCurrentTurnIndex(0);
    setViewedCharId(null); // snap back to active
  };

  const isLastTurn = currentTurnIndex >= turnOrder.length - 1;
  const activeCharId = turnOrder[currentTurnIndex]?.characterId ?? null;
  const currentTurnChar = activeCharId ? getCharacter(activeCharId) : null;
  // The side panel shows the viewed char, or falls back to the active turn char
  const panelCharId = phase === "battle" ? (viewedCharId ?? activeCharId) : null;
  const isViewingNonActive = viewedCharId !== null && viewedCharId !== activeCharId;
  // During battle, highlight the panel character on the grid
  const gridSelectedId = phase === "battle" ? panelCharId : selectedCharId;

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
                        setViewedCharId(id === activeCharId ? null : id);
                        setHoveredCharId(null);
                      } else {
                        setSelectedCharId(id);
                      }
                    }}
                    selectedCharId={gridSelectedId}
                    hpMap={phase === "battle" ? currentHpMap : undefined}
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
                        setViewedCharId(id === activeCharId ? null : id);
                        setHoveredCharId(null);
                      } else {
                        setSelectedCharId(id);
                      }
                    }}
                    selectedCharId={gridSelectedId}
                    hpMap={phase === "battle" ? currentHpMap : undefined}
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
          />
        </div>
      )}

      {phase === "staging" ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <EnergyPool teams={teams} getCharacter={getCharacter} />
          {renderGrid()}

          <div className="mt-6">
            <h2 className="text-sm font-medium text-gray-400 mb-2">
              Bench (drag characters onto the grid)
            </h2>
            <BenchDropZone bench={bench} selectedCharId={selectedCharId} onSelectCharacter={setSelectedCharId} />
          </div>

          <DragOverlay>
            {activeChar && <CharacterChip character={activeChar} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex gap-6 items-start">
          {/* Left: Battlefield grid */}
          <div className="flex-1 min-w-0">
            <EnergyPool teams={teams} getCharacter={getCharacter} />
            {renderGrid()}
          </div>

          {/* Right: Character info panel */}
          {panelCharId && (
            <div className="w-80 shrink-0">
              {isViewingNonActive && (
                <button
                  onClick={() => setViewedCharId(null)}
                  className="text-xs text-gray-400 hover:text-gray-200 mb-2"
                >
                  &larr; Back to {currentTurnChar?.name ?? "active"}
                </button>
              )}
              <BattleSidePanel
                characterId={panelCharId}
                isActive={panelCharId === activeCharId}
                getCharacter={getCharacter}
                getSkill={getSkill}
                skills={skills}
                currentHpMap={currentHpMap}
                onSelectSkill={setSelectedSkill}
                onSetHp={(charId, hp) =>
                  setCurrentHpMap((prev) => ({ ...prev, [charId]: hp }))
                }
              />
            </div>
          )}
        </div>
      )}

      {/* Character Detail Panel (staging only) */}
      {phase === "staging" && selectedCharId && (
        <CharacterDetailPanel
          characterId={selectedCharId}
          getCharacter={getCharacter}
          getSkill={getSkill}
          skills={skills}
          isPlaced={placedIds.has(selectedCharId)}
          onClose={() => setSelectedCharId(null)}
          onSelectSkill={setSelectedSkill}
          onToggleEquip={async (charId, skillId) => {
            const char = getCharacter(charId);
            if (!char) return;
            const skill = skills.find((s) => s.id === skillId);
            if (!skill) return;
            if (skill.skillType === "innate") {
              await updateCharacter({
                ...char,
                equippedInnateId: char.equippedInnateId === skillId ? null : skillId,
              });
            } else if (skill.skillType === "basic") {
              await updateCharacter({
                ...char,
                equippedBasicId: char.equippedBasicId === skillId ? null : skillId,
              });
            } else {
              const isEquipped = char.equippedAbilityIds.includes(skillId);
              await updateCharacter({
                ...char,
                equippedAbilityIds: isEquipped
                  ? char.equippedAbilityIds.filter((id) => id !== skillId)
                  : [...char.equippedAbilityIds, skillId],
              });
            }
          }}
        />
      )}

      {/* Skill Modal */}
      {selectedSkill && (
        <SkillModal
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
        />
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
  currentHpMap,
  onSelectSkill,
  onSetHp,
}: {
  characterId: string;
  isActive: boolean;
  getCharacter: (id: string) => Character | undefined;
  getSkill: (id: string) => Skill | undefined;
  skills: Skill[];
  currentHpMap: Record<string, number>;
  onSelectSkill: (skill: Skill) => void;
  onSetHp: (charId: string, hp: number) => void;
}) {
  const char = getCharacter(characterId);
  if (!char) return null;

  const currentHp = currentHpMap[char.id] ?? char.stats.hp;
  const maxHp = char.stats.hp;
  const hpPct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  const hpColor = hpPct > 50 ? "bg-green-500" : hpPct > 25 ? "bg-yellow-500" : "bg-red-500";

  const equippedInnate = char.equippedInnateId ? getSkill(char.equippedInnateId) : null;
  const equippedBasic = char.equippedBasicId ? getSkill(char.equippedBasicId) : null;
  const equippedAbilities = char.equippedAbilityIds
    .map((id) => getSkill(id))
    .filter(Boolean) as Skill[];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {char.photoUrl ? (
          <img
            src={char.photoUrl}
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
            <span>{char.type}</span>
          </div>
          <div className="flex gap-0.5 mt-1">
            {char.energyGeneration.map((eg) =>
              Array.from({ length: eg.amount }).map((_, j) => (
                <EnergyBadge key={`${eg.color}-${j}`} color={eg.color} />
              ))
            )}
          </div>
        </div>
      </div>

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
          {(Object.entries(char.stats) as [string, number][])
            .filter(([key]) => key !== "hp")
            .map(([key, val]) => (
            <div key={key} className="text-center bg-gray-800 rounded p-1">
              <div className="text-[9px] uppercase text-gray-500">{key}</div>
              <div className="text-sm font-bold text-white">{val}</div>
            </div>
          ))}
        </div>
      </div>

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
              {equippedInnate.levels[0].description || "(no description)"}
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
              {equippedBasic.levels[0].description || "(no description)"}
            </p>
          </button>
        ) : (
          <p className="text-xs text-gray-500 mt-1">None equipped</p>
        )}
      </div>

      {/* Abilities */}
      <div>
        <span className="text-gray-500 font-medium text-[10px] uppercase">
          Abilities ({equippedAbilities.length}/3)
        </span>
        {equippedAbilities.length === 0 ? (
          <p className="text-xs text-gray-500 mt-1">None equipped</p>
        ) : (
          <div className="mt-1 space-y-1.5">
            {equippedAbilities.map((skill) => (
              <button
                key={skill.id}
                onClick={() => onSelectSkill(skill)}
                className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 border border-transparent hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {skill.name}
                  </span>
                  <EnergyCostDisplay cost={skill.levels[0].cost} />
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {skill.levels[0].description || "(no description)"}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterDetailPanel({
  characterId,
  getCharacter,
  getSkill,
  skills,
  isPlaced,
  onClose,
  onSelectSkill,
  onToggleEquip,
}: {
  characterId: string;
  getCharacter: (id: string) => Character | undefined;
  getSkill: (id: string) => Skill | undefined;
  skills: Skill[];
  isPlaced: boolean;
  onClose: () => void;
  onSelectSkill: (skill: Skill) => void;
  onToggleEquip: (charId: string, skillId: string) => void;
}) {
  const char = getCharacter(characterId);
  if (!char) return null;

  const ownedSkills = skills.filter((s) => s.characterId === characterId);
  const isSkillEquipped = (skill: Skill) => {
    if (skill.skillType === "innate") return char.equippedInnateId === skill.id;
    if (skill.skillType === "basic") return char.equippedBasicId === skill.id;
    return char.equippedAbilityIds.includes(skill.id);
  };
  const canEquipMore = (type: string) => {
    if (type === "innate") return !char.equippedInnateId;
    if (type === "basic") return !char.equippedBasicId;
    return char.equippedAbilityIds.length < 3;
  };

  return (
    <div className="mt-6 bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
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
        {(Object.entries(char.stats) as [string, number][]).map(([key, val]) => (
          <div key={key} className="text-center bg-gray-800 rounded p-1.5">
            <div className="text-[10px] uppercase text-gray-500">{key}</div>
            <div className="text-sm font-bold text-white">{val}</div>
          </div>
        ))}
      </div>

      {/* Skills by type */}
      {(["innate", "basic", "ability"] as const).map((type) => {
        const typeSkills = ownedSkills.filter((s) => s.skillType === type);
        const label = type === "innate" ? "Innate" : type === "basic" ? "Basic" : "Abilities";
        const maxLabel = type === "ability" ? `${char.equippedAbilityIds.length}/3` : char[type === "innate" ? "equippedInnateId" : "equippedBasicId"] ? "1/1" : "0/1";

        if (isPlaced) {
          // On battlefield: show equipped only
          const equipped = typeSkills.filter((s) => isSkillEquipped(s));
          return (
            <div key={type}>
              <span className="text-gray-500 font-medium text-xs uppercase">
                {label} ({maxLabel})
              </span>
              {equipped.length === 0 ? (
                <p className="text-xs text-gray-500 mt-1">None equipped</p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  {equipped.map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => onSelectSkill(skill)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded p-2 border border-transparent hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{skill.name}</span>
                        <EnergyCostDisplay cost={skill.levels[0].cost} />
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {skill.levels[0].description || "(no description)"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }

        // On bench: show all with equip/unequip
        return (
          <div key={type}>
            <span className="text-gray-500 font-medium text-xs uppercase">
              {label} ({maxLabel})
            </span>
            {typeSkills.length === 0 ? (
              <p className="text-xs text-gray-500 mt-1">None available</p>
            ) : (
              <div className="mt-1 space-y-1.5">
                {typeSkills.map((skill) => {
                  const equipped = isSkillEquipped(skill);
                  const canEquip = canEquipMore(type);
                  return (
                    <div
                      key={skill.id}
                      className={`flex items-center gap-2 rounded p-2 border transition-colors ${
                        equipped ? "bg-gray-800 border-blue-500/50" : "bg-gray-800/50 border-gray-700"
                      }`}
                    >
                      <button
                        onClick={() => onSelectSkill(skill)}
                        className="flex-1 text-left flex items-center gap-2 min-w-0"
                      >
                        <span className={`text-sm font-medium truncate ${equipped ? "text-white" : "text-gray-400"}`}>
                          {skill.name}
                        </span>
                        <EnergyCostDisplay cost={skill.levels[0].cost} />
                        {equipped && (
                          <span className="text-[10px] text-blue-400 font-medium uppercase shrink-0">Equipped</span>
                        )}
                      </button>
                      <button
                        onClick={() => onToggleEquip(characterId, skill.id)}
                        disabled={!equipped && !canEquip}
                        className={`text-xs px-2 py-1 rounded shrink-0 ${
                          equipped
                            ? "bg-blue-600 hover:bg-blue-500 text-white"
                            : canEquip
                            ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                            : "bg-gray-800 text-gray-600 cursor-not-allowed"
                        }`}
                      >
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
  onClose,
}: {
  skill: Skill;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 space-y-4 shadow-2xl"
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

        {skill.skillType === "ability" ? (
          <div className="space-y-3">
            {skill.levels.map((level, i) => (
              <div
                key={i}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 uppercase">
                    Level {i + 1}
                  </span>
                  <EnergyCostDisplay cost={level.cost} />
                </div>
                <p className="text-sm text-gray-300">
                  {level.description || "(no description)"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <p className="text-sm text-gray-300">
              {skill.levels[0].description || "(no description)"}
            </p>
          </div>
        )}

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
