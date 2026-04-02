import Database from "better-sqlite3";
import path from "path";
import { Character, Skill, CharacterSkill, Team, Form, FormLoadout, GlossaryEntry, SkillTemplate, TemplateAction, StatusEffect, EffectTagType, DEFAULT_ELEMENTAL, ElementalValues } from "./types";
import { v4 as uuid } from "uuid";

const dbPath = path.join(process.cwd(), "data", "playtester.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    character_id TEXT NOT NULL DEFAULT '',
    skill_type TEXT NOT NULL DEFAULT 'ability',
    form_id TEXT DEFAULT NULL,
    variant_group_id TEXT DEFAULT NULL,
    leveled INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    photo_url TEXT DEFAULT NULL,
    type_override TEXT DEFAULT NULL,
    energy_override TEXT DEFAULT NULL,
    stat_overrides TEXT DEFAULT NULL,
    elemental_res_override TEXT DEFAULT NULL,
    elemental_dmg_override TEXT DEFAULT NULL,
    summary TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS character_skills (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    form_id TEXT DEFAULT NULL,
    variant_group_id TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS skill_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS template_actions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    skill_id TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS glossary (
    id TEXT PRIMARY KEY,
    keyword TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    side TEXT NOT NULL,
    placements TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS status_effects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'buff',
    stats TEXT NOT NULL DEFAULT '["none"]',
    default_modifier INTEGER DEFAULT NULL,
    stackable INTEGER NOT NULL DEFAULT 0,
    max_stacks INTEGER DEFAULT NULL,
    on_max_stacks TEXT DEFAULT NULL,
    resistable INTEGER NOT NULL DEFAULT 0,
    behavior TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS effect_tag_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    param_schema TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);

// Seed effect tag types if empty
const tagCount = db.prepare("SELECT COUNT(*) as c FROM effect_tag_types").get() as { c: number };
if (tagCount.c === 0) {
  const insertTag = db.prepare("INSERT INTO effect_tag_types (id, name, label, description, param_schema, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
  const tags: [string, string, string, Record<string, unknown>, number][] = [
    ["dot", "Damage Over Time", "Deals a % of max HP as damage at the start of each turn", {
      percent: { type: "number", label: "% Max HP", default: 10 },
      damageType: { type: "enum", label: "Damage Type", options: ["true", "physical", "magical"], default: "true" },
    }, 0],
    ["hot", "Heal Over Time", "Heals a % of max HP at the start of each turn", {
      percent: { type: "number", label: "% Max HP", default: 5 },
    }, 1],
    ["skip-turn", "Skip Turn", "Target cannot take any actions on their turn", {}, 2],
    ["miss-chance", "Miss Chance", "Outgoing attacks have a chance to miss, dealing no damage and not applying effects", {
      percent: { type: "number", label: "Miss %", default: 50 },
      filter: { type: "enum", label: "Attack Filter", options: ["direct", "aoe", "any"], default: "direct" },
    }, 3],
    ["dodge-chance", "Dodge Chance", "Incoming attacks have a chance to miss this character", {
      percent: { type: "number", label: "Dodge %", default: 50 },
      filter: { type: "enum", label: "Attack Filter", options: ["direct", "aoe", "any"], default: "direct" },
    }, 4],
    ["redirect-random", "Redirect Random", "Outgoing direct attacks are redirected to a random character (ally or enemy)", {
      filter: { type: "enum", label: "Attack Filter", options: ["direct", "aoe", "any"], default: "direct" },
    }, 5],
    ["force-target", "Force Target", "Outgoing direct attacks must target the source of this effect", {
      filter: { type: "enum", label: "Attack Filter", options: ["direct", "aoe", "any"], default: "direct" },
    }, 6],
    ["block-target", "Block Target", "Cannot attack the source of this effect with direct attacks", {
      filter: { type: "enum", label: "Attack Filter", options: ["direct", "aoe", "any"], default: "direct" },
    }, 7],
    ["restrict-skills", "Restrict Skills", "Limits which skill types can be used", {
      allowed: { type: "string[]", label: "Allowed Types", options: ["innate", "basic", "ability", "conditional"], default: ["basic"] },
    }, 8],
    ["set-stat", "Set Stat", "Overrides a stat to a fixed value instead of percentage modifier", {
      stat: { type: "enum", label: "Stat", options: ["atk", "mAtk", "def", "spi", "spd"], default: "spd" },
      value: { type: "number", label: "Value", default: 1 },
    }, 9],
    ["invert-healing", "Invert Healing", "Healing effects deal damage instead", {}, 10],
    ["removed-on-damage", "Removed on Damage", "This status is removed when the character takes damage", {}, 11],
    ["eject", "Eject", "Character is removed from the battlefield for the duration", {}, 12],
  ];
  for (const [name, label, desc, schema, order] of tags) {
    insertTag.run(uuid(), name, label, desc, JSON.stringify(schema), order);
  }
}

// --- Migrations ---

const seriesColumns = db
  .prepare("PRAGMA table_info(series)")
  .all() as { name: string }[];
if (!seriesColumns.some((c) => c.name === "sort_order")) {
  db.exec("ALTER TABLE series ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  const rows = db.prepare("SELECT id FROM series ORDER BY name").all() as { id: string }[];
  const update = db.prepare("UPDATE series SET sort_order = ? WHERE id = ?");
  rows.forEach((r, i) => update.run(i, r.id));
}

const charColumns = db
  .prepare("PRAGMA table_info(characters)")
  .all() as { name: string }[];
if (!charColumns.some((c) => c.name === "summary")) {
  db.exec("ALTER TABLE characters ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
}
if (!charColumns.some((c) => c.name === "equipped_innate_id")) {
  db.exec("ALTER TABLE characters ADD COLUMN equipped_innate_id TEXT DEFAULT NULL");
}
if (!charColumns.some((c) => c.name === "equipped_basic_id")) {
  db.exec("ALTER TABLE characters ADD COLUMN equipped_basic_id TEXT DEFAULT NULL");
}
if (!charColumns.some((c) => c.name === "equipped_loadouts")) {
  db.exec("ALTER TABLE characters ADD COLUMN equipped_loadouts TEXT NOT NULL DEFAULT '{}'");
}
if (!charColumns.some((c) => c.name === "elemental_resistance")) {
  db.exec("ALTER TABLE characters ADD COLUMN elemental_resistance TEXT DEFAULT NULL");
}
if (!charColumns.some((c) => c.name === "elemental_damage")) {
  db.exec("ALTER TABLE characters ADD COLUMN elemental_damage TEXT DEFAULT NULL");
}
if (!charColumns.some((c) => c.name === "status_resistance")) {
  db.exec("ALTER TABLE characters ADD COLUMN status_resistance TEXT DEFAULT '{}'");
}

// Migrate: template_actions refactored to skill references — recreate if old schema
const taColumns = db.prepare("PRAGMA table_info(template_actions)").all() as { name: string }[];
if (taColumns.some((c) => c.name === "name")) {
  // Old schema with name/description/cost columns — drop and recreate
  db.exec("DROP TABLE template_actions");
  db.exec(`CREATE TABLE template_actions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    skill_id TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);
} else if (!taColumns.some((c) => c.name === "skill_id")) {
  db.exec("ALTER TABLE template_actions ADD COLUMN skill_id TEXT NOT NULL DEFAULT ''");
}

const skillColumns = db
  .prepare("PRAGMA table_info(skills)")
  .all() as { name: string }[];
if (!skillColumns.some((c) => c.name === "character_id")) {
  db.exec("ALTER TABLE skills ADD COLUMN character_id TEXT NOT NULL DEFAULT ''");
}
if (!skillColumns.some((c) => c.name === "skill_type")) {
  db.exec("ALTER TABLE skills ADD COLUMN skill_type TEXT NOT NULL DEFAULT 'ability'");
}
// Migrate: add photo_url and type_override to forms if missing
const formColumns = db
  .prepare("PRAGMA table_info(forms)")
  .all() as { name: string }[];
if (!formColumns.some((c) => c.name === "photo_url")) {
  db.exec("ALTER TABLE forms ADD COLUMN photo_url TEXT DEFAULT NULL");
}
if (!formColumns.some((c) => c.name === "type_override")) {
  db.exec("ALTER TABLE forms ADD COLUMN type_override TEXT DEFAULT NULL");
}
if (!formColumns.some((c) => c.name === "energy_override")) {
  db.exec("ALTER TABLE forms ADD COLUMN energy_override TEXT DEFAULT NULL");
}
if (!formColumns.some((c) => c.name === "stat_overrides")) {
  db.exec("ALTER TABLE forms ADD COLUMN stat_overrides TEXT DEFAULT NULL");
}
if (!formColumns.some((c) => c.name === "elemental_res_override")) {
  db.exec("ALTER TABLE forms ADD COLUMN elemental_res_override TEXT DEFAULT NULL");
}
if (!formColumns.some((c) => c.name === "elemental_dmg_override")) {
  db.exec("ALTER TABLE forms ADD COLUMN elemental_dmg_override TEXT DEFAULT NULL");
}
if (!formColumns.some((c) => c.name === "summary")) {
  db.exec("ALTER TABLE forms ADD COLUMN summary TEXT DEFAULT NULL");
}
if (!formColumns.some((c) => c.name === "status_resistance_override")) {
  db.exec("ALTER TABLE forms ADD COLUMN status_resistance_override TEXT DEFAULT NULL");
}

// character_skills migrations
const csColumns = db.prepare("PRAGMA table_info(character_skills)").all() as { name: string }[];
if (!csColumns.some((c) => c.name === "conditions")) {
  db.exec("ALTER TABLE character_skills ADD COLUMN conditions TEXT DEFAULT NULL");
}

// status_effects migration: rename stat -> stats (JSON array)
const seColumns = db.prepare("PRAGMA table_info(status_effects)").all() as { name: string }[];
if (seColumns.length > 0 && seColumns.some((c) => c.name === "stat") && !seColumns.some((c) => c.name === "stats")) {
  db.exec("ALTER TABLE status_effects ADD COLUMN stats TEXT NOT NULL DEFAULT '[\"none\"]'");
  // Migrate old single stat values to JSON arrays
  const rows = db.prepare("SELECT id, stat FROM status_effects").all() as { id: string; stat: string }[];
  const update = db.prepare("UPDATE status_effects SET stats = ? WHERE id = ?");
  for (const row of rows) {
    update.run(JSON.stringify([row.stat]), row.id);
  }
}

if (seColumns.length > 0 && !seColumns.some((c) => c.name === "behavior")) {
  db.exec("ALTER TABLE status_effects ADD COLUMN behavior TEXT DEFAULT NULL");
}
// Migrate behavior -> tags
if (seColumns.length > 0 && !seColumns.some((c) => c.name === "tags")) {
  db.exec("ALTER TABLE status_effects ADD COLUMN tags TEXT DEFAULT NULL");
  // Convert old behavior JSON to tags format
  const seRows = db.prepare("SELECT id, behavior FROM status_effects WHERE behavior IS NOT NULL").all() as { id: string; behavior: string }[];
  const updateSE = db.prepare("UPDATE status_effects SET tags = ? WHERE id = ?");
  for (const row of seRows) {
    try {
      const old = JSON.parse(row.behavior);
      const tags: { type: string; params: Record<string, unknown> }[] = [];
      if (Array.isArray(old)) {
        // Old BehaviorRule[] format
        for (const rule of old) {
          if (rule.action === "damage" || (rule.type === "dot")) {
            tags.push({ type: "dot", params: { percent: rule.value ?? rule.percentHp ?? 10, damageType: rule.damageType ?? "true" } });
          } else if (rule.action === "heal") {
            tags.push({ type: "hot", params: { percent: rule.value ?? 5 } });
          } else if (rule.action === "skip-turn") {
            tags.push({ type: "skip-turn", params: {} });
          }
        }
      } else if (old.type) {
        // Old StatusBehaviorConfig format
        if (old.type === "dot") tags.push({ type: "dot", params: { percent: old.percentHp ?? 10, damageType: old.damageType ?? "true" } });
        else if (old.type === "skip-turn") tags.push({ type: "skip-turn", params: {} });
      }
      if (tags.length > 0) updateSE.run(JSON.stringify(tags), row.id);
    } catch { /* skip bad data */ }
  }
}

if (!skillColumns.some((c) => c.name === "description")) {
  db.exec("ALTER TABLE skills ADD COLUMN description TEXT NOT NULL DEFAULT ''");
}
if (!skillColumns.some((c) => c.name === "form_id")) {
  db.exec("ALTER TABLE skills ADD COLUMN form_id TEXT DEFAULT NULL");
}
if (!skillColumns.some((c) => c.name === "variant_group_id")) {
  db.exec("ALTER TABLE skills ADD COLUMN variant_group_id TEXT DEFAULT NULL");
}
if (!skillColumns.some((c) => c.name === "leveled")) {
  db.exec("ALTER TABLE skills ADD COLUMN leveled INTEGER NOT NULL DEFAULT 0");
}

// Migrate: create Base forms for characters that don't have any, and migrate legacy equip data
const charsWithoutForms = db.prepare(
  "SELECT c.id, c.equipped_innate_id, c.equipped_basic_id, c.skill_ids, c.equipped_loadouts FROM characters c WHERE NOT EXISTS (SELECT 1 FROM forms f WHERE f.character_id = c.id)"
).all() as { id: string; equipped_innate_id: string | null; equipped_basic_id: string | null; skill_ids: string; equipped_loadouts: string }[];

if (charsWithoutForms.length > 0) {
  const insertForm = db.prepare("INSERT INTO forms (id, character_id, name, sort_order) VALUES (?, ?, ?, ?)");
  const updateChar = db.prepare("UPDATE characters SET equipped_loadouts = ? WHERE id = ?");
  for (const c of charsWithoutForms) {
    const formId = uuid();
    insertForm.run(formId, c.id, "Base", 0);
    // Migrate legacy equip data into loadouts if loadouts is empty
    let loadouts: Record<string, FormLoadout> = {};
    try { loadouts = JSON.parse(c.equipped_loadouts); } catch { /* empty */ }
    if (Object.keys(loadouts).length === 0) {
      const abilityIds = JSON.parse(c.skill_ids || "[]") as string[];
      loadouts[formId] = {
        innateId: c.equipped_innate_id ?? null,
        basicId: c.equipped_basic_id ?? null,
        abilityIds,
      };
      updateChar.run(JSON.stringify(loadouts), c.id);
    }
  }
}

// Seed default teams if empty
const teamCount = db.prepare("SELECT COUNT(*) as count FROM teams").get() as { count: number };
if (teamCount.count === 0) {
  const insert = db.prepare("INSERT INTO teams (id, name, side, placements) VALUES (?, ?, ?, ?)");
  insert.run("team-left", "Team A", "left", "[]");
  insert.run("team-right", "Team B", "right", "[]");
}

// --- Skills ---

interface SkillRow {
  id: string;
  name: string;
  description: string;
  skill_type: string;
  leveled: number;
  levels: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    skillType: (row.skill_type || "ability") as Skill["skillType"],
    leveled: !!row.leveled,
    levels: JSON.parse(row.levels),
  };
}

export function getAllSkills(): Skill[] {
  return (db.prepare("SELECT * FROM skills").all() as SkillRow[]).map(rowToSkill);
}

export function getSkillById(id: string): Skill | undefined {
  const row = db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as SkillRow | undefined;
  return row ? rowToSkill(row) : undefined;
}

export function insertSkill(data: Omit<Skill, "id">): Skill {
  const id = uuid();
  db.prepare(
    "INSERT INTO skills (id, name, description, skill_type, leveled, levels) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, data.name, data.description, data.skillType, data.leveled ? 1 : 0, JSON.stringify(data.levels));
  return { ...data, id };
}

export function updateSkillDb(skill: Skill): void {
  db.prepare(
    "UPDATE skills SET name = ?, description = ?, skill_type = ?, leveled = ?, levels = ? WHERE id = ?"
  ).run(skill.name, skill.description, skill.skillType, skill.leveled ? 1 : 0, JSON.stringify(skill.levels), skill.id);
}

export function deleteSkillDb(id: string): void {
  db.prepare("DELETE FROM skills WHERE id = ?").run(id);
  // Remove all character assignments for this skill
  db.prepare("DELETE FROM character_skills WHERE skill_id = ?").run(id);
  // Remove from template actions
  db.prepare("DELETE FROM template_actions WHERE skill_id = ?").run(id);
  // Remove from characters' equipped loadouts
  const chars = getAllCharacters();
  const update = db.prepare("UPDATE characters SET equipped_loadouts = ? WHERE id = ?");
  for (const char of chars) {
    const lo = char.equippedLoadout;
    let changed = false;
    const newLo = { ...lo };
    if (newLo.innateId === id) { newLo.innateId = null; changed = true; }
    if (newLo.basicId === id) { newLo.basicId = null; changed = true; }
    if (newLo.abilityIds.includes(id)) {
      newLo.abilityIds = newLo.abilityIds.filter((s) => s !== id);
      changed = true;
    }
    if (changed) update.run(JSON.stringify(newLo), char.id);
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
  photo_url: string | null;
  summary: string;
  equipped_loadouts: string;
  elemental_resistance: string | null;
  elemental_damage: string | null;
  status_resistance: string | null;
}

function rowToCharacter(row: CharacterRow): Character {
  // Migrate: if equipped_loadouts is a per-form map, extract the first form's loadout
  let loadout: FormLoadout = { innateId: null, basicId: null, abilityIds: [] };
  try {
    const parsed = JSON.parse(row.equipped_loadouts || "{}");
    if (parsed.innateId !== undefined || parsed.basicId !== undefined || parsed.abilityIds !== undefined) {
      // Already a single loadout
      loadout = parsed;
    } else {
      // Legacy per-form map: take the first form's loadout
      const values = Object.values(parsed) as FormLoadout[];
      if (values.length > 0) loadout = values[0];
    }
  } catch { /* empty */ }
  return {
    id: row.id,
    name: row.name,
    series: row.series,
    type: row.type as Character["type"],
    energyGeneration: JSON.parse(row.energy_generation),
    stats: (() => {
      const raw = JSON.parse(row.stats);
      // Migrate res -> spi
      if ("res" in raw && !("spi" in raw)) { raw.spi = raw.res; delete raw.res; }
      return { hp: 100, spi: 10, ...raw };
    })(),
    elementalResistance: { ...DEFAULT_ELEMENTAL, ...(row.elemental_resistance ? JSON.parse(row.elemental_resistance) : {}) },
    elementalDamage: { ...DEFAULT_ELEMENTAL, ...(row.elemental_damage ? JSON.parse(row.elemental_damage) : {}) },
    equippedLoadout: loadout,
    statusResistance: row.status_resistance ? JSON.parse(row.status_resistance) : {},
    photoUrl: row.photo_url ?? undefined,
    summary: row.summary || undefined,
  };
}

export function getAllCharacters(): Character[] {
  return (db.prepare("SELECT * FROM characters").all() as CharacterRow[]).map(rowToCharacter);
}

export function getCharacterById(id: string): Character | undefined {
  const row = db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | undefined;
  return row ? rowToCharacter(row) : undefined;
}

export function insertCharacter(data: Omit<Character, "id">): { character: Character; form: Form } {
  const charId = uuid();
  const formId = uuid();
  // Create the character
  db.prepare(
    `INSERT INTO characters (id, name, series, type, energy_generation, stats, photo_url, summary, equipped_loadouts, elemental_resistance, elemental_damage, status_resistance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    charId, data.name, data.series, data.type,
    JSON.stringify(data.energyGeneration), JSON.stringify(data.stats),
    data.photoUrl ?? null, data.summary ?? "",
    JSON.stringify({ innateId: null, basicId: null, abilityIds: [] }),
    JSON.stringify(data.elementalResistance),
    JSON.stringify(data.elementalDamage),
    JSON.stringify(data.statusResistance ?? {})
  );
  // Create the Base form
  db.prepare("INSERT INTO forms (id, character_id, name, sort_order) VALUES (?, ?, ?, ?)").run(formId, charId, "Base", 0);
  const character: Character = { ...data, id: charId, equippedLoadout: { innateId: null, basicId: null, abilityIds: [] }, statusResistance: data.statusResistance ?? {} };
  const form: Form = { id: formId, characterId: charId, name: "Base", sortOrder: 0 };
  return { character, form };
}

export function updateCharacterDb(char: Character): void {
  db.prepare(
    `UPDATE characters SET name = ?, series = ?, type = ?, energy_generation = ?, stats = ?, photo_url = ?, summary = ?, equipped_loadouts = ?, elemental_resistance = ?, elemental_damage = ?, status_resistance = ?
     WHERE id = ?`
  ).run(
    char.name, char.series, char.type,
    JSON.stringify(char.energyGeneration), JSON.stringify(char.stats),
    char.photoUrl ?? null, char.summary ?? "",
    JSON.stringify(char.equippedLoadout),
    JSON.stringify(char.elementalResistance),
    JSON.stringify(char.elementalDamage),
    JSON.stringify(char.statusResistance ?? {}),
    char.id
  );
}

export function deleteCharacterDb(id: string): void {
  db.prepare("DELETE FROM characters WHERE id = ?").run(id);
  db.prepare("DELETE FROM character_skills WHERE character_id = ?").run(id);
  db.prepare("DELETE FROM forms WHERE character_id = ?").run(id);
  const teams = getAllTeams();
  const update = db.prepare("UPDATE teams SET placements = ? WHERE id = ?");
  for (const team of teams) {
    const filtered = team.placements.filter((p) => p.characterId !== id);
    if (filtered.length !== team.placements.length) {
      update.run(JSON.stringify(filtered), team.id);
    }
  }
}

// --- Forms ---

interface FormRow {
  id: string;
  character_id: string;
  name: string;
  sort_order: number;
  photo_url: string | null;
  type_override: string | null;
  energy_override: string | null;
  stat_overrides: string | null;
  elemental_res_override: string | null;
  elemental_dmg_override: string | null;
  status_resistance_override: string | null;
  summary: string | null;
}

function rowToForm(row: FormRow): Form {
  return {
    id: row.id,
    characterId: row.character_id,
    name: row.name,
    sortOrder: row.sort_order,
    photoUrl: row.photo_url ?? undefined,
    typeOverride: (row.type_override as Form["typeOverride"]) ?? undefined,
    energyOverride: row.energy_override ? JSON.parse(row.energy_override) : undefined,
    statOverrides: row.stat_overrides ? (() => {
      const raw = JSON.parse(row.stat_overrides);
      if ("res" in raw && !("spi" in raw)) { raw.spi = raw.res; delete raw.res; }
      return raw;
    })() : undefined,
    elementalResOverride: row.elemental_res_override ? JSON.parse(row.elemental_res_override) : undefined,
    elementalDmgOverride: row.elemental_dmg_override ? JSON.parse(row.elemental_dmg_override) : undefined,
    statusResistanceOverride: row.status_resistance_override ? JSON.parse(row.status_resistance_override) : undefined,
    summary: row.summary ?? undefined,
  };
}

export function getAllForms(): Form[] {
  return (db.prepare("SELECT * FROM forms ORDER BY character_id, sort_order").all() as FormRow[]).map(rowToForm);
}

export function getFormsByCharacterId(characterId: string): Form[] {
  return (db.prepare("SELECT * FROM forms WHERE character_id = ? ORDER BY sort_order").all(characterId) as FormRow[]).map(rowToForm);
}

export function insertForm(characterId: string, name: string): Form {
  const id = uuid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) as m FROM forms WHERE character_id = ?").get(characterId) as { m: number };
  const sortOrder = maxOrder.m + 1;
  db.prepare("INSERT INTO forms (id, character_id, name, sort_order) VALUES (?, ?, ?, ?)").run(id, characterId, name, sortOrder);
  return { id, characterId, name, sortOrder };
}

export function updateFormDb(id: string, data: { name: string; photoUrl?: string | null; typeOverride?: string | null; energyOverride?: unknown[] | null; statOverrides?: Record<string, number> | null; elementalResOverride?: Record<string, number> | null; elementalDmgOverride?: Record<string, number> | null; statusResistanceOverride?: Record<string, number> | null; summary?: string | null }): void {
  const toJson = (obj: Record<string, number> | null | undefined) => obj && Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
  db.prepare("UPDATE forms SET name = ?, photo_url = ?, type_override = ?, energy_override = ?, stat_overrides = ?, elemental_res_override = ?, elemental_dmg_override = ?, status_resistance_override = ?, summary = ? WHERE id = ?").run(
    data.name, data.photoUrl ?? null, data.typeOverride ?? null,
    data.energyOverride ? JSON.stringify(data.energyOverride) : null,
    toJson(data.statOverrides), toJson(data.elementalResOverride), toJson(data.elementalDmgOverride),
    toJson(data.statusResistanceOverride),
    data.summary ?? null, id
  );
}

export function deleteFormDb(id: string): void {
  const form = db.prepare("SELECT * FROM forms WHERE id = ?").get(id) as FormRow | undefined;
  if (!form) return;
  const count = db.prepare("SELECT COUNT(*) as c FROM forms WHERE character_id = ?").get(form.character_id) as { c: number };
  if (count.c <= 1) throw new Error("Cannot delete the last form");
  db.prepare("DELETE FROM forms WHERE id = ?").run(id);
  // Remove skills tied to this form
  db.prepare("UPDATE skills SET form_id = NULL WHERE form_id = ?").run(id);
}

export function reorderFormsDb(characterId: string, orderedIds: string[]): void {
  const update = db.prepare("UPDATE forms SET sort_order = ? WHERE id = ?");
  const tx = db.transaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });
  tx();
}

// --- Teams ---

interface TeamRow { id: string; name: string; side: string; placements: string; }
function rowToTeam(row: TeamRow): Team {
  return { id: row.id, name: row.name, side: row.side as Team["side"], placements: JSON.parse(row.placements) };
}
export function getAllTeams(): Team[] {
  return (db.prepare("SELECT * FROM teams").all() as TeamRow[]).map(rowToTeam);
}
export function updateTeamDb(team: Team): void {
  db.prepare("UPDATE teams SET name = ?, side = ?, placements = ? WHERE id = ?").run(team.name, team.side, JSON.stringify(team.placements), team.id);
}
export function resetTeamsDb(): void {
  db.prepare("UPDATE teams SET placements = '[]'").run();
}

// --- Series ---

export interface SeriesRow { id: string; name: string; sortOrder: number; }
export function getAllSeries(): SeriesRow[] {
  const rows = db.prepare("SELECT id, name, sort_order FROM series ORDER BY sort_order, name").all() as { id: string; name: string; sort_order: number }[];
  return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}
export function insertSeries(name: string): SeriesRow {
  const id = uuid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) as m FROM series").get() as { m: number };
  const sortOrder = maxOrder.m + 1;
  db.prepare("INSERT INTO series (id, name, sort_order) VALUES (?, ?, ?)").run(id, name, sortOrder);
  return { id, name, sortOrder };
}
export function updateSeriesDb(id: string, name: string): void {
  db.prepare("UPDATE series SET name = ? WHERE id = ?").run(name, id);
}
export function reorderSeriesDb(orderedIds: string[]): void {
  const update = db.prepare("UPDATE series SET sort_order = ? WHERE id = ?");
  const tx = db.transaction(() => { orderedIds.forEach((id, index) => update.run(index, id)); });
  tx();
}
export function deleteSeriesDb(id: string): void {
  const row = db.prepare("SELECT name FROM series WHERE id = ?").get(id) as { name: string } | undefined;
  db.prepare("DELETE FROM series WHERE id = ?").run(id);
  if (row) db.prepare("UPDATE characters SET series = '' WHERE series = ?").run(row.name);
}

// --- Glossary ---

interface GlossaryRow { id: string; keyword: string; label: string; description: string; }

export function getAllGlossary(): GlossaryEntry[] {
  return (db.prepare("SELECT * FROM glossary ORDER BY keyword").all() as GlossaryRow[]).map((r) => ({
    id: r.id, keyword: r.keyword, label: r.label, description: r.description,
  }));
}

export function insertGlossary(data: Omit<GlossaryEntry, "id">): GlossaryEntry {
  const id = uuid();
  db.prepare("INSERT INTO glossary (id, keyword, label, description) VALUES (?, ?, ?, ?)").run(
    id, data.keyword, data.label, data.description
  );
  return { ...data, id };
}

export function updateGlossaryDb(entry: GlossaryEntry): void {
  db.prepare("UPDATE glossary SET keyword = ?, label = ?, description = ? WHERE id = ?").run(
    entry.keyword, entry.label, entry.description, entry.id
  );
}

export function deleteGlossaryDb(id: string): void {
  db.prepare("DELETE FROM glossary WHERE id = ?").run(id);
}

// --- Skill Templates ---

interface TemplateRow { id: string; name: string; description: string; }
interface ActionRow { id: string; template_id: string; skill_id: string; sort_order: number; }

function rowToTemplate(row: TemplateRow): SkillTemplate {
  return { id: row.id, name: row.name, description: row.description || "" };
}

function rowToAction(row: ActionRow): TemplateAction {
  return {
    id: row.id,
    templateId: row.template_id,
    skillId: row.skill_id,
    sortOrder: row.sort_order,
  };
}

export function getAllTemplates(): SkillTemplate[] {
  return (db.prepare("SELECT * FROM skill_templates ORDER BY name").all() as TemplateRow[]).map(rowToTemplate);
}

export function insertTemplate(data: Omit<SkillTemplate, "id">): SkillTemplate {
  const id = uuid();
  db.prepare("INSERT INTO skill_templates (id, name, description) VALUES (?, ?, ?)").run(id, data.name, data.description);
  return { ...data, id };
}

export function updateTemplateDb(t: SkillTemplate): void {
  db.prepare("UPDATE skill_templates SET name = ?, description = ? WHERE id = ?").run(t.name, t.description, t.id);
}

export function deleteTemplateDb(id: string): void {
  db.prepare("DELETE FROM skill_templates WHERE id = ?").run(id);
  db.prepare("DELETE FROM template_actions WHERE template_id = ?").run(id);
  // Clear templateId from any skill levels referencing this template
  const allSkills = getAllSkills();
  const update = db.prepare("UPDATE skills SET levels = ? WHERE id = ?");
  for (const skill of allSkills) {
    let changed = false;
    const newLevels = skill.levels.map((lv) => {
      if (lv.templateId === id) { changed = true; return { ...lv, templateId: null }; }
      return lv;
    });
    if (changed) update.run(JSON.stringify(newLevels), skill.id);
  }
}

export function getActionsByTemplateId(templateId: string): TemplateAction[] {
  return (db.prepare("SELECT * FROM template_actions WHERE template_id = ? ORDER BY sort_order").all(templateId) as ActionRow[]).map(rowToAction);
}

export function getAllTemplateActions(): TemplateAction[] {
  return (db.prepare("SELECT * FROM template_actions ORDER BY template_id, sort_order").all() as ActionRow[]).map(rowToAction);
}

export function insertTemplateAction(data: Omit<TemplateAction, "id">): TemplateAction {
  const id = uuid();
  db.prepare("INSERT INTO template_actions (id, template_id, skill_id, sort_order) VALUES (?, ?, ?, ?)").run(
    id, data.templateId, data.skillId, data.sortOrder
  );
  return { ...data, id };
}

export function updateTemplateActionDb(action: TemplateAction): void {
  db.prepare("UPDATE template_actions SET skill_id = ?, sort_order = ? WHERE id = ?").run(
    action.skillId, action.sortOrder, action.id
  );
}

export function deleteTemplateActionDb(id: string): void {
  db.prepare("DELETE FROM template_actions WHERE id = ?").run(id);
}

// --- Character Skills (assignments) ---

interface CharacterSkillRow {
  id: string;
  character_id: string;
  skill_id: string;
  form_id: string | null;
  variant_group_id: string | null;
  conditions: string | null;
}

function rowToCharacterSkill(row: CharacterSkillRow): CharacterSkill {
  return {
    id: row.id,
    characterId: row.character_id,
    skillId: row.skill_id,
    formId: row.form_id ?? null,
    variantGroupId: row.variant_group_id ?? null,
    conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
  };
}

export function getAllCharacterSkills(): CharacterSkill[] {
  return (db.prepare("SELECT * FROM character_skills").all() as CharacterSkillRow[]).map(rowToCharacterSkill);
}

export function getCharacterSkillsByCharId(characterId: string): CharacterSkill[] {
  return (db.prepare("SELECT * FROM character_skills WHERE character_id = ?").all(characterId) as CharacterSkillRow[]).map(rowToCharacterSkill);
}

export function insertCharacterSkill(data: Omit<CharacterSkill, "id">): CharacterSkill {
  const id = uuid();
  db.prepare("INSERT INTO character_skills (id, character_id, skill_id, form_id, variant_group_id, conditions) VALUES (?, ?, ?, ?, ?, ?)").run(
    id, data.characterId, data.skillId, data.formId ?? null, data.variantGroupId ?? null, data.conditions ? JSON.stringify(data.conditions) : null
  );
  return { ...data, id };
}

export function updateCharacterSkillDb(cs: CharacterSkill): void {
  db.prepare("UPDATE character_skills SET form_id = ?, variant_group_id = ?, conditions = ? WHERE id = ?").run(
    cs.formId ?? null, cs.variantGroupId ?? null, cs.conditions ? JSON.stringify(cs.conditions) : null, cs.id
  );
}

export function deleteCharacterSkillDb(id: string): void {
  db.prepare("DELETE FROM character_skills WHERE id = ?").run(id);
}

export function deleteCharacterSkillsByCharId(characterId: string): void {
  db.prepare("DELETE FROM character_skills WHERE character_id = ?").run(characterId);
}

// --- Status Effects ---

interface StatusEffectRow {
  id: string;
  name: string;
  category: string;
  stats: string;
  default_modifier: number | null;
  stackable: number;
  max_stacks: number | null;
  on_max_stacks: string | null;
  resistable: number;
  tags: string | null;
}

function rowToStatusEffect(row: StatusEffectRow): StatusEffect {
  return {
    id: row.id,
    name: row.name,
    category: row.category as "buff" | "debuff" | "status",
    stats: JSON.parse(row.stats),
    defaultModifier: row.default_modifier ?? undefined,
    stackable: row.stackable === 1 ? true : undefined,
    maxStacks: row.max_stacks ?? undefined,
    onMaxStacks: row.on_max_stacks ?? undefined,
    resistable: row.resistable === 1 ? true : undefined,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
  };
}

export function getAllStatusEffects(): StatusEffect[] {
  return (db.prepare("SELECT * FROM status_effects ORDER BY category, name").all() as StatusEffectRow[]).map(rowToStatusEffect);
}

export function insertStatusEffect(data: Omit<StatusEffect, "id">): StatusEffect {
  const id = uuid();
  db.prepare(
    "INSERT INTO status_effects (id, name, category, stats, default_modifier, stackable, max_stacks, on_max_stacks, resistable, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id, data.name, data.category, JSON.stringify(data.stats),
    data.defaultModifier ?? null,
    data.stackable ? 1 : 0,
    data.maxStacks ?? null,
    data.onMaxStacks ?? null,
    data.resistable ? 1 : 0,
    data.tags ? JSON.stringify(data.tags) : null
  );
  return { ...data, id };
}

export function updateStatusEffectDb(effect: StatusEffect): void {
  db.prepare(
    "UPDATE status_effects SET name = ?, category = ?, stats = ?, default_modifier = ?, stackable = ?, max_stacks = ?, on_max_stacks = ?, resistable = ?, tags = ? WHERE id = ?"
  ).run(
    effect.name, effect.category, JSON.stringify(effect.stats),
    effect.defaultModifier ?? null,
    effect.stackable ? 1 : 0,
    effect.maxStacks ?? null,
    effect.onMaxStacks ?? null,
    effect.resistable ? 1 : 0,
    effect.tags ? JSON.stringify(effect.tags) : null,
    effect.id
  );
}

// --- Effect Tag Types (vocabulary) ---

interface EffectTagTypeRow {
  id: string;
  name: string;
  label: string;
  description: string;
  param_schema: string;
  sort_order: number;
}

function rowToEffectTagType(row: EffectTagTypeRow): EffectTagType {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    description: row.description,
    paramSchema: JSON.parse(row.param_schema),
    sortOrder: row.sort_order,
  };
}

export function getAllEffectTagTypes(): EffectTagType[] {
  return (db.prepare("SELECT * FROM effect_tag_types ORDER BY sort_order, name").all() as EffectTagTypeRow[]).map(rowToEffectTagType);
}

export function deleteStatusEffectDb(id: string): void {
  db.prepare("DELETE FROM status_effects WHERE id = ?").run(id);
}
