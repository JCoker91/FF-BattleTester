"use client";

import { useState, useMemo } from "react";
import { v4 as uuid } from "uuid";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Character, Skill, SkillType, SkillEffect, SkillCondition, CONDITION_TYPES, CONDITION_TYPE_LABELS, ConditionType, CharacterType, CHARACTER_TYPES, EnergyColor, EnergyGeneration, ENERGY_COLORS, Form, ELEMENTS, ELEMENT_LABELS, ELEMENT_ICONS, DEFAULT_ELEMENTAL, TARGET_TYPE_LABELS } from "@/lib/types";

const ENERGY_HEX: Record<EnergyColor, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  yellow: "#eab308",
};
import { CharacterForm } from "@/components/CharacterForm";
import { SkillForm } from "@/components/SkillForm";
import { EnergyBadge, EnergyCostDisplay } from "@/components/EnergyBadge";
import { GlossaryText } from "@/components/Tooltip";

function SkillEffectTag({ effect }: { effect: SkillEffect }) {
  const { statusEffects } = useStore();
  const se = statusEffects.find((s) => s.id === effect.effectId);
  if (!se) return null;
  const modText = !se.stats.includes("none") ? ` ${effect.modifier > 0 ? "+" : ""}${effect.modifier}%` : "";
  return (
    <span className="inline-flex items-center gap-1 text-[10px]">
      <span className={se.category === "buff" ? "text-green-400" : se.category === "status" ? "text-yellow-400" : "text-red-400"}>{se.name}{modText}</span>
      <span className="text-gray-600">{effect.duration === -1 ? "Perm" : `${effect.duration}t`}</span>
      <span className="text-gray-500">{TARGET_TYPE_LABELS[effect.targetType]}</span>
      {effect.chance !== undefined && effect.chance < 100 && (
        <span className="text-amber-400">{effect.chance}%</span>
      )}
    </span>
  );
}

function SkillCard({
  skill,
  isEquipped,
  canEquipMore,
  onToggleEquip,
  onEdit,
  onDelete,
  onUnassign,
  formLabel,
  variantGroupLabel,
  onLinkVariant,
  onUnlinkVariant,
  formScope,
  onToggleFormScope,
}: {
  skill: Skill;
  isEquipped?: boolean;
  canEquipMore?: boolean;
  onToggleEquip?: () => void;
  onEdit: () => void;
  onUnassign?: () => void;
  variantGroupLabel?: string;
  onLinkVariant?: () => void;
  onUnlinkVariant?: () => void;
  formScope?: "all" | string; // "all" or form name
  onToggleFormScope?: () => void;
  onDelete: () => void;
  formLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const showEquip = onToggleEquip !== undefined && isEquipped !== undefined;

  return (
    <div className={`bg-gray-900 border rounded-lg p-3 transition-colors ${isEquipped ? "border-blue-500/50" : "border-gray-800"}`}>
      <div className="flex items-center justify-between">
        <button className="text-left flex-1 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <span className="font-semibold text-white text-sm">{skill.name}</span>
          {(skill.skillType === "ability" || skill.skillType === "conditional") && skill.levels[0].cost.length > 0 && (
            <span className="ml-2">
              <EnergyCostDisplay cost={skill.levels[0].cost} />
            </span>
          )}
          {isEquipped && (
            <span className="ml-2 text-[10px] text-blue-400 font-medium uppercase">Equipped</span>
          )}
          {variantGroupLabel && (
            <span className="ml-2 text-[10px] text-purple-400 font-medium">
              🔗 {variantGroupLabel}
            </span>
          )}
          {skill.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5"><GlossaryText text={skill.description} /></p>
          )}
        </button>
        <div className="flex gap-1.5">
          {showEquip && (
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
          )}
          <button
            onClick={onEdit}
            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            Edit
          </button>
          {onToggleFormScope && (
            <button
              onClick={onToggleFormScope}
              className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                formScope === "all"
                  ? "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                  : "bg-gray-800 text-gray-500 hover:text-gray-300"
              }`}
              title={formScope === "all" ? "Available in all forms — click to restrict" : `Only in ${formScope} — click to make available in all forms`}
            >
              {formScope === "all" ? "All Forms" : formScope}
            </button>
          )}
          {onLinkVariant && !variantGroupLabel && (
            <button
              onClick={onLinkVariant}
              className="text-xs px-2 py-1 rounded bg-purple-900/50 hover:bg-purple-900 text-purple-300"
            >
              🔗 Link
            </button>
          )}
          {onUnlinkVariant && variantGroupLabel && (
            <button
              onClick={onUnlinkVariant}
              className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
            >
              Unlink
            </button>
          )}
          {onUnassign && (
            <button
              onClick={onUnassign}
              className="text-xs px-2 py-1 rounded bg-orange-900/50 hover:bg-orange-900 text-orange-300"
            >
              Unassign
            </button>
          )}
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
            {skill.skillType === "ability" || (skill.skillType === "conditional" && skill.leveled) ? (
              <div className="space-y-1">
                {skill.levels.map((level, i) => (
                  <div key={i} className="text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 font-medium shrink-0 w-7">Lv{i + 1}</span>
                      {(skill.skillType === "ability" || skill.skillType === "conditional") && <EnergyCostDisplay cost={level.cost} />}
                      <span className="text-gray-300">{level.description ? <GlossaryText text={level.description} /> : "(no description)"}</span>
                    </div>
                    {level.costNote && (
                      <p className="text-[10px] text-yellow-500/70 italic ml-9 mt-0.5">{level.costNote}</p>
                    )}
                    {level.effects && level.effects.length > 0 && (
                      <div className="ml-9 mt-0.5 space-y-0.5">
                        {level.effects.map((eff, ei) => (
                          <SkillEffectTag key={ei} effect={eff} />
                        ))}
                      </div>
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

function ConditionsEditor({
  conditions,
  forms,
  onChange,
}: {
  conditions: SkillCondition[];
  forms: Form[];
  onChange: (conditions: SkillCondition[]) => void;
}) {
  const { statusEffects } = useStore();
  const [adding, setAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newType, setNewType] = useState<ConditionType>("buff");
  const [newValue, setNewValue] = useState("");

  const buffEffects = statusEffects.filter((se) => se.category === "buff");
  const debuffEffects = statusEffects.filter((se) => se.category === "debuff");
  const statusOnlyEffects = statusEffects.filter((se) => se.category === "status");

  const getConditionLabel = (cond: SkillCondition) => {
    if (cond.type === "form") return forms.find((f) => f.id === cond.value)?.name ?? cond.value;
    if (cond.type === "buff") return statusEffects.find((se) => se.id === cond.value)?.name ?? cond.value;
    if (cond.type === "debuff") return cond.value === "any" ? "Any" : statusEffects.find((se) => se.id === cond.value)?.name ?? cond.value;
    if (cond.type === "status") return cond.value === "any" ? "Any" : statusEffects.find((se) => se.id === cond.value)?.name ?? cond.value;
    return `${cond.value}%`;
  };

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setNewType(conditions[i].type);
    setNewValue(conditions[i].value);
    setAdding(false);
  };

  const isEditing = editingIndex !== null;
  const showForm = adding || isEditing;

  return (
    <div className="ml-4 mt-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-amber-400 font-medium uppercase">Conditions</span>
        {!showForm && (
          <button
            onClick={() => { setAdding(true); setEditingIndex(null); setNewType("buff"); setNewValue(""); }}
            className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          >
            + Add
          </button>
        )}
      </div>
      {conditions.length === 0 && !showForm && (
        <p className="text-[10px] text-gray-600 mt-0.5">No conditions (always active)</p>
      )}
      {conditions.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {conditions.map((cond, i) => (
            editingIndex === i ? null : (
              <div key={i} className="flex items-center gap-1.5 text-[11px] bg-gray-800/50 rounded px-2 py-0.5">
                <span className="text-amber-400 font-medium">{CONDITION_TYPE_LABELS[cond.type]}</span>
                <span className="text-gray-300">{getConditionLabel(cond)}</span>
                <button
                  onClick={() => startEdit(i)}
                  className="ml-auto text-gray-600 hover:text-blue-400 text-[10px]"
                >
                  edit
                </button>
                <button
                  onClick={() => onChange(conditions.filter((_, j) => j !== i))}
                  className="text-gray-600 hover:text-red-400 text-[10px]"
                >
                  x
                </button>
              </div>
            )
          ))}
        </div>
      )}
      {showForm && (
        <div className="mt-1 bg-gray-800 rounded p-2 space-y-1.5">
          {isEditing && <span className="text-[9px] text-blue-400 font-medium">Editing condition</span>}
          <div className="flex gap-1.5">
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
              value={newType}
              onChange={(e) => { setNewType(e.target.value as ConditionType); setNewValue(""); }}
            >
              {CONDITION_TYPES.map((ct) => (
                <option key={ct} value={ct}>{CONDITION_TYPE_LABELS[ct]}</option>
              ))}
            </select>
            {newType === "form" ? (
              <select
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              >
                <option value="">Select form...</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            ) : newType === "buff" ? (
              <select
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              >
                <option value="">Select buff...</option>
                {buffEffects.map((se) => (
                  <option key={se.id} value={se.id}>{se.name}</option>
                ))}
              </select>
            ) : newType === "debuff" ? (
              <select
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              >
                <option value="">Select debuff...</option>
                <option value="any">Any Debuff</option>
                {debuffEffects.map((se) => (
                  <option key={se.id} value={se.id}>{se.name}</option>
                ))}
              </select>
            ) : newType === "status" ? (
              <select
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              >
                <option value="">Select status...</option>
                <option value="any">Any Status</option>
                {statusOnlyEffects.map((se) => (
                  <option key={se.id} value={se.id}>{se.name}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="%"
                  min={1}
                  max={99}
                />
                <span className="text-[10px] text-gray-500">%</span>
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                if (!newValue) return;
                if (isEditing && editingIndex !== null) {
                  const updated = conditions.map((c, i) => i === editingIndex ? { type: newType, value: newValue } : c);
                  onChange(updated);
                  setEditingIndex(null);
                } else {
                  onChange([...conditions, { type: newType, value: newValue }]);
                  setAdding(false);
                }
                setNewValue("");
              }}
              disabled={!newValue}
              className="text-[10px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {isEditing ? "Save" : "Add"}
            </button>
            <button
              onClick={() => { setAdding(false); setEditingIndex(null); setNewValue(""); }}
              className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
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
    forms: allForms,
    seriesList,
    updateCharacter,
    deleteCharacter,
    addSkill,
    updateSkill,
    deleteSkill,
    getFormsForCharacter,
    addForm,
    updateForm,
    deleteForm,
    templates,
    getCharacterSkills,
    addCharacterSkill,
    deleteCharacterSkill,
    updateCharacterSkill,
    statusEffects,
  } = useStore();
  const [editingChar, setEditingChar] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [assigningSkillType, setAssigningSkillType] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [linkingSkillId, setLinkingSkillId] = useState<string | null>(null);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [editFormName, setEditFormName] = useState("");
  const [editFormPhoto, setEditFormPhoto] = useState<string | null>(null);
  const [editFormType, setEditFormType] = useState<string | null>(null);
  const [editFormEnergy, setEditFormEnergy] = useState<EnergyGeneration[] | null>(null);
  const [editFormStats, setEditFormStats] = useState<Record<string, number> | null>(null);
  const [editFormElemRes, setEditFormElemRes] = useState<Record<string, number> | null>(null);
  const [editFormElemDmg, setEditFormElemDmg] = useState<Record<string, number> | null>(null);
  const [editFormSummary, setEditFormSummary] = useState<string>("");
  const [editFormStartable, setEditFormStartable] = useState<boolean>(true);
  const [uploadingFormPhoto, setUploadingFormPhoto] = useState(false);
  const [newFormName, setNewFormName] = useState("");

  const char = getCharacter(characterId);
  const charForms = getFormsForCharacter(characterId);

  // Default to the first form
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const currentFormId = activeFormId ?? charForms[0]?.id ?? null;
  const currentForm = charForms.find((f) => f.id === currentFormId);
  const isBaseForm = currentFormId === charForms[0]?.id;

  // Resolved display values based on active form
  const displayPhoto = currentForm?.photoUrl ?? char?.photoUrl;
  const displayType = currentForm?.typeOverride ?? char?.type;
  const displayEnergy = currentForm?.energyOverride ?? char?.energyGeneration ?? [];
  const displayStats = currentForm?.statOverrides ? { ...char?.stats, ...currentForm.statOverrides } : char?.stats;
  const displayElemRes = char ? (currentForm?.elementalResOverride
    ? { ...char.elementalResistance, ...currentForm.elementalResOverride }
    : char.elementalResistance) : DEFAULT_ELEMENTAL;
  const displayElemDmg = char ? (currentForm?.elementalDmgOverride
    ? { ...char.elementalDamage, ...currentForm.elementalDmgOverride }
    : char.elementalDamage) : DEFAULT_ELEMENTAL;

  const charAssignments = getCharacterSkills(characterId);
  const charSkillIds = new Set(charAssignments.map((cs) => cs.skillId));
  const ownedSkills = useMemo(
    () => skills.filter((s) => charSkillIds.has(s.id)),
    [skills, charSkillIds]
  );

  const baseFormId = charForms[0]?.id ?? null;

  const getAssignFormId = (skillId: string) => charAssignments.find((cs) => cs.skillId === skillId)?.formId ?? null;

  // Skills visible for the current form
  const visibleSkills = useMemo(
    () => ownedSkills.filter((s) => {
      const assignFormId = getAssignFormId(s.id);
      return assignFormId === null || assignFormId === currentFormId;
    }),
    [ownedSkills, currentFormId, charAssignments]
  );

  const innateSkills = useMemo(() => visibleSkills.filter((s) => s.skillType === "innate"), [visibleSkills]);
  const basicSkills = useMemo(() => visibleSkills.filter((s) => s.skillType === "basic"), [visibleSkills]);
  const abilitySkills = useMemo(() => visibleSkills.filter((s) => s.skillType === "ability"), [visibleSkills]);
  const conditionalSkills = useMemo(() => visibleSkills.filter((s) => s.skillType === "conditional"), [visibleSkills]);

  if (!char) {
    return (
      <div className="space-y-4">
        <Link href="/characters" className="text-sm text-gray-400 hover:text-gray-200">&larr; Back to Characters</Link>
        <p className="text-gray-500">Character not found.</p>
      </div>
    );
  }

  if (editingChar) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Link href="/characters" className="text-sm text-gray-400 hover:text-gray-200">&larr; Back to Characters</Link>
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

  const getFormLabel = (skill: Skill) => {
    const assignFormId = getAssignFormId(skill.id);
    if (!assignFormId) return undefined;
    const f = charForms.find((fo) => fo.id === assignFormId);
    return f ? f.name : undefined;
  };

  const handleDelete = async () => {
    if (confirm(`Delete "${char.name}"? This will also delete all their skills.`)) {
      await deleteCharacter(char.id);
      router.push("/characters");
    }
  };

  const handleDeleteSkill = async (skill: Skill) => {
    if (confirm(`Delete "${skill.name}"?`)) await deleteSkill(skill.id);
  };

  const handleAddForm = async () => {
    const name = newFormName.trim();
    if (!name) return;
    await addForm(char.id, name);
    setNewFormName("");
  };

  const renderSkillSection = (type: SkillType, label: string, skillList: Skill[]) => {
    const assignedIds = new Set(charAssignments.map((cs) => cs.skillId));
    const availableToAssign = skills
      .filter((s) => s.skillType === type && !assignedIds.has(s.id))
      .filter((s) => assignSearch === "" || s.name.toLowerCase().includes(assignSearch.toLowerCase()));

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {label}
          </h3>
          <div className="flex gap-1">
            {assigningSkillType !== type && editingSkillId !== `new-${type}` && (
              <>
                <button
                  onClick={() => { setAssigningSkillType(type); setAssignSearch(""); }}
                  className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  + Assign
                </button>
                <button
                  onClick={() => setEditingSkillId(`new-${type}`)}
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
                >
                  + Create New
                </button>
              </>
            )}
          </div>
        </div>

        {/* Assign existing skill picker */}
        {assigningSkillType === type && (
          <div className="bg-gray-800 rounded p-2 space-y-2">
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-gray-500"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              placeholder={`Search ${label} skills...`}
              autoFocus
            />
            <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
              {availableToAssign.length === 0 && (
                <p className="text-xs text-gray-500">No matching {label} skills available. Create one on the Skills page.</p>
              )}
              {availableToAssign.map((skill) => (
                <button
                  key={skill.id}
                  onClick={async () => {
                    await addCharacterSkill({
                      characterId: char.id,
                      skillId: skill.id,
                      formId: charForms.length > 1 ? currentFormId : null,
                      variantGroupId: null,
                    });
                  }}
                  className="w-full text-left px-2 py-1.5 rounded text-sm bg-gray-900 hover:bg-gray-700 text-white transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{skill.name}</span>
                    {skill.levels[0].cost.length > 0 && <EnergyCostDisplay cost={skill.levels[0].cost} />}
                  </div>
                  {skill.description && <p className="text-[10px] text-gray-500 truncate">{skill.description}</p>}
                </button>
              ))}
            </div>
            <button onClick={() => setAssigningSkillType(null)} className="text-xs px-3 py-1 rounded bg-gray-700 text-gray-300">
              Done
            </button>
          </div>
        )}

        {editingSkillId === `new-${type}` && (
          <SkillForm
            templates={templates}
            defaultSkillType={type}
            onSave={async (data) => {
              const newSkill = await addSkill(data);
              // Auto-assign to this character
              await addCharacterSkill({
                characterId: char.id,
                skillId: newSkill.id,
                formId: charForms.length > 1 ? currentFormId : null,
                variantGroupId: null,
              });
              setEditingSkillId(null);
            }}
            onCancel={() => setEditingSkillId(null)}
          />
        )}

        {skillList.length === 0 && editingSkillId !== `new-${type}` && (
          <p className="text-sm text-gray-500">None created yet.</p>
        )}

        {skillList.map((skill) =>
          editingSkillId === skill.id ? (
            <SkillForm
              key={skill.id}
              initial={skill}
              templates={templates}
              onSave={(data) => { updateSkill({ ...data, id: skill.id } as Skill); setEditingSkillId(null); }}
              onCancel={() => setEditingSkillId(null)}
            />
          ) : (
            <div key={skill.id} className="space-y-1">
              <SkillCard
                skill={skill}
                onEdit={() => setEditingSkillId(skill.id)}
                onDelete={() => handleDeleteSkill(skill)}
                onUnassign={() => {
                  const assign = charAssignments.find((cs) => cs.skillId === skill.id);
                  if (assign && confirm(`Unassign "${skill.name}" from this character?`)) {
                    deleteCharacterSkill(assign.id);
                  }
                }}
                formLabel={undefined}
                formScope={charForms.length > 1 ? (() => {
                  const assign = charAssignments.find((cs) => cs.skillId === skill.id);
                  if (!assign?.formId) return "all";
                  const form = charForms.find((f) => f.id === assign.formId);
                  return form?.name ?? "Unknown";
                })() : undefined}
                onToggleFormScope={charForms.length > 1 ? () => {
                  const assign = charAssignments.find((cs) => cs.skillId === skill.id);
                  if (!assign) return;
                  if (assign.formId === null) {
                    // Switch to current form only
                    updateCharacterSkill({ ...assign, formId: currentFormId });
                  } else {
                    // Switch to all forms
                    updateCharacterSkill({ ...assign, formId: null });
                  }
                } : undefined}
                variantGroupLabel={(() => {
                  const assign = charAssignments.find((cs) => cs.skillId === skill.id);
                  if (!assign?.variantGroupId) return undefined;
                  const siblings = charAssignments.filter((cs) => cs.variantGroupId === assign.variantGroupId && cs.skillId !== skill.id);
                  const siblingNames = siblings.map((cs) => skills.find((s) => s.id === cs.skillId)?.name).filter(Boolean);
                  return siblingNames.length > 0 ? siblingNames.join(", ") : "Group";
                })()}
                onLinkVariant={() => setLinkingSkillId(skill.id)}
                onUnlinkVariant={() => {
                  const assign = charAssignments.find((cs) => cs.skillId === skill.id);
                  if (assign) updateCharacterSkill({ ...assign, variantGroupId: null });
                }}
              />
              {/* Variant linking picker */}
              {linkingSkillId === skill.id && (
                <div className="bg-gray-800 rounded p-2 space-y-1 ml-4">
                  <span className="text-[10px] text-purple-400 font-medium">Link &quot;{skill.name}&quot; with:</span>
                  {ownedSkills
                    .filter((s) => s.id !== skill.id)
                    .map((targetSkill) => {
                      const targetAssign = charAssignments.find((cs) => cs.skillId === targetSkill.id);
                      if (!targetAssign) return null;
                      return (
                        <button
                          key={targetSkill.id}
                          onClick={async () => {
                            const sourceAssign = charAssignments.find((cs) => cs.skillId === skill.id);
                            if (!sourceAssign) return;
                            // Use existing group or create new one
                            const groupId = targetAssign.variantGroupId ?? sourceAssign.variantGroupId ?? uuid();
                            await updateCharacterSkill({ ...sourceAssign, variantGroupId: groupId });
                            await updateCharacterSkill({ ...targetAssign, variantGroupId: groupId });
                            setLinkingSkillId(null);
                          }}
                          className="w-full text-left px-2 py-1 rounded text-sm bg-gray-900 hover:bg-gray-700 text-white transition-colors"
                        >
                          {targetSkill.name}
                          {targetAssign.variantGroupId && (
                            <span className="ml-2 text-[9px] text-purple-400">already in a group</span>
                          )}
                        </button>
                      );
                    })}
                  <button onClick={() => setLinkingSkillId(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                </div>
              )}
              {/* Status-based variant trigger */}
              {(() => {
                const assign = charAssignments.find((cs) => cs.skillId === skill.id);
                if (!assign?.variantGroupId) return null;
                return (
                  <div className="bg-gray-900/50 border border-gray-800 rounded p-2 ml-4 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-purple-300 font-medium">Status trigger:</span>
                    <select
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-[11px] focus:outline-none"
                      value={assign.statusConditionId ?? ""}
                      onChange={(e) => {
                        updateCharacterSkill({ ...assign, statusConditionId: e.target.value || null });
                      }}
                    >
                      <option value="">— None (use form trigger) —</option>
                      {statusEffects.map((se) => (
                        <option key={se.id} value={se.id}>{se.name}</option>
                      ))}
                    </select>
                    {assign.statusConditionId && (
                      <span className="text-[10px] text-gray-500">Swaps in when this status is active on the caster</span>
                    )}
                  </div>
                );
              })()}

              {/* Conditions editor for conditional skills */}
              {skill.skillType === "conditional" && (() => {
                const assign = charAssignments.find((cs) => cs.skillId === skill.id);
                if (!assign) return null;
                const conditions = assign.conditions ?? [];
                return (
                  <ConditionsEditor
                    conditions={conditions}
                    forms={charForms}
                    onChange={(newConditions) => {
                      updateCharacterSkill({ ...assign, conditions: newConditions.length > 0 ? newConditions : undefined });
                    }}
                  />
                );
              })()}
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/characters" className="text-sm text-gray-400 hover:text-gray-200">&larr; Back to Characters</Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        {displayPhoto ? (
          <img src={displayPhoto} alt={char.name} className="w-24 h-24 rounded-xl object-cover border border-gray-700" />
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
            <span>{displayType}</span>
            {!isBaseForm && currentForm && (
              <span className="text-[10px] text-blue-400 font-medium uppercase">{currentForm.name}</span>
            )}
          </div>
          <div className="flex gap-0.5 mt-2">
            {displayEnergy.map((eg) =>
              Array.from({ length: eg.amount }).map((_, j) => (
                <EnergyBadge key={`${eg.color}-${j}`} color={eg.color} size="md" />
              ))
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setEditingChar(true)} className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">Edit</button>
          <button onClick={handleDelete} className="text-xs px-3 py-1.5 rounded bg-red-900/50 hover:bg-red-900 text-red-300">Delete</button>
        </div>
      </div>

      {char.summary && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Summary</h2>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{char.summary}</p>
        </section>
      )}

      {/* Stats */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Stats</h2>
        <div className="grid grid-cols-6 gap-2 max-w-md">
          {(["hp", "atk", "mAtk", "def", "spi", "spd"] as const).map((key) => {
            const val = (displayStats ?? char.stats)[key] ?? 0;
            const baseVal = char.stats[key];
            const isOverridden = !isBaseForm && val !== baseVal;
            return (
              <div key={key} className="text-center bg-gray-900 border border-gray-800 rounded-lg p-2">
                <div className="text-[10px] uppercase text-gray-500">{key}</div>
                <div className={`text-lg font-bold ${isOverridden ? (val > baseVal ? "text-green-400" : "text-red-400") : "text-white"}`}>{val}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Elemental */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Elemental</h2>
        <div className="grid grid-cols-7 gap-2 max-w-lg">
          {ELEMENTS.map((elem) => {
            const res = displayElemRes[elem];
            const dmg = displayElemDmg[elem];
            return (
              <div key={elem} className="text-center bg-gray-900 border border-gray-800 rounded-lg p-1.5">
                <div className="text-sm mb-0.5">{ELEMENT_ICONS[elem]}</div>
                <div className="text-[9px] uppercase text-gray-500 mb-1">{ELEMENT_LABELS[elem]}</div>
                <div className={`text-xs font-bold ${res < 100 ? "text-red-400" : res > 100 ? "text-green-400" : "text-white"}`}>
                  {res}%
                </div>
                <div className="text-[8px] text-gray-600">resist</div>
                <div className={`text-xs font-bold mt-0.5 ${dmg > 100 ? "text-blue-400" : dmg < 100 ? "text-orange-400" : "text-white"}`}>
                  {dmg}%
                </div>
                <div className="text-[8px] text-gray-600">dmg</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Status Resistance */}
      {statusEffects.filter((se) => se.resistable).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Status Resistance</h2>
          <div className="grid grid-cols-4 gap-2 max-w-lg">
            {statusEffects.filter((se) => se.resistable).map((se) => {
              const baseVal = char.statusResistance[se.id] ?? 0;
              const formVal = currentForm?.statusResistanceOverride?.[se.id];
              const displayVal = formVal ?? baseVal;
              return (
                <div key={se.id} className="text-center bg-gray-900 border border-gray-800 rounded-lg p-1.5">
                  <div className="text-[10px] uppercase text-gray-500 mb-0.5">{se.name}</div>
                  <input
                    type="number"
                    className={`w-14 mx-auto text-center text-sm font-bold bg-transparent border-b border-gray-700 focus:border-blue-500 focus:outline-none ${displayVal >= 100 ? "text-green-400" : displayVal > 0 ? "text-yellow-400" : "text-white"}`}
                    value={displayVal}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const newRes = { ...char.statusResistance, [se.id]: val };
                      updateCharacter({ ...char, statusResistance: newRes });
                    }}
                  />
                  <div className="text-[8px] text-gray-600">avoidance %</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Forms */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Forms</h2>
        <div className="flex gap-1.5 flex-wrap items-center">
          {charForms.map((f) => (
            <div key={f.id} className="flex items-center gap-1">
              <button
                onClick={() => setActiveFormId(f.id)}
                className={`text-xs px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${
                  currentFormId === f.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {(f.photoUrl || char.photoUrl) && (
                  <img
                    src={f.photoUrl || char.photoUrl}
                    alt={f.name}
                    className="w-4 h-4 rounded-full object-cover"
                  />
                )}
                {f.name}
                {f.typeOverride && f.typeOverride !== char.type && (
                  <span className="text-[9px] opacity-70">({f.typeOverride})</span>
                )}
              </button>
              <button
                onClick={() => {
                  setEditingFormId(editingFormId === f.id ? null : f.id);
                  setEditFormName(f.name);
                  setEditFormPhoto(f.photoUrl ?? null);
                  setEditFormType(f.typeOverride ?? null);
                  setEditFormEnergy(f.energyOverride ?? null);
                  setEditFormStats(f.statOverrides ?? null);
                  setEditFormElemRes(f.elementalResOverride ?? null);
                  setEditFormElemDmg(f.elementalDmgOverride ?? null);
                  setEditFormSummary(f.summary ?? "");
                  setEditFormStartable(f.startable !== false);
                }}
                className="text-[10px] text-gray-600 hover:text-gray-400"
                title="Edit form"
              >
                &#9998;
              </button>
              {charForms.length > 1 && (
                <button
                  onClick={() => { if (confirm(`Delete form "${f.name}"?`)) deleteForm(f.id); }}
                  className="text-[10px] text-gray-600 hover:text-red-400"
                  title="Delete"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <input
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs w-24 focus:outline-none focus:border-gray-500"
              value={newFormName}
              onChange={(e) => setNewFormName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddForm()}
              placeholder="New form..."
            />
            <button
              onClick={handleAddForm}
              className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              +
            </button>
          </div>
        </div>

        {/* Form edit panel */}
        {editingFormId && (() => {
          const ef = charForms.find((f) => f.id === editingFormId);
          if (!ef) return null;
          const handleSaveForm = () => {
            if (!editFormName.trim()) return;
            updateForm(ef.id, {
              name: editFormName.trim(),
              photoUrl: editFormPhoto,
              typeOverride: editFormType,
              energyOverride: editFormEnergy,
              statOverrides: editFormStats,
              elementalResOverride: editFormElemRes,
              elementalDmgOverride: editFormElemDmg,
              startable: editFormStartable,
              summary: editFormSummary || null,
            });
            setEditingFormId(null);
          };
          const addFormEnergy = (color: EnergyColor) => {
            const current = editFormEnergy ?? [...char.energyGeneration];
            const existing = current.find((e) => e.color === color);
            if (existing) {
              setEditFormEnergy(current.map((e) => e.color === color ? { ...e, amount: e.amount + 1 } : e));
            } else {
              setEditFormEnergy([...current, { color, amount: 1 }]);
            }
          };
          const removeFormEnergy = (color: EnergyColor) => {
            const current = editFormEnergy ?? [...char.energyGeneration];
            setEditFormEnergy(
              current.map((e) => e.color === color ? { ...e, amount: e.amount - 1 } : e).filter((e) => e.amount > 0)
            );
          };
          const handleFormPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploadingFormPhoto(true);
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const { url } = await res.json();
            setEditFormPhoto(url);
            setUploadingFormPhoto(false);
          };
          return (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase">
                  Edit: {ef.name}
                </span>
                <button onClick={() => setEditingFormId(null)} className="text-[10px] text-gray-500 hover:text-gray-300">
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Name</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-gray-500"
                    value={editFormName}
                    onChange={(e) => setEditFormName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveForm()}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Type Override <span className="text-gray-600">(default: {char.type})</span>
                  </label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-gray-500"
                    value={editFormType ?? ""}
                    onChange={(e) => setEditFormType(e.target.value || null)}
                  >
                    <option value="">Use default ({char.type})</option>
                    {CHARACTER_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Form Image</label>
                <div className="flex items-center gap-3">
                  {editFormPhoto ? (
                    <img src={editFormPhoto} alt="Form" className="w-12 h-12 rounded-lg object-cover border border-gray-700" />
                  ) : char.photoUrl ? (
                    <img src={char.photoUrl} alt="Default" className="w-12 h-12 rounded-lg object-cover border border-gray-700 opacity-50" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600 text-[10px]">
                      None
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] rounded cursor-pointer text-center">
                      {uploadingFormPhoto ? "Uploading..." : "Upload"}
                      <input type="file" accept="image/*" className="hidden" onChange={handleFormPhotoUpload} disabled={uploadingFormPhoto} />
                    </label>
                    {editFormPhoto && (
                      <button onClick={() => setEditFormPhoto(null)} className="px-2 py-1 bg-red-900/50 hover:bg-red-900 text-red-300 text-[10px] rounded">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {/* Energy Override */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Energy Generation
                  {editFormEnergy && (
                    <button
                      onClick={() => setEditFormEnergy(null)}
                      className="ml-2 text-[10px] text-gray-600 hover:text-gray-400 underline"
                    >
                      Reset to default
                    </button>
                  )}
                </label>
                <div className="flex gap-0.5 items-center mb-1.5">
                  {(editFormEnergy ?? char.energyGeneration).map((eg) =>
                    Array.from({ length: eg.amount }).map((_, j) => (
                      <span
                        key={`${eg.color}-${j}`}
                        className="w-4 h-4 rounded-full inline-block"
                        style={{ backgroundColor: ENERGY_HEX[eg.color] }}
                      />
                    ))
                  )}
                  {!editFormEnergy && (
                    <span className="text-[10px] text-gray-600 ml-1">(default)</span>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {ENERGY_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => addFormEnergy(color)}
                      className="px-2 py-0.5 rounded text-[10px] text-white capitalize hover:opacity-80"
                      style={{ backgroundColor: ENERGY_HEX[color] }}
                    >
                      +{color}
                    </button>
                  ))}
                  {(editFormEnergy ?? char.energyGeneration).map((e) => (
                    <button
                      key={`rm-${e.color}`}
                      onClick={() => removeFormEnergy(e.color)}
                      className="px-2 py-0.5 rounded text-[10px] text-white capitalize opacity-60 hover:opacity-100"
                      style={{ backgroundColor: ENERGY_HEX[e.color] }}
                    >
                      -{e.color}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stat Overrides */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Stat Overrides <span className="text-gray-600">(HP always stays base)</span>
                  {editFormStats && (
                    <button
                      onClick={() => setEditFormStats(null)}
                      className="ml-2 text-[10px] text-gray-600 hover:text-gray-400 underline"
                    >
                      Reset to default
                    </button>
                  )}
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {(["atk", "mAtk", "def", "spi", "spd"] as const).map((key) => {
                    const baseVal = char.stats[key];
                    const overrideVal = editFormStats?.[key];
                    const displayVal = overrideVal ?? baseVal;
                    const isOverridden = overrideVal !== undefined && overrideVal !== baseVal;
                    return (
                      <div key={key}>
                        <label className="block text-[10px] text-gray-500 uppercase">{key}</label>
                        <input
                          type="number"
                          className={`w-full bg-gray-800 border rounded px-2 py-1 text-sm focus:outline-none focus:border-gray-500 ${
                            isOverridden ? "border-blue-500/50 text-blue-300" : "border-gray-700 text-white"
                          }`}
                          value={displayVal}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const current = editFormStats ?? {};
                            if (val === baseVal) {
                              const { [key]: _, ...rest } = current;
                              setEditFormStats(Object.keys(rest).length > 0 ? rest : null);
                            } else {
                              setEditFormStats({ ...current, [key]: val });
                            }
                          }}
                        />
                        {isOverridden && (
                          <span className="text-[9px] text-gray-600">base: {baseVal}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Elemental Resistance Override */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Elemental Resistance Override
                  {editFormElemRes && (
                    <button onClick={() => setEditFormElemRes(null)} className="ml-2 text-[10px] text-gray-600 hover:text-gray-400 underline">Reset</button>
                  )}
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {ELEMENTS.map((elem) => {
                    const baseVal = char.elementalResistance[elem];
                    const val = editFormElemRes?.[elem] ?? baseVal;
                    const isOverridden = editFormElemRes?.[elem] !== undefined && editFormElemRes[elem] !== baseVal;
                    return (
                      <div key={elem} className="text-center">
                        <label className="block text-[9px] text-gray-600">{ELEMENT_ICONS[elem]}</label>
                        <input
                          type="number"
                          className={`w-full bg-gray-800 border rounded px-1 py-0.5 text-[11px] text-center focus:outline-none focus:border-gray-500 ${
                            isOverridden ? "border-blue-500/50 text-blue-300" : "border-gray-700 text-white"
                          }`}
                          value={val}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            const current = editFormElemRes ?? {};
                            if (v === baseVal) {
                              const { [elem]: _, ...rest } = current;
                              setEditFormElemRes(Object.keys(rest).length > 0 ? rest : null);
                            } else {
                              setEditFormElemRes({ ...current, [elem]: v });
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Elemental Damage Override */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Elemental Damage Override
                  {editFormElemDmg && (
                    <button onClick={() => setEditFormElemDmg(null)} className="ml-2 text-[10px] text-gray-600 hover:text-gray-400 underline">Reset</button>
                  )}
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {ELEMENTS.map((elem) => {
                    const baseVal = char.elementalDamage[elem];
                    const val = editFormElemDmg?.[elem] ?? baseVal;
                    const isOverridden = editFormElemDmg?.[elem] !== undefined && editFormElemDmg[elem] !== baseVal;
                    return (
                      <div key={elem} className="text-center">
                        <label className="block text-[9px] text-gray-600">{ELEMENT_ICONS[elem]}</label>
                        <input
                          type="number"
                          className={`w-full bg-gray-800 border rounded px-1 py-0.5 text-[11px] text-center focus:outline-none focus:border-gray-500 ${
                            isOverridden ? "border-blue-500/50 text-blue-300" : "border-gray-700 text-white"
                          }`}
                          value={val}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            const current = editFormElemDmg ?? {};
                            if (v === baseVal) {
                              const { [elem]: _, ...rest } = current;
                              setEditFormElemDmg(Object.keys(rest).length > 0 ? rest : null);
                            } else {
                              setEditFormElemDmg({ ...current, [elem]: v });
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editFormStartable}
                  onChange={(e) => setEditFormStartable(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Startable (can be selected as starting form in battle staging)
              </label>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Summary <span className="text-gray-600">(optional — shown on hover in skill tooltips)</span></label>
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-gray-500 min-h-[50px]"
                  value={editFormSummary}
                  onChange={(e) => setEditFormSummary(e.target.value)}
                  placeholder="e.g. Increases stats and transforms base skills."
                />
              </div>

              <button
                onClick={handleSaveForm}
                className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                Save Form
              </button>
            </div>
          );
        })()}
      </section>

      {/* Skills */}
      <section className="space-y-6">
        {renderSkillSection("innate", "Innate", innateSkills)}
        {renderSkillSection("basic", "Basic", basicSkills)}
        {renderSkillSection("ability", "Ability", abilitySkills)}
        {renderSkillSection("conditional", "Conditional", conditionalSkills)}
        {!isBaseForm && (
          <p className="text-[10px] text-gray-500 italic">
            Showing skills for {charForms.find((f) => f.id === currentFormId)?.name ?? "this form"}.
          </p>
        )}
      </section>
    </div>
  );
}
