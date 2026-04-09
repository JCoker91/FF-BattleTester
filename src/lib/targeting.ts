import { TargetType, Team, Character, BattlefieldPosition } from "./types";

export interface PlacedUnit {
  characterId: string;
  side: "left" | "right";
  position: BattlefieldPosition;
}

export interface TargetInfo {
  characterId: string;
  label: string; // "Cecil (ally)", "Zidane (enemy)", etc.
  side: "left" | "right";
}

export type TargetMode = "dropdown" | "aoe" | "self" | "none";

export interface TargetResolution {
  mode: TargetMode;
  targets: TargetInfo[]; // for dropdown: selectable options; for aoe: all affected
}

/**
 * Resolve valid targets for a skill based on its targetType.
 *
 * Optional `currentHpMap` filters out any unit at <= 0 HP. When provided, defeated
 * characters are excluded from every target resolution — this means a "front row enemy"
 * skill will skip past dead front-row units and target the next living unit in that lane,
 * AOE patterns won't pretend to hit corpses, and so on. The caster is never excluded by
 * this filter (a defeated caster shouldn't be acting in the first place).
 */
export function resolveTargets(
  targetType: TargetType | undefined,
  casterId: string,
  teams: Team[],
  getCharacter: (id: string) => Character | undefined,
  currentHpMap?: Record<string, number>
): TargetResolution {
  if (!targetType || targetType === "no-target") {
    return { mode: "none", targets: [] };
  }

  const isAlive = (id: string): boolean => {
    if (!currentHpMap) return true;
    if (id === casterId) return true;
    const hp = currentHpMap[id];
    if (hp === undefined) return true;
    return hp > 0;
  };

  // Build placed units list (defeated units excluded when currentHpMap is provided)
  const placed: PlacedUnit[] = [];
  for (const team of teams) {
    for (const p of team.placements) {
      if (!isAlive(p.characterId)) continue;
      placed.push({ characterId: p.characterId, side: team.side as "left" | "right", position: p.position });
    }
  }

  const casterUnit = placed.find((p) => p.characterId === casterId);
  const casterSide = casterUnit?.side;
  if (!casterSide) return { mode: "none", targets: [] };

  const enemies = placed.filter((p) => p.side !== casterSide);
  const allies = placed.filter((p) => p.side === casterSide && p.characterId !== casterId);
  const self = placed.filter((p) => p.characterId === casterId);

  const toTargetInfo = (units: PlacedUnit[]): TargetInfo[] =>
    units.map((u) => {
      const char = getCharacter(u.characterId);
      const isSelf = u.characterId === casterId;
      const relation = isSelf ? "self" : u.side === casterSide ? "ally" : "enemy";
      return {
        characterId: u.characterId,
        label: `${char?.name ?? "Unknown"} (${relation})`,
        side: u.side,
      };
    });

  switch (targetType) {
    case "target-enemy":
    case "random-enemy":
      return { mode: "dropdown", targets: toTargetInfo(enemies) };

    case "front-row-enemy": {
      // For each row (lane), find the frontmost (lowest col) enemy.
      // If a lane only has a back-row enemy, that enemy is still considered "front" since nothing protects it.
      if (enemies.length === 0) return { mode: "dropdown", targets: [] };
      const frontByRow = new Map<number, PlacedUnit>();
      for (const e of enemies) {
        const existing = frontByRow.get(e.position.row);
        if (!existing || e.position.col < existing.position.col) {
          frontByRow.set(e.position.row, e);
        }
      }
      return { mode: "dropdown", targets: toTargetInfo(Array.from(frontByRow.values())) };
    }

    case "aoe-enemy":
      return { mode: "aoe", targets: toTargetInfo(enemies) };

    case "self-row-enemy": {
      if (!casterUnit) return { mode: "aoe", targets: [] };
      const sameRow = enemies.filter((e) => e.position.row === casterUnit.position.row);
      return { mode: "aoe", targets: toTargetInfo(sameRow) };
    }

    case "all-front-row-enemy": {
      // All enemies in the frontmost column (col 0)
      const frontRow = enemies.filter((e) => e.position.col === 0);
      return { mode: "aoe", targets: toTargetInfo(frontRow) };
    }

    case "all-middle-row-enemy": {
      const midRow = enemies.filter((e) => e.position.col === 1);
      return { mode: "aoe", targets: toTargetInfo(midRow) };
    }

    case "all-back-row-enemy": {
      const backRow = enemies.filter((e) => e.position.col === 2);
      return { mode: "aoe", targets: toTargetInfo(backRow) };
    }

    case "front-two-rows-enemy": {
      const frontTwo = enemies.filter((e) => e.position.col <= 1);
      return { mode: "aoe", targets: toTargetInfo(frontTwo) };
    }

    case "back-two-rows-enemy": {
      const backTwo = enemies.filter((e) => e.position.col >= 1);
      return { mode: "aoe", targets: toTargetInfo(backTwo) };
    }

    case "same-line-enemy": {
      // Enemies in the same row (lane) as the caster
      if (!casterUnit) return { mode: "aoe", targets: [] };
      const sameLine = enemies.filter((e) => e.position.row === casterUnit.position.row);
      return { mode: "aoe", targets: toTargetInfo(sameLine) };
    }

    case "column-pierce-enemy": {
      // Pick a single enemy column (frontmost first), hits that target plus all enemies behind in same row
      // Player picks the row line; resolved as dropdown over frontmost enemies, then hits all behind on use
      if (enemies.length === 0) return { mode: "dropdown", targets: [] };
      // For now, expose as dropdown of frontmost-by-row, the actual "behind" expansion happens at apply time
      const frontByRow = new Map<number, PlacedUnit>();
      for (const e of enemies) {
        const existing = frontByRow.get(e.position.row);
        if (!existing || e.position.col < existing.position.col) {
          frontByRow.set(e.position.row, e);
        }
      }
      return { mode: "dropdown", targets: toTargetInfo(Array.from(frontByRow.values())) };
    }

    case "target-ally":
    case "random-ally":
      return { mode: "dropdown", targets: toTargetInfo(allies) };

    case "target-ally-or-self":
      return { mode: "dropdown", targets: toTargetInfo([...self, ...allies]) };

    case "adjacent-ally": {
      if (!casterUnit) return { mode: "dropdown", targets: [] };
      const adjacent = allies.filter((a) => {
        const dr = Math.abs(a.position.row - casterUnit.position.row);
        const dc = Math.abs(a.position.col - casterUnit.position.col);
        return (dr <= 1 && dc <= 1) && !(dr === 0 && dc === 0);
      });
      return { mode: "dropdown", targets: toTargetInfo(adjacent) };
    }

    case "aoe-team":
      return { mode: "aoe", targets: toTargetInfo([...self, ...allies]) };

    case "self":
      return { mode: "self", targets: toTargetInfo(self) };

    default:
      return { mode: "none", targets: [] };
  }
}
