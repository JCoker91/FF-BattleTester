"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "@/lib/store";
import { StatusEffect, EffectTag, EffectTagType, ParamDef } from "@/lib/types";

function SortableSeriesItem({
  id,
  name,
  onEdit,
  onDelete,
}: {
  id: string;
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 bg-gray-900 border border-gray-800 rounded px-3 py-2 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-500 hover:text-gray-300 px-1"
        title="Drag to reorder"
      >
        ⠿
      </button>
      <span className="flex-1 text-sm text-white">{name}</span>
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
  );
}

function TagsEditor({
  tags,
  onChange,
}: {
  tags: EffectTag[];
  onChange: (tags: EffectTag[]) => void;
}) {
  const { effectTagTypes } = useStore();
  const [adding, setAdding] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState("");
  const [params, setParams] = useState<Record<string, unknown>>({});

  const isEditing = editIdx !== null;
  const showForm = adding || isEditing;
  const tagType = effectTagTypes.find((t) => t.name === selectedType);

  const startEdit = (i: number) => {
    const tag = tags[i];
    setEditIdx(i);
    setAdding(false);
    setSelectedType(tag.type);
    setParams({ ...tag.params });
  };

  const resetForm = () => {
    setAdding(false);
    setEditIdx(null);
    setSelectedType("");
    setParams({});
  };

  const handleTypeChange = (name: string) => {
    setSelectedType(name);
    const tt = effectTagTypes.find((t) => t.name === name);
    if (tt) {
      const defaults: Record<string, unknown> = {};
      for (const [key, def] of Object.entries(tt.paramSchema)) {
        defaults[key] = def.default;
      }
      setParams(defaults);
    } else {
      setParams({});
    }
  };

  const handleSave = () => {
    if (!selectedType) return;
    const tag: EffectTag = { type: selectedType, params };
    if (isEditing && editIdx !== null) {
      onChange(tags.map((t, i) => (i === editIdx ? tag : t)));
    } else {
      onChange([...tags, tag]);
    }
    resetForm();
  };

  const describeTag = (tag: EffectTag) => {
    const tt = effectTagTypes.find((t) => t.name === tag.type);
    if (!tt) return tag.type;
    const paramParts = Object.entries(tag.params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        const schema = tt.paramSchema[k];
        if (!schema) return `${k}: ${v}`;
        if (Array.isArray(v)) return `${schema.label}: ${(v as string[]).join(", ")}`;
        return `${schema.label}: ${v}`;
      });
    return paramParts.length > 0 ? `${tt.label} (${paramParts.join(", ")})` : tt.label;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Effect Tags</span>
        {!showForm && (
          <button
            onClick={() => { setAdding(true); setEditIdx(null); setSelectedType(""); setParams({}); }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 hover:bg-gray-700 text-gray-400"
          >
            + Add Tag
          </button>
        )}
      </div>
      {tags.length > 0 && (
        <div className="space-y-1">
          {tags.map((tag, i) => (
            editIdx === i ? null : (
              <div key={i} className="flex items-center gap-2 text-[11px] bg-gray-900/70 rounded px-2 py-1">
                <span className="text-yellow-400 flex-1">{describeTag(tag)}</span>
                <button onClick={() => startEdit(i)} className="text-gray-600 hover:text-blue-400 text-[10px]">edit</button>
                <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 text-[10px]">x</button>
              </div>
            )
          ))}
        </div>
      )}
      {showForm && (
        <div className="bg-gray-900 rounded p-2.5 space-y-2 border border-gray-700">
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none"
            value={selectedType}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            <option value="">Select effect tag...</option>
            {effectTagTypes.map((tt) => (
              <option key={tt.name} value={tt.name}>{tt.label}</option>
            ))}
          </select>
          {tagType && (
            <>
              <p className="text-[11px] text-gray-500 italic">{tagType.description}</p>
              {Object.keys(tagType.paramSchema).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(tagType.paramSchema).map(([key, def]) => (
                    <ParamInput
                      key={key}
                      paramKey={key}
                      def={def}
                      value={params[key]}
                      onChange={(v) => setParams({ ...params, [key]: v })}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={handleSave}
              disabled={!selectedType}
              className="text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {isEditing ? "Save" : "Add"}
            </button>
            <button onClick={resetForm} className="text-[10px] px-2 py-1 rounded bg-gray-700 text-gray-300">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamInput({ paramKey, def, value, onChange }: { paramKey: string; def: ParamDef; value: unknown; onChange: (v: unknown) => void }) {
  if (def.type === "number") {
    return (
      <label className="flex items-center gap-1 text-xs text-gray-400">
        {def.label}:
        <input
          type="number"
          className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
          value={(value as number) ?? def.default ?? 0}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        />
      </label>
    );
  }
  if (def.type === "enum" && def.options) {
    return (
      <label className="flex items-center gap-1 text-xs text-gray-400">
        {def.label}:
        <select
          className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
          value={(value as string) ?? def.default ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {def.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  }
  if (def.type === "string[]" && def.options) {
    const selected = (value as string[]) ?? (def.default as string[]) ?? [];
    return (
      <div className="text-xs text-gray-400">
        <span className="mr-1">{def.label}:</span>
        <div className="flex gap-1 flex-wrap mt-0.5">
          {def.options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                const next = selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o];
                onChange(next);
              }}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                selected.includes(o) ? "bg-blue-600/30 border-blue-500 text-blue-300" : "bg-gray-800 border-gray-700 text-gray-500"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

export default function ConfigPage() {
  const {
    seriesList,
    addSeries,
    updateSeries,
    deleteSeries,
    reorderSeries,
    glossary,
    addGlossary,
    updateGlossary,
    deleteGlossary,
    statusEffects,
    addStatusEffect,
    updateStatusEffect,
    deleteStatusEffect,
  } = useStore();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  // Glossary state
  const [newKeyword, setNewKeyword] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingGlossaryId, setEditingGlossaryId] = useState<string | null>(null);
  const [editGKeyword, setEditGKeyword] = useState("");
  const [editGLabel, setEditGLabel] = useState("");
  const [editGDesc, setEditGDesc] = useState("");
  // Status Effects state
  const [addingSE, setAddingSE] = useState(false);
  const [seCategory, setSECategory] = useState<"buff" | "debuff" | "status">("buff");
  const [editingSEId, setEditingSEId] = useState<string | null>(null);
  const [seForm, setSEForm] = useState<Omit<StatusEffect, "id">>({
    name: "", category: "buff", stats: ["none"],
  });

  const STAT_OPTIONS = [
    { value: "none", label: "None (status only)" },
    { value: "all", label: "All Stats" },
    { value: "atk", label: "ATK" },
    { value: "def", label: "DEF" },
    { value: "mAtk", label: "MATK" },
    { value: "spi", label: "SPI" },
    { value: "spd", label: "SPD" },
    { value: "eleRes.fire", label: "Fire Res" },
    { value: "eleRes.ice", label: "Ice Res" },
    { value: "eleRes.thunder", label: "Thunder Res" },
    { value: "eleRes.wind", label: "Wind Res" },
    { value: "eleRes.earth", label: "Earth Res" },
    { value: "eleRes.dark", label: "Dark Res" },
    { value: "eleRes.light", label: "Light Res" },
    { value: "eleDmg.fire", label: "Fire Dmg" },
    { value: "eleDmg.ice", label: "Ice Dmg" },
    { value: "eleDmg.thunder", label: "Thunder Dmg" },
    { value: "eleDmg.wind", label: "Wind Dmg" },
    { value: "eleDmg.earth", label: "Earth Dmg" },
    { value: "eleDmg.dark", label: "Dark Dmg" },
    { value: "eleDmg.light", label: "Light Dmg" },
    { value: "dmgCatRes.physical", label: "Physical Res" },
    { value: "dmgCatRes.magical", label: "Magical Res" },
  ];

  const [tab, setTab] = useState<"series" | "glossary" | "status-effects">("series");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await addSeries(name);
    setNewName("");
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    await updateSeries(editingId, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = seriesList.findIndex((s) => s.id === active.id);
    const newIndex = seriesList.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(seriesList, oldIndex, newIndex);
    reorderSeries(reordered.map((s) => s.id));
  };

  const TABS = [
    { key: "series" as const, label: "Series" },
    { key: "glossary" as const, label: "Glossary" },
    { key: "status-effects" as const, label: "Status Effects" },
  ];

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Config</h1>

      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "series" && <section className="space-y-3">

        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="e.g. FF7"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium"
          >
            Add
          </button>
        </div>

        {seriesList.length === 0 && (
          <p className="text-gray-500 text-sm">
            No series defined yet. Add one above.
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={seriesList.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {seriesList.map((s) =>
                editingId === s.id ? (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded px-3 py-2"
                  >
                    <span className="px-1 text-gray-600">⠿</span>
                    <input
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-gray-500"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                      autoFocus
                    />
                    <button
                      onClick={handleUpdate}
                      className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <SortableSeriesItem
                    key={s.id}
                    id={s.id}
                    name={s.name}
                    onEdit={() => startEdit(s.id, s.name)}
                    onDelete={() => {
                      if (confirm(`Delete "${s.name}"?`)) deleteSeries(s.id);
                    }}
                  />
                )
              )}
            </div>
          </SortableContext>
        </DndContext>
      </section>}

      {tab === "glossary" && <section className="space-y-3">
        <p className="text-xs text-gray-500">
          Define keywords that can be referenced as tooltips anywhere. Use <code className="text-gray-400">{"[[keyword]]"}</code> in skill descriptions to create inline tooltips.
        </p>

        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="keyword"
            />
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Display Label"
            />
            <input
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Tooltip description"
            />
          </div>
          <button
            onClick={async () => {
              if (!newKeyword.trim() || !newLabel.trim() || !newDesc.trim()) return;
              await addGlossary({ keyword: newKeyword.trim().toLowerCase(), label: newLabel.trim(), description: newDesc.trim() });
              setNewKeyword(""); setNewLabel(""); setNewDesc("");
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium"
          >
            Add Entry
          </button>
        </div>

        {glossary.length === 0 && (
          <p className="text-gray-500 text-sm">No glossary entries yet.</p>
        )}

        <div className="space-y-1">
          {glossary.map((g) =>
            editingGlossaryId === g.id ? (
              <div key={g.id} className="bg-gray-900 border border-gray-800 rounded p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-gray-500"
                    value={editGKeyword}
                    onChange={(e) => setEditGKeyword(e.target.value)}
                  />
                  <input
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-gray-500"
                    value={editGLabel}
                    onChange={(e) => setEditGLabel(e.target.value)}
                  />
                  <input
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-gray-500"
                    value={editGDesc}
                    onChange={(e) => setEditGDesc(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (editGKeyword.trim() && editGLabel.trim() && editGDesc.trim()) {
                        updateGlossary({ id: g.id, keyword: editGKeyword.trim().toLowerCase(), label: editGLabel.trim(), description: editGDesc.trim() });
                      }
                      setEditingGlossaryId(null);
                    }}
                    className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingGlossaryId(null)} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={g.id} className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded px-3 py-2">
                <code className="text-xs text-blue-400 bg-gray-800 px-1.5 py-0.5 rounded">{g.keyword}</code>
                <span className="text-sm text-white font-medium">{g.label}</span>
                <span className="text-xs text-gray-500 flex-1 truncate">{g.description}</span>
                <button
                  onClick={() => { setEditingGlossaryId(g.id); setEditGKeyword(g.keyword); setEditGLabel(g.label); setEditGDesc(g.description); }}
                  className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
                >
                  Edit
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${g.label}"?`)) deleteGlossary(g.id); }}
                  className="text-xs px-2 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-300"
                >
                  Delete
                </button>
              </div>
            )
          )}
        </div>
      </section>}

      {tab === "status-effects" && <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(["buff", "debuff", "status"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSECategory(cat)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  seCategory === cat
                    ? cat === "buff" ? "bg-green-900/50 text-green-400" : cat === "status" ? "bg-yellow-900/50 text-yellow-400" : "bg-red-900/50 text-red-400"
                    : "bg-gray-800 text-gray-500 hover:text-gray-300"
                }`}
              >
                {cat === "buff" ? "Buffs" : cat === "debuff" ? "Debuffs" : "Statuses"}
                <span className="ml-1 text-[10px] opacity-70">({statusEffects.filter((se) => se.category === cat).length})</span>
              </button>
            ))}
          </div>
          {!addingSE && (
            <button
              onClick={() => { setAddingSE(true); setSEForm({ name: "", category: seCategory, stats: ["none"] }); }}
              className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
            >
              + Add
            </button>
          )}
        </div>

        {(addingSE || editingSEId) && (() => {
          const isEditing = !!editingSEId;
          return (
            <div className="bg-gray-800 rounded p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Name</label>
                  <input
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none"
                    value={seForm.name}
                    onChange={(e) => setSEForm({ ...seForm, name: e.target.value })}
                    placeholder="e.g. Limit, ATK+, Poison"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Category</label>
                  <select
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none"
                    value={seForm.category}
                    onChange={(e) => setSEForm({ ...seForm, category: e.target.value as "buff" | "debuff" })}
                  >
                    <option value="buff">Buff</option>
                    <option value="debuff">Debuff</option>
                    <option value="status">Status</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Stats Affected</label>
                <div className="flex flex-wrap gap-1.5">
                  {STAT_OPTIONS.map((o) => {
                    const isSelected = seForm.stats.includes(o.value);
                    const isNone = o.value === "none";
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          if (isNone) {
                            setSEForm({ ...seForm, stats: ["none"] });
                          } else {
                            const without = seForm.stats.filter((s) => s !== "none" && s !== o.value);
                            const next = isSelected ? without : [...without, o.value];
                            setSEForm({ ...seForm, stats: next.length === 0 ? ["none"] : next });
                          }
                        }}
                        className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                          isSelected
                            ? "bg-blue-600/30 border-blue-500 text-blue-300"
                            : "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Default Modifier %</label>
                  <input
                    type="number"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none"
                    value={seForm.defaultModifier ?? ""}
                    onChange={(e) => setSEForm({ ...seForm, defaultModifier: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seForm.stackable ?? false}
                    onChange={(e) => setSEForm({ ...seForm, stackable: e.target.checked || undefined })}
                    className="w-3.5 h-3.5"
                  />
                  Stackable
                </label>
                {seForm.stackable && (
                  <label className="flex items-center gap-1.5 text-gray-400">
                    Max stacks:
                    <input
                      type="number"
                      className="w-12 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-sm focus:outline-none"
                      value={seForm.maxStacks ?? ""}
                      onChange={(e) => setSEForm({ ...seForm, maxStacks: e.target.value ? parseInt(e.target.value) : undefined })}
                      min={2}
                    />
                  </label>
                )}
                {seForm.stackable && seForm.maxStacks && (
                  <label className="flex items-center gap-1.5 text-gray-400">
                    On max grants:
                    <select
                      className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-sm focus:outline-none"
                      value={seForm.onMaxStacks ?? ""}
                      onChange={(e) => setSEForm({ ...seForm, onMaxStacks: e.target.value || undefined })}
                    >
                      <option value="">None</option>
                      {statusEffects.filter((se) => se.id !== editingSEId).map((se) => (
                        <option key={se.id} value={se.id}>{se.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {(seForm.category === "debuff" || seForm.category === "status") && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={seForm.resistable ?? false}
                      onChange={(e) => setSEForm({ ...seForm, resistable: e.target.checked || undefined })}
                      className="w-3.5 h-3.5"
                    />
                    Resistable (characters can have resistance)
                  </label>
                  {seForm.category === "status" && (
                    <TagsEditor
                      tags={seForm.tags ?? []}
                      onChange={(newTags) => setSEForm({ ...seForm, tags: newTags.length > 0 ? newTags : undefined })}
                    />
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!seForm.name.trim()) return;
                    if (isEditing && editingSEId) {
                      await updateStatusEffect({ ...seForm, id: editingSEId } as StatusEffect);
                      setEditingSEId(null);
                    } else {
                      await addStatusEffect(seForm);
                      setAddingSE(false);
                    }
                    setSEForm({ name: "", category: "buff", stats: ["none"] });
                  }}
                  disabled={!seForm.name.trim()}
                  className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                >
                  {isEditing ? "Update" : "Create"}
                </button>
                <button
                  onClick={() => { setAddingSE(false); setEditingSEId(null); setSEForm({ name: "", category: "buff", stats: ["none"] }); }}
                  className="text-sm px-3 py-1.5 rounded bg-gray-700 text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}

        <div className="space-y-2">
          {statusEffects.filter((se) => se.category === seCategory).length === 0 && !addingSE && (
            <p className="text-sm text-gray-500">No {seCategory === "buff" ? "buffs" : seCategory === "debuff" ? "debuffs" : "statuses"} defined yet.</p>
          )}
          {statusEffects.filter((se) => se.category === seCategory).map((se) => (
            <div key={se.id} className="flex items-center gap-3 bg-gray-800/50 rounded px-3 py-2">
              <span className="text-sm text-white font-medium">{se.name}</span>
              <span className="text-xs text-gray-500">
                {se.stats.map((s) => STAT_OPTIONS.find((o) => o.value === s)?.label ?? s).join(", ")}
              </span>
              {se.defaultModifier !== undefined && (
                <span className="text-xs text-gray-500">default: {se.defaultModifier > 0 ? "+" : ""}{se.defaultModifier}%</span>
              )}
              {se.stackable && <span className="text-[10px] text-purple-400">stackable x{se.maxStacks ?? "∞"}</span>}
              {se.resistable && <span className="text-[10px] text-amber-400">resistable</span>}
              {se.tags && se.tags.length > 0 && (
                <span className="text-[10px] text-yellow-400">
                  {se.tags.length} tag{se.tags.length > 1 ? "s" : ""}
                </span>
              )}
              {se.onMaxStacks && (
                <span className="text-[10px] text-cyan-400">
                  on max: {statusEffects.find((s) => s.id === se.onMaxStacks)?.name ?? se.onMaxStacks}
                </span>
              )}
              <div className="ml-auto flex gap-1">
                <button
                  onClick={() => { setEditingSEId(se.id); setSEForm(se); }}
                  className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
                >
                  Edit
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${se.name}"?`)) deleteStatusEffect(se.id); }}
                  className="text-xs px-2 py-1 rounded bg-red-900/50 hover:bg-red-900 text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>}
    </div>
  );
}
