import Database from "better-sqlite3";
import path from "path";
import { Character, Skill, Team } from "./types";
import { v4 as uuid } from "uuid";

const dbPath = path.join(process.cwd(), "data", "playtester.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    character_id TEXT NOT NULL DEFAULT '',
    levels TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    series TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    energy_generation TEXT NOT NULL,
    stats TEXT NOT NULL,
    passive TEXT NOT NULL DEFAULT '',
    basic_attack TEXT NOT NULL DEFAULT '',
    skill_ids TEXT NOT NULL DEFAULT '[]',
    photo_url TEXT
  );

  CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    side TEXT NOT NULL,
    placements TEXT NOT NULL DEFAULT '[]'
  );
`);

// Migrate: add sort_order to series if missing
const seriesColumns = db
  .prepare("PRAGMA table_info(series)")
  .all() as { name: string }[];
if (!seriesColumns.some((c) => c.name === "sort_order")) {
  db.exec("ALTER TABLE series ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  const rows = db.prepare("SELECT id FROM series ORDER BY name").all() as { id: string }[];
  const update = db.prepare("UPDATE series SET sort_order = ? WHERE id = ?");
  rows.forEach((r, i) => update.run(i, r.id));
}

// Migrate: add summary to characters if missing
const charColumns = db
  .prepare("PRAGMA table_info(characters)")
  .all() as { name: string }[];
if (!charColumns.some((c) => c.name === "summary")) {
  db.exec("ALTER TABLE characters ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
}

// Migrate: add character_id and skill_type to skills if missing
const skillColumns = db
  .prepare("PRAGMA table_info(skills)")
  .all() as { name: string }[];
if (!skillColumns.some((c) => c.name === "character_id")) {
  db.exec("ALTER TABLE skills ADD COLUMN character_id TEXT NOT NULL DEFAULT ''");
}
if (!skillColumns.some((c) => c.name === "skill_type")) {
  db.exec("ALTER TABLE skills ADD COLUMN skill_type TEXT NOT NULL DEFAULT 'ability'");
}

// Migrate: add equipped_innate_id and equipped_basic_id to characters if missing
const charCols2 = db
  .prepare("PRAGMA table_info(characters)")
  .all() as { name: string }[];
if (!charCols2.some((c) => c.name === "equipped_innate_id")) {
  db.exec("ALTER TABLE characters ADD COLUMN equipped_innate_id TEXT DEFAULT NULL");
}
if (!charCols2.some((c) => c.name === "equipped_basic_id")) {
  db.exec("ALTER TABLE characters ADD COLUMN equipped_basic_id TEXT DEFAULT NULL");
}

// Seed default teams if empty
const teamCount = db.prepare("SELECT COUNT(*) as count FROM teams").get() as {
  count: number;
};
if (teamCount.count === 0) {
  const insert = db.prepare(
    "INSERT INTO teams (id, name, side, placements) VALUES (?, ?, ?, ?)"
  );
  insert.run("team-left", "Team A", "left", "[]");
  insert.run("team-right", "Team B", "right", "[]");
}

// --- Skills ---

interface SkillRow {
  id: string;
  name: string;
  character_id: string;
  skill_type: string;
  levels: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    characterId: row.character_id,
    skillType: (row.skill_type || "ability") as Skill["skillType"],
    levels: JSON.parse(row.levels),
  };
}

export function getAllSkills(): Skill[] {
  const rows = db.prepare("SELECT * FROM skills").all() as SkillRow[];
  return rows.map(rowToSkill);
}

export function getSkillById(id: string): Skill | undefined {
  const row = db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as
    | SkillRow
    | undefined;
  return row ? rowToSkill(row) : undefined;
}

export function insertSkill(data: Omit<Skill, "id">): Skill {
  const id = uuid();
  db.prepare(
    "INSERT INTO skills (id, name, character_id, skill_type, levels) VALUES (?, ?, ?, ?, ?)"
  ).run(id, data.name, data.characterId, data.skillType, JSON.stringify(data.levels));
  return { ...data, id };
}

export function updateSkillDb(skill: Skill): void {
  db.prepare(
    "UPDATE skills SET name = ?, character_id = ?, skill_type = ?, levels = ? WHERE id = ?"
  ).run(skill.name, skill.characterId, skill.skillType, JSON.stringify(skill.levels), skill.id);
}

export function deleteSkillDb(id: string): void {
  db.prepare("DELETE FROM skills WHERE id = ?").run(id);
  // Remove from all characters' equipped slots
  const chars = getAllCharacters();
  for (const char of chars) {
    const updates: string[] = [];
    const vals: (string | null)[] = [];
    if (char.equippedInnateId === id) {
      updates.push("equipped_innate_id = ?");
      vals.push(null);
    }
    if (char.equippedBasicId === id) {
      updates.push("equipped_basic_id = ?");
      vals.push(null);
    }
    if (char.equippedAbilityIds.includes(id)) {
      updates.push("skill_ids = ?");
      vals.push(JSON.stringify(char.equippedAbilityIds.filter((sid) => sid !== id)));
    }
    if (updates.length > 0) {
      db.prepare(`UPDATE characters SET ${updates.join(", ")} WHERE id = ?`).run(
        ...vals,
        char.id
      );
    }
  }
}

// --- Characters ---

interface CharacterRow {
  id: string;
  name: string;
  series: string;
  type: string;
  energy_generation: string;
  stats: string;
  passive: string;
  basic_attack: string;
  skill_ids: string;
  photo_url: string | null;
  summary: string;
  equipped_innate_id: string | null;
  equipped_basic_id: string | null;
}

function rowToCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    series: row.series,
    type: row.type as Character["type"],
    energyGeneration: JSON.parse(row.energy_generation),
    stats: { hp: 100, ...JSON.parse(row.stats) },
    equippedInnateId: row.equipped_innate_id ?? null,
    equippedBasicId: row.equipped_basic_id ?? null,
    equippedAbilityIds: JSON.parse(row.skill_ids),
    photoUrl: row.photo_url ?? undefined,
    summary: row.summary || undefined,
  };
}

export function getAllCharacters(): Character[] {
  const rows = db.prepare("SELECT * FROM characters").all() as CharacterRow[];
  return rows.map(rowToCharacter);
}

export function getCharacterById(id: string): Character | undefined {
  const row = db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as
    | CharacterRow
    | undefined;
  return row ? rowToCharacter(row) : undefined;
}

export function insertCharacter(data: Omit<Character, "id">): Character {
  const id = uuid();
  db.prepare(
    `INSERT INTO characters (id, name, series, type, energy_generation, stats, skill_ids, photo_url, summary, equipped_innate_id, equipped_basic_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.series,
    data.type,
    JSON.stringify(data.energyGeneration),
    JSON.stringify(data.stats),
    JSON.stringify(data.equippedAbilityIds),
    data.photoUrl ?? null,
    data.summary ?? "",
    data.equippedInnateId ?? null,
    data.equippedBasicId ?? null
  );
  return { ...data, id };
}

export function updateCharacterDb(char: Character): void {
  db.prepare(
    `UPDATE characters SET name = ?, series = ?, type = ?, energy_generation = ?, stats = ?, skill_ids = ?, photo_url = ?, summary = ?, equipped_innate_id = ?, equipped_basic_id = ?
     WHERE id = ?`
  ).run(
    char.name,
    char.series,
    char.type,
    JSON.stringify(char.energyGeneration),
    JSON.stringify(char.stats),
    JSON.stringify(char.equippedAbilityIds),
    char.photoUrl ?? null,
    char.summary ?? "",
    char.equippedInnateId ?? null,
    char.equippedBasicId ?? null,
    char.id
  );
}

export function deleteCharacterDb(id: string): void {
  db.prepare("DELETE FROM characters WHERE id = ?").run(id);
  // Delete all skills owned by this character
  db.prepare("DELETE FROM skills WHERE character_id = ?").run(id);
  // Remove from all teams' placements
  const teams = getAllTeams();
  const update = db.prepare("UPDATE teams SET placements = ? WHERE id = ?");
  for (const team of teams) {
    const filtered = team.placements.filter((p) => p.characterId !== id);
    if (filtered.length !== team.placements.length) {
      update.run(JSON.stringify(filtered), team.id);
    }
  }
}

// --- Teams ---

interface TeamRow {
  id: string;
  name: string;
  side: string;
  placements: string;
}

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    side: row.side as Team["side"],
    placements: JSON.parse(row.placements),
  };
}

export function getAllTeams(): Team[] {
  const rows = db.prepare("SELECT * FROM teams").all() as TeamRow[];
  return rows.map(rowToTeam);
}

export function updateTeamDb(team: Team): void {
  db.prepare(
    "UPDATE teams SET name = ?, side = ?, placements = ? WHERE id = ?"
  ).run(team.name, team.side, JSON.stringify(team.placements), team.id);
}

export function resetTeamsDb(): void {
  db.prepare("UPDATE teams SET placements = '[]'").run();
}

// --- Series ---

export interface SeriesRow {
  id: string;
  name: string;
  sortOrder: number;
}

export function getAllSeries(): SeriesRow[] {
  const rows = db
    .prepare("SELECT id, name, sort_order FROM series ORDER BY sort_order, name")
    .all() as { id: string; name: string; sort_order: number }[];
  return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}

export function insertSeries(name: string): SeriesRow {
  const id = uuid();
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) as m FROM series")
    .get() as { m: number };
  const sortOrder = maxOrder.m + 1;
  db.prepare(
    "INSERT INTO series (id, name, sort_order) VALUES (?, ?, ?)"
  ).run(id, name, sortOrder);
  return { id, name, sortOrder };
}

export function updateSeriesDb(id: string, name: string): void {
  db.prepare("UPDATE series SET name = ? WHERE id = ?").run(name, id);
}

export function reorderSeriesDb(orderedIds: string[]): void {
  const update = db.prepare("UPDATE series SET sort_order = ? WHERE id = ?");
  const tx = db.transaction(() => {
    orderedIds.forEach((id, index) => {
      update.run(index, id);
    });
  });
  tx();
}

export function deleteSeriesDb(id: string): void {
  const row = db.prepare("SELECT name FROM series WHERE id = ?").get(id) as
    | { name: string }
    | undefined;
  db.prepare("DELETE FROM series WHERE id = ?").run(id);
  if (row) {
    db.prepare("UPDATE characters SET series = '' WHERE series = ?").run(
      row.name
    );
  }
}
