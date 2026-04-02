"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Skill, SkillType, SKILL_TYPE_LABELS } from "@/lib/types";
import { SkillForm } from "@/components/SkillForm";
import { EnergyCostDisplay } from "@/components/EnergyBadge";
import { GlossaryText } from "@/components/Tooltip";

const TYPE_ORDER: SkillType[] = ["innate", "basic", "ability", "conditional"];

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
  const showLevels = (isAbility && skill.leveled !== false) || (skill.skillType === "conditional" && skill.leveled);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <button className="text-left flex-1 cursor-pointer" onClick={onToggleExpand}>
          <span className="font-semibold text-white text-sm">{skill.name}</span>
          {(isAbility || skill.skillType === "conditional") && skill.levels[0].cost.length > 0 && (
            <span className="ml-2">
              <EnergyCostDisplay cost={skill.levels[0].cost} />
            </span>
          )}
          {skill.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5"><GlossaryText text={skill.description} /></p>
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
          {showLevels ? (
            <div className="space-y-1">
              {skill.levels.map((level, i) => (
                <div key={i} className="text-sm">
                  <div>
                    <span className="text-gray-400 font-medium">Lv{i + 1}</span>{" "}
                    {(isAbility || skill.skillType === "conditional") && level.cost.length > 0 && <><EnergyCostDisplay cost={level.cost} />{" "}</>}
                    <span className="text-gray-300">
                      {level.description ? <GlossaryText text={level.description} /> : "(no description)"}
                    </span>
                  </div>
                  {level.costNote && (
                    <p className="text-[10px] text-yellow-500/70 italic ml-4 mt-0.5">{level.costNote}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-300">
              {skill.levels[0].description ? <GlossaryText text={skill.levels[0].description} /> : "(no description)"}
            </p>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const { skills, templates, addSkill, updateSkill, deleteSkill } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Group by skill type
  const groupedSkills = useMemo(() => {
    return TYPE_ORDER
      .map((type) => ({
        type,
        label: SKILL_TYPE_LABELS[type],
        skills: skills
          .filter((s) => s.skillType === type)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.skills.length > 0);
  }, [skills]);

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
      <p className="text-xs text-gray-500">
        Shared skill pool. Create skills here, then assign them to characters on their detail page.
      </p>

      {editing === "new" && (
        <SkillForm
          templates={templates}
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

      {groupedSkills.map((tg) => (
        <div key={tg.type} className="space-y-1.5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-800 pb-1">
            {tg.label} ({tg.skills.length})
          </h2>
          {tg.skills.map((skill) =>
            editing === skill.id ? (
              <SkillForm
                key={skill.id}
                initial={skill}
                templates={templates}
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
  );
}
