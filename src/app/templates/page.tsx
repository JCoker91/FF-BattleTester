"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { SkillTemplate, Skill } from "@/lib/types";
import { EnergyCostDisplay } from "@/components/EnergyBadge";
import { GlossaryText } from "@/components/Tooltip";
import { DAMAGE_CATEGORY_LABELS, DAMAGE_TIER_LABELS, DamageTier } from "@/lib/damage-config";

export default function TemplatesPage() {
  const {
    templates,
    templateActions,
    skills,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    addTemplateAction,
    deleteTemplateAction,
    getTemplateActions,
  } = useStore();

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [copyFromId, setCopyFromId] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingSkillTo, setAddingSkillTo] = useState<string | null>(null);
  const [skillSearch, setSkillSearch] = useState("");

  // Skills that can be added to templates — unassigned skills (no characterId) or any skill
  const availableSkills = skills.filter((s) =>
    s.skillType !== "innate" && // innate doesn't make sense in templates
    (skillSearch === "" || s.name.toLowerCase().includes(skillSearch.toLowerCase()))
  );

  const handleAddTemplate = async () => {
    if (!newName.trim()) return;
    const t = await addTemplate({ name: newName.trim(), description: newDesc.trim() });
    if (copyFromId) {
      const sourceActions = getTemplateActions(copyFromId);
      for (const action of sourceActions) {
        await addTemplateAction(t.id, action.skillId);
      }
    }
    setNewName("");
    setNewDesc("");
    setCopyFromId("");
    setExpandedId(t.id);
  };

  const getSkillForAction = (skillId: string): Skill | undefined => {
    return skills.find((s) => s.id === skillId);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Skill Templates</h1>
      <p className="text-xs text-gray-500">
        Create reusable skill packages by linking existing skills. Edit the skill once on the Skills page — all templates referencing it update automatically.
      </p>

      {/* Add template */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTemplate()}
            placeholder="Template name (e.g. White Magic Lv2)"
          />
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTemplate()}
            placeholder="Description"
          />
          <button
            onClick={handleAddTemplate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium shrink-0"
          >
            + Add
          </button>
        </div>
        {templates.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Copy from:</span>
            <select
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-gray-500"
              value={copyFromId}
              onChange={(e) => setCopyFromId(e.target.value)}
            >
              <option value="">Start empty</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({getTemplateActions(t.id).length} skills)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {templates.length === 0 && (
        <p className="text-gray-500 text-sm">No templates yet.</p>
      )}

      {/* Template list */}
      <div className="space-y-3">
        {templates.map((tmpl) => {
          const actions = getTemplateActions(tmpl.id);
          const isExpanded = expandedId === tmpl.id;

          return (
            <div key={tmpl.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              {editingTemplateId === tmpl.id ? (
                <div className="space-y-2">
                  <input className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <input className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" />
                  <div className="flex gap-2">
                    <button onClick={() => { if (editName.trim()) updateTemplate({ ...tmpl, name: editName.trim(), description: editDesc.trim() }); setEditingTemplateId(null); }} className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white">Save</button>
                    <button onClick={() => setEditingTemplateId(null)} className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <button className="text-left flex-1 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : tmpl.id)}>
                    <span className="font-semibold text-white">{tmpl.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{actions.length} skill{actions.length !== 1 && "s"}</span>
                    {tmpl.description && <p className="text-xs text-gray-500 mt-0.5">{tmpl.description}</p>}
                  </button>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setEditingTemplateId(tmpl.id); setEditName(tmpl.name); setEditDesc(tmpl.description); }} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">Edit</button>
                    <button onClick={() => { if (confirm(`Delete "${tmpl.name}"?`)) deleteTemplate(tmpl.id); }} className="text-xs px-2 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-300">Delete</button>
                  </div>
                </div>
              )}

              {/* Expanded: show linked skills */}
              <div className="grid transition-[grid-template-rows] duration-200 ease-in-out" style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}>
                <div className="overflow-hidden">
                  <div className="space-y-2 pt-2 border-t border-gray-800">
                    {actions.map((action) => {
                      const skill = getSkillForAction(action.skillId);
                      if (!skill) return (
                        <div key={action.id} className="flex items-center justify-between bg-gray-800/50 rounded p-2">
                          <span className="text-xs text-red-400">Missing skill (deleted?)</span>
                          <button onClick={() => deleteTemplateAction(action.id)} className="text-[10px] px-2 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-300">Remove</button>
                        </div>
                      );
                      return (
                        <div key={action.id} className="flex items-center gap-2 bg-gray-800/50 rounded p-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{skill.name}</span>
                              {skill.levels[0].cost.length > 0 && <EnergyCostDisplay cost={skill.levels[0].cost} />}
                              {skill.levels[0].damageCategory && (
                                <span className="text-[9px] text-gray-500">
                                  {DAMAGE_CATEGORY_LABELS[skill.levels[0].damageCategory]} {skill.levels[0].damageTier ? DAMAGE_TIER_LABELS[skill.levels[0].damageTier as DamageTier] : ""}
                                </span>
                              )}
                            </div>
                            {skill.description && (
                              <p className="text-xs text-gray-400 mt-0.5"><GlossaryText text={skill.description} /></p>
                            )}
                          </div>
                          <button onClick={() => deleteTemplateAction(action.id)} className="text-[10px] px-2 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-300 shrink-0">Remove</button>
                        </div>
                      );
                    })}

                    {actions.length === 0 && addingSkillTo !== tmpl.id && (
                      <p className="text-xs text-gray-500">No skills linked yet.</p>
                    )}

                    {/* Add skill to template */}
                    {addingSkillTo === tmpl.id ? (
                      <div className="bg-gray-800 rounded p-2 space-y-2">
                        <input
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-gray-500"
                          value={skillSearch}
                          onChange={(e) => setSkillSearch(e.target.value)}
                          placeholder="Search skills..."
                          autoFocus
                        />
                        <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                          {availableSkills.length === 0 && (
                            <p className="text-xs text-gray-500">No matching skills. Create skills on the Skills page first.</p>
                          )}
                          {availableSkills.map((skill) => {
                            const alreadyAdded = actions.some((a) => a.skillId === skill.id);
                            return (
                              <button
                                key={skill.id}
                                disabled={alreadyAdded}
                                onClick={async () => {
                                  await addTemplateAction(tmpl.id, skill.id);
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                                  alreadyAdded
                                    ? "bg-gray-900/50 text-gray-600 cursor-not-allowed"
                                    : "bg-gray-900 hover:bg-gray-700 text-white"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{skill.name}</span>
                                  {alreadyAdded && <span className="text-[9px] text-gray-600">already added</span>}
                                  {skill.levels[0].cost.length > 0 && <EnergyCostDisplay cost={skill.levels[0].cost} />}
                                </div>
                                {skill.description && <p className="text-[10px] text-gray-500 truncate">{skill.description}</p>}
                              </button>
                            );
                          })}
                        </div>
                        <button onClick={() => { setAddingSkillTo(null); setSkillSearch(""); }} className="text-xs px-3 py-1 rounded bg-gray-700 text-gray-300">
                          Done
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingSkillTo(tmpl.id); setSkillSearch(""); }}
                        className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 w-full"
                      >
                        + Add Skill
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
