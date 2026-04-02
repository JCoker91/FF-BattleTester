"use client";

import { useState } from "react";
import {
  Skill,
  SkillLevel,
  SkillEffect,
  SkillType,
  EnergyCost,
  ENERGY_COLORS,
  SKILL_TYPES,
  SKILL_TYPE_LABELS,
  ELEMENTS,
  ELEMENT_LABELS,
  ELEMENT_ICONS,
  EnergyColor,
  SkillTemplate,
  TARGET_TYPES,
  TARGET_TYPE_LABELS,
  TargetType,
  StatusEffect,
} from "@/lib/types";
import { useStore } from "@/lib/store";
import { DAMAGE_CATEGORIES, DAMAGE_CATEGORY_LABELS, DAMAGE_TIERS, DAMAGE_TIER_LABELS } from "@/lib/damage-config";

const ENERGY_HEX: Record<EnergyColor, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  yellow: "#eab308",
};
import { EnergyCostDisplay } from "./EnergyBadge";

const emptyLevel = (): SkillLevel => ({ description: "", cost: [] });
const emptySkill = (
  skillType: SkillType = "ability",
): Omit<Skill, "id"> => ({
  name: "",
  description: "",
  skillType,
  leveled: false,
  levels: [emptyLevel(), emptyLevel(), emptyLevel()],
});

function EffectsEditor({
  effects,
  statusEffects,
  onChange,
}: {
  effects: SkillEffect[];
  statusEffects: StatusEffect[];
  onChange: (effects: SkillEffect[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [effectId, setEffectId] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("self");
  const [modifier, setModifier] = useState(20);
  const [duration, setDuration] = useState(2);
  const [chance, setChance] = useState(100);

  const isEditing = editIdx !== null;
  const showForm = adding || isEditing;

  const startEdit = (i: number) => {
    const e = effects[i];
    setEditIdx(i);
    setAdding(false);
    setEffectId(e.effectId);
    setTargetType(e.targetType);
    setModifier(e.modifier);
    setDuration(e.duration);
    setChance(e.chance ?? 100);
  };

  const resetForm = () => {
    setAdding(false);
    setEditIdx(null);
    setEffectId("");
    setModifier(20);
    setDuration(2);
    setChance(100);
  };

  const handleSave = () => {
    if (!effectId) return;
    const entry: SkillEffect = {
      effectId,
      targetType,
      modifier,
      duration,
      ...(chance < 100 ? { chance } : {}),
    };
    if (isEditing && editIdx !== null) {
      onChange(effects.map((e, i) => (i === editIdx ? entry : e)));
    } else {
      onChange([...effects, entry]);
    }
    resetForm();
  };

  const selectedEffect = statusEffects.find((se) => se.id === effectId);
  const handleEffectChange = (id: string) => {
    setEffectId(id);
    const se = statusEffects.find((s) => s.id === id);
    if (se?.defaultModifier !== undefined) setModifier(se.defaultModifier);
  };

  const buffEffects = statusEffects.filter((se) => se.category === "buff");
  const debuffEffects = statusEffects.filter((se) => se.category === "debuff");
  const statusOnlyEffects = statusEffects.filter((se) => se.category === "status");

  return (
    <div className="border-t border-gray-800 pt-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-purple-400 font-medium uppercase">Effects</span>
        {!showForm && (
          <button
            onClick={() => { setAdding(true); setEditIdx(null); }}
            className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          >
            + Add Effect
          </button>
        )}
      </div>

      {effects.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {effects.map((e, i) => {
            if (editIdx === i) return null;
            const se = statusEffects.find((s) => s.id === e.effectId);
            return (
              <div key={i} className="flex items-center gap-1.5 text-[11px] bg-gray-800/50 rounded px-2 py-0.5">
                <span className={`font-medium ${se?.category === "buff" ? "text-green-400" : se?.category === "status" ? "text-yellow-400" : "text-red-400"}`}>
                  {se?.name ?? "Unknown"}
                </span>
                {!se?.stats.includes("none") && (
                  <span className="text-gray-400">{e.modifier > 0 ? "+" : ""}{e.modifier}%</span>
                )}
                <span className="text-gray-600">{e.duration}t</span>
                <span className="text-gray-500 text-[10px]">{TARGET_TYPE_LABELS[e.targetType]}</span>
                {e.chance !== undefined && e.chance < 100 && (
                  <span className="text-amber-400 text-[10px]">{e.chance}% chance</span>
                )}
                <button onClick={() => startEdit(i)} className="ml-auto text-gray-600 hover:text-blue-400 text-[10px]">edit</button>
                <button onClick={() => onChange(effects.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 text-[10px]">x</button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="mt-1 bg-gray-800 rounded p-2 space-y-1.5">
          {isEditing && <span className="text-[9px] text-blue-400 font-medium">Editing effect</span>}
          <div className="flex gap-1.5 flex-wrap">
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
              value={effectId}
              onChange={(e) => handleEffectChange(e.target.value)}
            >
              <option value="">Select effect...</option>
              {buffEffects.length > 0 && (
                <optgroup label="Buffs">
                  {buffEffects.map((se) => <option key={se.id} value={se.id}>{se.name}</option>)}
                </optgroup>
              )}
              {debuffEffects.length > 0 && (
                <optgroup label="Debuffs">
                  {debuffEffects.map((se) => <option key={se.id} value={se.id}>{se.name}</option>)}
                </optgroup>
              )}
              {statusOnlyEffects.length > 0 && (
                <optgroup label="Statuses">
                  {statusOnlyEffects.map((se) => <option key={se.id} value={se.id}>{se.name}</option>)}
                </optgroup>
              )}
            </select>
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as TargetType)}
            >
              {TARGET_TYPES.map((t) => (
                <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5 items-center flex-wrap">
            {selectedEffect && !selectedEffect.stats.includes("none") && (
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                Mod %
                <input
                  type="number"
                  className="w-12 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={modifier}
                  onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
                />
              </label>
            )}
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Dur
              <input
                type="number"
                className="w-8 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
              />
              t
            </label>
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Chance
              <input
                type="number"
                className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                value={chance}
                onChange={(e) => setChance(parseInt(e.target.value) || 0)}
                min={1}
                max={100}
              />
              %
            </label>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handleSave}
              disabled={!effectId}
              className="text-[10px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {isEditing ? "Save" : "Add"}
            </button>
            <button onClick={resetForm} className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SkillFormProps {
  initial?: Skill;
  templates?: SkillTemplate[];
  defaultSkillType?: SkillType;
  onSave: (data: Omit<Skill, "id">) => void;
  onCancel: () => void;
}

export function SkillForm({
  initial,
  templates,
  defaultSkillType,
  onSave,
  onCancel,
}: SkillFormProps) {
  const { statusEffects } = useStore();
  const [form, setForm] = useState<Omit<Skill, "id">>(
    initial
      ? {
          name: initial.name,
          description: initial.description,
          skillType: initial.skillType,
          leveled: initial.leveled,
          levels: [...initial.levels],
        }
      : emptySkill(defaultSkillType)
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
    if (!form.name.trim()) return;
    onSave(form);
  };

  const isAbility = form.skillType === "ability";
  const isConditional = form.skillType === "conditional";

  return (
    <div className="space-y-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Short description */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Short Description
        </label>
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Brief summary shown in skill lists"
        />
      </div>

      {/* Leveled toggle for abilities and conditionals */}
      {(isAbility || isConditional) && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAbility ? form.leveled !== false : !!form.leveled}
            onChange={(e) => setForm({ ...form, leveled: e.target.checked })}
            className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">Leveled</span>
          <span className="text-[10px] text-gray-500">
            {isAbility ? "(uncheck for single-level skills like template spells)" : "(level tied to variant group)"}
          </span>
        </label>
      )}

      {/* Skill content */}
      {isAbility || isConditional ? (
        // Show 3 levels if leveled, 1 level if not
        (((isAbility && form.leveled === false) || (isConditional && !form.leveled)) ? [form.levels[0]] : form.levels).map((level, i) => (
          <div key={i} className="border border-gray-800 rounded p-3 space-y-2">
            <div className="flex items-center gap-2">
              {((isAbility && form.leveled !== false) || (isConditional && form.leveled)) && (
                <span className="text-xs font-bold text-gray-400 uppercase">
                  Level {i + 1}
                </span>
              )}
              {level.cost.length > 0 && <EnergyCostDisplay cost={level.cost} />}
            </div>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500 min-h-[60px]"
              value={level.description}
              onChange={(e) => updateLevel(i, { description: e.target.value })}
              placeholder={
                isConditional && !form.leveled
                  ? "What does this conditional skill do when active?"
                  : `Level ${i + 1} description...`
              }
            />
            {/* Damage metadata */}
            <div className="flex gap-2 items-center flex-wrap">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!level.instant}
                  onChange={(e) => updateLevel(i, { instant: e.target.checked || undefined })}
                  className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500 w-3 h-3"
                />
                <span className="text-[10px] text-yellow-400 font-medium">Instant</span>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Dmg Type:</span>
                <select
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                  value={level.damageCategory ?? ""}
                  onChange={(e) => updateLevel(i, { damageCategory: (e.target.value || undefined) as SkillLevel["damageCategory"] })}
                >
                  <option value="">None</option>
                  {DAMAGE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{DAMAGE_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              {level.damageCategory && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">Tier:</span>
                  <select
                    className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                    value={level.damageTier ?? "moderate"}
                    onChange={(e) => updateLevel(i, { damageTier: e.target.value })}
                  >
                    {DAMAGE_TIERS.map((t) => (
                      <option key={t} value={t}>{DAMAGE_TIER_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              )}
              {level.damageCategory && level.damageCategory !== "healing" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">Element:</span>
                  <select
                    className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                    value={level.element ?? ""}
                    onChange={(e) => updateLevel(i, { element: (e.target.value || undefined) as SkillLevel["element"] })}
                  >
                    <option value="">None</option>
                    {ELEMENTS.map((el) => (
                      <option key={el} value={el}>{ELEMENT_ICONS[el]} {ELEMENT_LABELS[el]}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Target:</span>
                <select
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                  value={level.targetType ?? ""}
                  onChange={(e) => updateLevel(i, { targetType: (e.target.value || undefined) as SkillLevel["targetType"] })}
                >
                  <option value="">None</option>
                  {TARGET_TYPES.map((t) => (
                    <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-1 items-center flex-wrap">
              <span className="text-xs text-gray-500 mr-1">Add cost:</span>
              {ENERGY_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => addCost(i, color)}
                  className="px-2 py-0.5 rounded text-xs text-white capitalize hover:opacity-80"
                  style={{ backgroundColor: ENERGY_HEX[color] }}
                >
                  +{color}
                </button>
              ))}
              {level.cost.length > 0 && (
                <>
                  <span className="text-xs text-gray-500 ml-2 mr-1">Remove:</span>
                  {level.cost.map((c) => (
                    <button
                      key={c.color}
                      onClick={() => removeCost(i, c.color)}
                      className="px-2 py-0.5 rounded text-xs text-white capitalize opacity-60 hover:opacity-100"
                      style={{ backgroundColor: ENERGY_HEX[c.color] }}
                    >
                      -{c.color}
                    </button>
                  ))}
                </>
              )}
            </div>
            {/* Cost note for variable costs */}
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-[11px] focus:outline-none focus:border-gray-500"
              value={level.costNote ?? ""}
              onChange={(e) => updateLevel(i, { costNote: e.target.value || undefined })}
              placeholder="Cost note (e.g. 'Repeat for each additional energy spent')"
            />
            {/* Effects (buff/debuff applications) */}
            <EffectsEditor
              effects={level.effects ?? []}
              statusEffects={statusEffects}
              onChange={(effects) => updateLevel(i, { effects: effects.length > 0 ? effects : undefined })}
            />
            {/* Per-level template link */}
            {isAbility && templates && templates.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 shrink-0">Template:</span>
                <select
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-gray-500"
                  value={level.templateId ?? ""}
                  onChange={(e) => updateLevel(i, { templateId: e.target.value || null })}
                >
                  <option value="">None</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <textarea
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500 min-h-[60px]"
            value={form.levels[0].description}
            onChange={(e) => updateLevel(0, { description: e.target.value })}
            placeholder={`What does this ${form.skillType} do?`}
          />
          {/* Damage & targeting for basic/innate */}
          <div className="flex gap-2 items-center flex-wrap">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.levels[0].instant}
                onChange={(e) => updateLevel(0, { instant: e.target.checked || undefined })}
                className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500 w-3 h-3"
              />
              <span className="text-[10px] text-yellow-400 font-medium">Instant</span>
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500">Dmg Type:</span>
              <select
                className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                value={form.levels[0].damageCategory ?? ""}
                onChange={(e) => updateLevel(0, { damageCategory: (e.target.value || undefined) as SkillLevel["damageCategory"] })}
              >
                <option value="">None</option>
                {DAMAGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{DAMAGE_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            {form.levels[0].damageCategory && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Tier:</span>
                <select
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                  value={form.levels[0].damageTier ?? "moderate"}
                  onChange={(e) => updateLevel(0, { damageTier: e.target.value })}
                >
                  {DAMAGE_TIERS.map((t) => (
                    <option key={t} value={t}>{DAMAGE_TIER_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            )}
            {form.levels[0].damageCategory && form.levels[0].damageCategory !== "healing" && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Element:</span>
                <select
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                  value={form.levels[0].element ?? ""}
                  onChange={(e) => updateLevel(0, { element: (e.target.value || undefined) as SkillLevel["element"] })}
                >
                  <option value="">None</option>
                  {ELEMENTS.map((el) => (
                    <option key={el} value={el}>{ELEMENT_ICONS[el]} {ELEMENT_LABELS[el]}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500">Target:</span>
              <select
                className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                value={form.levels[0].targetType ?? ""}
                onChange={(e) => updateLevel(0, { targetType: (e.target.value || undefined) as SkillLevel["targetType"] })}
              >
                <option value="">None</option>
                {TARGET_TYPES.map((t) => (
                  <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Effects for basic/innate */}
          <EffectsEditor
            effects={form.levels[0].effects ?? []}
            statusEffects={statusEffects}
            onChange={(effects) => updateLevel(0, { effects: effects.length > 0 ? effects : undefined })}
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
