"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Skill, SkillType, SKILL_TYPE_LABELS } from "@/lib/types";
import { SkillForm } from "@/components/SkillForm";
import { EnergyCostDisplay } from "@/components/EnergyBadge";

const TYPE_ORDER: SkillType[] = ["innate", "basic", "ability"];

function SkillItem({
  skill,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isAbility = skill.skillType === "ability";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <button className="text-left flex-1 cursor-pointer" onClick={onToggleExpand}>
          <span className="font-semibold text-white text-sm">{skill.name}</span>
          {isAbility && (
            <span className="ml-2">
              <EnergyCostDisplay cost={skill.levels[0].cost} />
            </span>
          )}
        </button>
        <div className="flex gap-2">
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
          {isAbility ? (
            <div className="space-y-1">
              {skill.levels.map((level, i) => (
                <div key={i} className="text-sm">
                  <span className="text-gray-400 font-medium">Lv{i + 1}</span>{" "}
                  <EnergyCostDisplay cost={level.cost} />{" "}
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

export default function SkillsPage() {
  const { skills, characters, addSkill, updateSkill, deleteSkill } =
    useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Group by character, then by type within each character
  const groupedSkills = useMemo(() => {
    const groups: {
      label: string;
      charId: string;
      typeGroups: { type: SkillType; label: string; skills: Skill[] }[];
    }[] = [];

    for (const char of characters) {
      const charSkills = skills.filter((s) => s.characterId === char.id);
      if (charSkills.length === 0) continue;

      const typeGroups = TYPE_ORDER
        .map((type) => ({
          type,
          label: SKILL_TYPE_LABELS[type],
          skills: charSkills
            .filter((s) => s.skillType === type)
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((g) => g.skills.length > 0);

      groups.push({ label: char.name, charId: char.id, typeGroups });
    }

    // Unassigned
    const unassigned = skills.filter(
      (s) => !s.characterId || !characters.some((c) => c.id === s.characterId)
    );
    if (unassigned.length > 0) {
      const typeGroups = TYPE_ORDER
        .map((type) => ({
          type,
          label: SKILL_TYPE_LABELS[type],
          skills: unassigned
            .filter((s) => s.skillType === type)
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((g) => g.skills.length > 0);
      groups.push({ label: "Unassigned", charId: "", typeGroups });
    }

    return groups;
  }, [skills, characters]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Skills</h1>
        {editing !== "new" && (
          <button
            onClick={() => setEditing("new")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium"
          >
            + New Skill
          </button>
        )}
      </div>

      {editing === "new" && (
        <SkillForm
          characters={characters}
          onSave={(data) => {
            addSkill(data);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {skills.length === 0 && editing !== "new" && (
        <p className="text-gray-500 text-sm">
          No skills yet. Create one to get started.
        </p>
      )}

      {groupedSkills.map((group) => (
        <div key={group.charId || "__unassigned"} className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-800 pb-1">
            {group.label}
          </h2>
          {group.typeGroups.map((tg) => (
            <div key={tg.type} className="space-y-1.5 pl-2">
              <h3 className="text-xs font-medium text-gray-500 uppercase">
                {tg.label}
              </h3>
              {tg.skills.map((skill) =>
                editing === skill.id ? (
                  <SkillForm
                    key={skill.id}
                    initial={skill}
                    characters={characters}
                    onSave={(data) => {
                      updateSkill({ ...data, id: skill.id } as Skill);
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <SkillItem
                    key={skill.id}
                    skill={skill}
                    expanded={expandedId === skill.id}
                    onToggleExpand={() =>
                      setExpandedId(expandedId === skill.id ? null : skill.id)
                    }
                    onEdit={() => setEditing(skill.id)}
                    onDelete={() => {
                      if (confirm(`Delete "${skill.name}"?`)) {
                        deleteSkill(skill.id);
                      }
                    }}
                  />
                )
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
