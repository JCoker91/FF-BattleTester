"use client";

import { useState } from "react";
import {
  Skill,
  SkillLevel,
  SkillType,
  EnergyCost,
  ENERGY_COLORS,
  SKILL_TYPES,
  SKILL_TYPE_LABELS,
  EnergyColor,
  Character,
} from "@/lib/types";
import { EnergyCostDisplay } from "./EnergyBadge";

const emptyLevel = (): SkillLevel => ({ description: "", cost: [] });
const emptySkill = (characterId: string, skillType: SkillType = "ability"): Omit<Skill, "id"> => ({
  name: "",
  characterId,
  skillType,
  levels: [emptyLevel(), emptyLevel(), emptyLevel()],
});

interface SkillFormProps {
  initial?: Skill;
  characters: Character[];
  defaultCharacterId?: string;
  defaultSkillType?: SkillType;
  onSave: (data: Omit<Skill, "id">) => void;
  onCancel: () => void;
}

export function SkillForm({
  initial,
  characters,
  defaultCharacterId,
  defaultSkillType,
  onSave,
  onCancel,
}: SkillFormProps) {
  const [form, setForm] = useState<Omit<Skill, "id">>(
    initial
      ? {
          name: initial.name,
          characterId: initial.characterId,
          skillType: initial.skillType,
          levels: [...initial.levels],
        }
      : emptySkill(defaultCharacterId ?? characters[0]?.id ?? "", defaultSkillType)
  );

  const updateLevel = (idx: number, patch: Partial<SkillLevel>) => {
    const levels = [...form.levels] as [SkillLevel, SkillLevel, SkillLevel];
    levels[idx] = { ...levels[idx], ...patch };
    setForm({ ...form, levels });
  };

  const addCost = (levelIdx: number, color: EnergyColor) => {
    const level = form.levels[levelIdx];
    const existing = level.cost.find((c) => c.color === color);
    const newCost: EnergyCost[] = existing
      ? level.cost.map((c) =>
          c.color === color ? { ...c, amount: c.amount + 1 } : c
        )
      : [...level.cost, { color, amount: 1 }];
    updateLevel(levelIdx, { cost: newCost });
  };

  const removeCost = (levelIdx: number, color: EnergyColor) => {
    const level = form.levels[levelIdx];
    const newCost = level.cost
      .map((c) => (c.color === color ? { ...c, amount: c.amount - 1 } : c))
      .filter((c) => c.amount > 0);
    updateLevel(levelIdx, { cost: newCost });
  };

  const submit = () => {
    if (!form.name.trim() || !form.characterId) return;
    onSave(form);
  };

  return (
    <div className="space-y-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Skill Name
          </label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Cross Slash"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Character
          </label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={form.characterId}
            onChange={(e) =>
              setForm({ ...form, characterId: e.target.value })
            }
          >
            <option value="">-- Select Character --</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.series ? ` (${c.series})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Type
          </label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={form.skillType}
            onChange={(e) =>
              setForm({ ...form, skillType: e.target.value as SkillType })
            }
          >
            {SKILL_TYPES.map((t) => (
              <option key={t} value={t}>
                {SKILL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {form.skillType === "ability" ? (
        // Abilities have 3 levels with energy costs
        form.levels.map((level, i) => (
          <div key={i} className="border border-gray-800 rounded p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">
                Level {i + 1}
              </span>
              <EnergyCostDisplay cost={level.cost} />
            </div>

            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500 min-h-[60px]"
              value={level.description}
              onChange={(e) => updateLevel(i, { description: e.target.value })}
              placeholder={`Level ${i + 1} description...`}
            />

            <div className="flex gap-1 items-center flex-wrap">
              <span className="text-xs text-gray-500 mr-1">Add cost:</span>
              {ENERGY_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => addCost(i, color)}
                  className="px-2 py-0.5 rounded text-xs text-white capitalize hover:opacity-80"
                  style={{
                    backgroundColor: `var(--color-energy-${color})`,
                  }}
                >
                  +{color}
                </button>
              ))}
              {level.cost.length > 0 && (
                <>
                  <span className="text-xs text-gray-500 ml-2 mr-1">
                    Remove:
                  </span>
                  {level.cost.map((c) => (
                    <button
                      key={c.color}
                      onClick={() => removeCost(i, c.color)}
                      className="px-2 py-0.5 rounded text-xs text-white capitalize opacity-60 hover:opacity-100"
                      style={{
                        backgroundColor: `var(--color-energy-${c.color})`,
                      }}
                    >
                      -{c.color}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        ))
      ) : (
        // Innate and Basic: single description, no levels or cost
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <textarea
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500 min-h-[60px]"
            value={form.levels[0].description}
            onChange={(e) => updateLevel(0, { description: e.target.value })}
            placeholder={`What does this ${form.skillType === "innate" ? "innate" : "basic action"} do?`}
          />
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={submit}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium"
        >
          {initial ? "Update Skill" : "Create Skill"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
