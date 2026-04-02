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
 */
export function resolveTargets(
  targetType: TargetType | undefined,
  casterId: string,
  teams: Team[],
  getCharacter: (id: string) => Character | undefined
): TargetResolution {
  if (!targetType || targetType === "no-target") {
    return { mode: "none", targets: [] };
  }

  // Build placed units list
  const placed: PlacedUnit[] = [];
  for (const team of teams) {
    for (const p of team.placements) {
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
      // Find the frontmost occupied column for the enemy side
      // Front = col 0 (closest to the divider)
      if (enemies.length === 0) return { mode: "dropdown", targets: [] };
      const minCol = Math.min(...enemies.map((e) => e.position.col));
      const frontRow = enemies.filter((e) => e.position.col === minCol);
      return { mode: "dropdown", targets: toTargetInfo(frontRow) };
    }

    case "aoe-enemy":
      return { mode: "aoe", targets: toTargetInfo(enemies) };

    case "self-row-enemy": {
      if (!casterUnit) return { mode: "aoe", targets: [] };
      const sameRow = enemies.filter((e) => e.position.row === casterUnit.position.row);
      return { mode: "aoe", targets: toTargetInfo(sameRow) };
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
