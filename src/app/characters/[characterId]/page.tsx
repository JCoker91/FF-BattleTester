"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Character, Skill, SkillType, SKILL_TYPE_LABELS } from "@/lib/types";
import { CharacterForm } from "@/components/CharacterForm";
import { SkillForm } from "@/components/SkillForm";
import { EnergyBadge, EnergyCostDisplay } from "@/components/EnergyBadge";

function SkillCard({
  skill,
  isEquipped,
  onToggleEquip,
  canEquipMore,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  isEquipped: boolean;
  onToggleEquip: () => void;
  canEquipMore: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-gray-900 border rounded-lg p-3 transition-colors ${
        isEquipped ? "border-blue-500/50" : "border-gray-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <button className="text-left flex-1 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <span className="font-semibold text-white text-sm">{skill.name}</span>
          <span className="ml-2">
            <EnergyCostDisplay cost={skill.levels[0].cost} />
          </span>
          {isEquipped && (
            <span className="ml-2 text-[10px] text-blue-400 font-medium uppercase">
              Equipped
            </span>
          )}
        </button>
        <div className="flex gap-1.5">
          <button
            onClick={onToggleEquip}
            disabled={!isEquipped && !canEquipMore}
            className={`text-xs px-2 py-1 rounded ${
              isEquipped
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : canEquipMore
                ? "bg-gray-800 hover:bg-gray-700 text-gray-300"
                : "bg-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            {isEquipped ? "Unequip" : "Equip"}
          </button>
          <button
            onClick={onEdit}
            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-300"
          >
            Delete
          </button>
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="mt-2 pl-2 border-l-2 border-gray-800">
            {skill.skillType === "ability" ? (
              <div className="space-y-1">
                {skill.levels.map((level, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-500 font-medium shrink-0 w-7">
                      Lv{i + 1}
                    </span>
                    <EnergyCostDisplay cost={level.cost} />
                    <span className="text-gray-300">
                      {level.description || "(no description)"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-300">
                {skill.levels[0].description || "(no description)"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillTypeSection({
  type,
  label,
  skills,
  equippedId,
  equippedIds,
  maxEquip,
  onToggleEquip,
  onEdit,
  onDelete,
  onAddNew,
  editingSkillId,
  setEditingSkillId,
  characters,
  charId,
  addSkill,
  updateSkill,
}: {
  type: SkillType;
  label: string;
  skills: Skill[];
  equippedId?: string | null; // for innate/basic (single)
  equippedIds?: string[]; // for ability (multiple)
  maxEquip: number;
  onToggleEquip: (skillId: string) => void;
  onEdit: (skillId: string) => void;
  onDelete: (skill: Skill) => void;
  onAddNew: () => void;
  editingSkillId: string | null;
  setEditingSkillId: (id: string | null) => void;
  characters: Character[];
  charId: string;
  addSkill: (data: Omit<Skill, "id">) => Promise<Skill>;
  updateSkill: (skill: Skill) => Promise<void>;
}) {
  const isEquipped = (skillId: string) => {
    if (equippedId !== undefined) return equippedId === skillId;
    return equippedIds?.includes(skillId) ?? false;
  };

  const equippedCount = equippedId !== undefined
    ? (equippedId ? 1 : 0)
    : (equippedIds?.length ?? 0);
  const canEquipMore = equippedCount < maxEquip;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {label} ({skills.length} available, {equippedCount}/{maxEquip} equipped)
        </h3>
        {editingSkillId !== `new-${type}` && (
          <button
            onClick={onAddNew}
            className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            + Add {label}
          </button>
        )}
      </div>

      {editingSkillId === `new-${type}` && (
        <SkillForm
          characters={characters}
          defaultCharacterId={charId}
          defaultSkillType={type}
          onSave={(data) => {
            addSkill(data);
            setEditingSkillId(null);
          }}
          onCancel={() => setEditingSkillId(null)}
        />
      )}

      {skills.length === 0 && editingSkillId !== `new-${type}` && (
        <p className="text-sm text-gray-500">None created yet.</p>
      )}

      {skills.map((skill) =>
        editingSkillId === skill.id ? (
          <SkillForm
            key={skill.id}
            initial={skill}
            characters={characters}
            onSave={(data) => {
              updateSkill({ ...data, id: skill.id } as Skill);
              setEditingSkillId(null);
            }}
            onCancel={() => setEditingSkillId(null)}
          />
        ) : (
          <SkillCard
            key={skill.id}
            skill={skill}
            isEquipped={isEquipped(skill.id)}
            onToggleEquip={() => onToggleEquip(skill.id)}
            canEquipMore={canEquipMore}
            onEdit={() => onEdit(skill.id)}
            onDelete={() => onDelete(skill)}
          />
        )
      )}
    </div>
  );
}

export default function CharacterDetailPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const router = useRouter();
  const {
    getCharacter,
    skills,
    characters,
    seriesList,
    updateCharacter,
    deleteCharacter,
    addSkill,
    updateSkill,
    deleteSkill,
  } = useStore();
  const [editingChar, setEditingChar] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  const char = getCharacter(characterId);

  const ownedSkills = useMemo(
    () => skills.filter((s) => s.characterId === characterId),
    [skills, characterId]
  );

  const innateSkills = useMemo(
    () => ownedSkills.filter((s) => s.skillType === "innate"),
    [ownedSkills]
  );
  const basicSkills = useMemo(
    () => ownedSkills.filter((s) => s.skillType === "basic"),
    [ownedSkills]
  );
  const abilitySkills = useMemo(
    () => ownedSkills.filter((s) => s.skillType === "ability"),
    [ownedSkills]
  );

  if (!char) {
    return (
      <div className="space-y-4">
        <Link href="/characters" className="text-sm text-gray-400 hover:text-gray-200">
          &larr; Back to Characters
        </Link>
        <p className="text-gray-500">Character not found.</p>
      </div>
    );
  }

  if (editingChar) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Link href="/characters" className="text-sm text-gray-400 hover:text-gray-200">
          &larr; Back to Characters
        </Link>
        <h1 className="text-2xl font-bold">Edit {char.name}</h1>
        <CharacterForm
          initial={char}
          availableSeries={seriesList}
          onSave={(data) => {
            updateCharacter({ ...data, id: char.id } as Character);
            setEditingChar(false);
          }}
          onCancel={() => setEditingChar(false)}
        />
      </div>
    );
  }

  const toggleEquipInnate = async (skillId: string) => {
    const newId = char.equippedInnateId === skillId ? null : skillId;
    await updateCharacter({ ...char, equippedInnateId: newId });
  };

  const toggleEquipBasic = async (skillId: string) => {
    const newId = char.equippedBasicId === skillId ? null : skillId;
    await updateCharacter({ ...char, equippedBasicId: newId });
  };

  const toggleEquipAbility = async (skillId: string) => {
    const isEquipped = char.equippedAbilityIds.includes(skillId);
    const newIds = isEquipped
      ? char.equippedAbilityIds.filter((id) => id !== skillId)
      : [...char.equippedAbilityIds, skillId];
    await updateCharacter({ ...char, equippedAbilityIds: newIds });
  };

  const handleDelete = async () => {
    if (confirm(`Delete "${char.name}"? This will also delete all their skills.`)) {
      await deleteCharacter(char.id);
      router.push("/characters");
    }
  };

  const handleDeleteSkill = async (skill: Skill) => {
    if (confirm(`Delete "${skill.name}"?`)) {
      await deleteSkill(skill.id);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/characters" className="text-sm text-gray-400 hover:text-gray-200">
        &larr; Back to Characters
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        {char.photoUrl ? (
          <img
            src={char.photoUrl}
            alt={char.name}
            className="w-24 h-24 rounded-xl object-cover border border-gray-700"
          />
        ) : (
          <div className="w-24 h-24 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl font-bold text-gray-600">
            {char.name.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{char.name}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
            {char.series && <span>{char.series}</span>}
            {char.series && <span className="text-gray-600">·</span>}
            <span>{char.type}</span>
          </div>
          <div className="flex gap-0.5 mt-2">
            {char.energyGeneration.map((eg) =>
              Array.from({ length: eg.amount }).map((_, j) => (
                <EnergyBadge key={`${eg.color}-${j}`} color={eg.color} size="md" />
              ))
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setEditingChar(true)}
            className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="text-xs px-3 py-1.5 rounded bg-red-900/50 hover:bg-red-900 text-red-300"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Summary */}
      {char.summary && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Summary
          </h2>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{char.summary}</p>
        </section>
      )}

      {/* Stats */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Stats
        </h2>
        <div className="grid grid-cols-6 gap-2 max-w-md">
          {(Object.entries(char.stats) as [string, number][]).map(([key, val]) => (
            <div key={key} className="text-center bg-gray-900 border border-gray-800 rounded-lg p-2">
              <div className="text-[10px] uppercase text-gray-500">{key}</div>
              <div className="text-lg font-bold text-white">{val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Skills by type */}
      <section className="space-y-6">
        <SkillTypeSection
          type="innate"
          label="Innate"
          skills={innateSkills}
          equippedId={char.equippedInnateId}
          maxEquip={1}
          onToggleEquip={toggleEquipInnate}
          onEdit={(id) => setEditingSkillId(id)}
          onDelete={handleDeleteSkill}
          onAddNew={() => setEditingSkillId("new-innate")}
          editingSkillId={editingSkillId}
          setEditingSkillId={setEditingSkillId}
          characters={characters}
          charId={char.id}
          addSkill={addSkill}
          updateSkill={updateSkill}
        />

        <SkillTypeSection
          type="basic"
          label="Basic"
          skills={basicSkills}
          equippedId={char.equippedBasicId}
          maxEquip={1}
          onToggleEquip={toggleEquipBasic}
          onEdit={(id) => setEditingSkillId(id)}
          onDelete={handleDeleteSkill}
          onAddNew={() => setEditingSkillId("new-basic")}
          editingSkillId={editingSkillId}
          setEditingSkillId={setEditingSkillId}
          characters={characters}
          charId={char.id}
          addSkill={addSkill}
          updateSkill={updateSkill}
        />

        <SkillTypeSection
          type="ability"
          label="Ability"
          skills={abilitySkills}
          equippedIds={char.equippedAbilityIds}
          maxEquip={3}
          onToggleEquip={toggleEquipAbility}
          onEdit={(id) => setEditingSkillId(id)}
          onDelete={handleDeleteSkill}
          onAddNew={() => setEditingSkillId("new-ability")}
          editingSkillId={editingSkillId}
          setEditingSkillId={setEditingSkillId}
          characters={characters}
          charId={char.id}
          addSkill={addSkill}
          updateSkill={updateSkill}
        />
      </section>
    </div>
  );
}
