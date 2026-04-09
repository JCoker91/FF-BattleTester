"use client";

import { useState } from "react";
import {
  Skill,
  SkillLevel,
  SkillEffect,
  RandomEffectPool,
  ResistanceGrant,
  DispelAction,
  MovementAction,
  MovementType,
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TIMINGS,
  MOVEMENT_TIMING_LABELS,
  MovementTiming,
  EnergyStealAction,
  EnergyGenerateAction,
  SkillType,
  EnergyCost,
  ENERGY_COLORS,
  SKILL_TYPES,
  SKILL_TYPE_LABELS,
  ELEMENTS,
  ELEMENT_LABELS,
  ELEMENT_ICONS,
  Element,
  EnergyColor,
  SkillTemplate,
  TARGET_TYPES,
  TARGET_TYPE_LABELS,
  TargetType,
  StatusEffect,
  EFFECT_TRIGGERS,
  EFFECT_TRIGGER_LABELS,
  EffectTrigger,
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
  const [trigger, setTrigger] = useState<EffectTrigger>("on-use");
  const [triggerValue, setTriggerValue] = useState(50);
  const [once, setOnce] = useState(false);
  const [untilNextTurn, setUntilNextTurn] = useState(false);

  const isEditing = editIdx !== null;
  const showForm = adding || isEditing;
  const isHpTrigger = trigger === "on-hp-below" || trigger === "on-hp-above";

  const startEdit = (i: number) => {
    const e = effects[i];
    setEditIdx(i);
    setAdding(false);
    setEffectId(e.effectId);
    setTargetType(e.targetType);
    setModifier(e.modifier);
    setDuration(e.duration);
    setChance(e.chance ?? 100);
    setTrigger(e.trigger ?? "on-use");
    setTriggerValue(e.triggerValue ?? 50);
    setOnce(e.once ?? false);
    setUntilNextTurn(e.untilNextTurn ?? false);
  };

  const resetForm = () => {
    setAdding(false);
    setEditIdx(null);
    setEffectId("");
    setModifier(20);
    setDuration(2);
    setChance(100);
    setTrigger("on-use");
    setTriggerValue(50);
    setOnce(false);
    setUntilNextTurn(false);
  };

  const handleSave = () => {
    if (!effectId) return;
    const entry: SkillEffect = {
      effectId,
      targetType,
      modifier,
      duration,
      ...(chance < 100 ? { chance } : {}),
      ...(trigger !== "on-use" ? { trigger } : {}),
      ...(isHpTrigger ? { triggerValue } : {}),
      ...(once ? { once: true } : {}),
      ...(untilNextTurn ? { untilNextTurn: true } : {}),
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
                <span className="text-gray-600">{e.duration === -1 ? "Perm" : `${e.duration}t`}</span>
                <span className="text-gray-500 text-[10px]">{TARGET_TYPE_LABELS[e.targetType]}</span>
                {e.trigger && e.trigger !== "on-use" && (
                  <span className="text-sky-400 text-[10px]">
                    {EFFECT_TRIGGER_LABELS[e.trigger]}
                    {e.triggerValue !== undefined && ` ${e.triggerValue}%`}
                  </span>
                )}
                {e.chance !== undefined && e.chance < 100 && (
                  <span className="text-amber-400 text-[10px]">{e.chance}% chance</span>
                )}
                {e.once && <span className="text-pink-400 text-[10px]">1x</span>}
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
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as EffectTrigger)}
            >
              {EFFECT_TRIGGERS.map((t) => (
                <option key={t} value={t}>{EFFECT_TRIGGER_LABELS[t]}</option>
              ))}
            </select>
            {isHpTrigger && (
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                at
                <input
                  type="number"
                  className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(parseInt(e.target.value) || 0)}
                  min={1}
                  max={99}
                />
                % HP
              </label>
            )}
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
            {untilNextTurn ? (
              <span className="text-[10px] text-sky-400 italic">Until next turn</span>
            ) : (
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Dur
              {duration === -1 ? (
                <button
                  type="button"
                  onClick={() => setDuration(2)}
                  className="px-1.5 py-0.5 bg-gray-900 border border-gray-700 rounded text-[10px] text-purple-400 font-medium"
                >
                  Perm
                </button>
              ) : (
                <input
                  type="number"
                  className="w-8 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                  min={-1}
                />
              )}
              {duration !== -1 && <span>t</span>}
              <button
                type="button"
                onClick={() => setDuration(duration === -1 ? 2 : -1)}
                className={`px-1 py-0.5 rounded text-[9px] ${duration === -1 ? "text-purple-400" : "text-gray-600 hover:text-gray-400"}`}
                title="Toggle permanent"
              >
                ∞
              </button>
            </label>
            )}
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
          <div className="flex gap-1.5 items-center">
            <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={once}
                onChange={(e) => setOnce(e.target.checked)}
                className="w-3 h-3"
              />
              Once per battle
            </label>
            <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer" title="Skip ticking on the turn this was applied — buff survives until the caster's next turn even on instant skills">
              <input
                type="checkbox"
                checked={untilNextTurn}
                onChange={(e) => setUntilNextTurn(e.target.checked)}
                className="w-3 h-3"
              />
              Until next turn
            </label>
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

function RandomEffectPoolsEditor({
  pools,
  statusEffects,
  onChange,
  mode = "random",
}: {
  pools: RandomEffectPool[];
  statusEffects: StatusEffect[];
  onChange: (pools: RandomEffectPool[]) => void;
  mode?: "random" | "choose" | "cycle";
}) {
  const labelText =
    mode === "choose" ? "Choose Effect Pools" :
    mode === "cycle" ? "Cycle Effect Pools" :
    "Random Effect Pools";
  const accentClass =
    mode === "choose" ? "text-emerald-300" :
    mode === "cycle" ? "text-purple-300" :
    "text-cyan-300";
  return (
    <div className="border-t border-gray-800 pt-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] ${accentClass} font-medium uppercase`}>{labelText}</span>
        <button
          onClick={() => onChange([...pools, { pickCount: 1, effects: [] }])}
          className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
        >
          + Add Pool
        </button>
      </div>
      {pools.map((pool, pi) => (
        <div key={pi} className="bg-gray-900/40 border border-gray-800 rounded p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] ${accentClass}`}>Pool {pi + 1}: {mode === "choose" ? "choose" : mode === "cycle" ? "cycle (advances 1 each trigger)" : "pick"}</span>
            <input
              type="number"
              min={1}
              max={20}
              className="w-12 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none"
              value={pool.pickCount}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                onChange(pools.map((p, i) => (i === pi ? { ...p, pickCount: v } : p)));
              }}
            />
            <span className="text-[10px] text-gray-400">of {pool.effects.length} candidates</span>
            <button
              onClick={() => onChange(pools.filter((_, i) => i !== pi))}
              className="ml-auto text-[10px] text-gray-600 hover:text-red-400"
            >
              Remove pool
            </button>
          </div>
          <EffectsEditor
            effects={pool.effects}
            statusEffects={statusEffects}
            onChange={(newEffects) => onChange(pools.map((p, i) => (i === pi ? { ...p, effects: newEffects } : p)))}
          />
        </div>
      ))}
    </div>
  );
}

function MovementsEditor({
  movements,
  onChange,
}: {
  movements: MovementAction[];
  onChange: (movements: MovementAction[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [type, setType] = useState<MovementType>("push-back");
  const [targetType, setTargetType] = useState<TargetType>("front-row-enemy");
  const [trigger, setTrigger] = useState<EffectTrigger>("on-use");
  const [destinationSide, setDestinationSide] = useState<"ally" | "enemy">("ally");
  const [timing, setTiming] = useState<MovementTiming>("after-damage");

  const isEditing = editIdx !== null;
  const showForm = adding || isEditing;
  const isTeleport = type === "teleport-self";
  const isSelfImplicit = type === "teleport-self" || type === "recoil-self-one" || type === "switch-self-adjacent";

  const startEdit = (i: number) => {
    const m = movements[i];
    setEditIdx(i);
    setAdding(false);
    setType(m.type);
    setTargetType(m.targetType);
    setTrigger(m.trigger ?? "on-use");
    setDestinationSide(m.destinationSide ?? "ally");
    setTiming(m.timing ?? "after-damage");
  };

  const resetForm = () => {
    setAdding(false);
    setEditIdx(null);
    setType("push-back");
    setTargetType("front-row-enemy");
    setTrigger("on-use");
    setDestinationSide("ally");
    setTiming("after-damage");
  };

  const handleSave = () => {
    const entry: MovementAction = {
      type,
      targetType,
      ...(trigger !== "on-use" ? { trigger } : {}),
      ...(type === "teleport-self" ? { destinationSide } : {}),
      ...(timing !== "after-damage" ? { timing } : {}),
    };
    if (isEditing && editIdx !== null) {
      onChange(movements.map((m, i) => (i === editIdx ? entry : m)));
    } else {
      onChange([...movements, entry]);
    }
    resetForm();
  };

  const filteredTriggers = EFFECT_TRIGGERS.filter((t) => t === "on-use" || t === "on-attack-hit");

  return (
    <div className="border-t border-gray-800 pt-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-orange-400 font-medium uppercase">Movements</span>
        {!showForm && (
          <button
            onClick={() => { setAdding(true); setEditIdx(null); }}
            className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          >
            + Add Movement
          </button>
        )}
      </div>
      {movements.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {movements.map((m, i) => {
            if (editIdx === i) return null;
            return (
              <div key={i} className="flex items-center gap-1.5 text-[11px] bg-gray-800/50 rounded px-2 py-0.5">
                <span className="text-orange-400">{MOVEMENT_TYPE_LABELS[m.type]}</span>
                {m.type !== "teleport-self" && m.type !== "recoil-self-one" && m.type !== "switch-self-adjacent" && (
                  <span className="text-gray-500 text-[10px]">{TARGET_TYPE_LABELS[m.targetType]}</span>
                )}
                {m.type === "teleport-self" && (
                  <span className="text-gray-500 text-[10px]">{m.destinationSide ?? "ally"} side</span>
                )}
                {m.trigger && m.trigger !== "on-use" && (
                  <span className="text-sky-400 text-[10px]">{EFFECT_TRIGGER_LABELS[m.trigger]}</span>
                )}
                <span className="text-purple-400 text-[10px]">{MOVEMENT_TIMING_LABELS[m.timing ?? "after-damage"]}</span>
                <button onClick={() => startEdit(i)} className="ml-auto text-gray-600 hover:text-blue-400 text-[10px]">edit</button>
                <button onClick={() => onChange(movements.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 text-[10px]">x</button>
              </div>
            );
          })}
        </div>
      )}
      {showForm && (
        <div className="mt-1 bg-gray-800 rounded p-2 space-y-1.5">
          <div className="flex gap-1.5 flex-wrap items-center">
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Type:
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={type}
                onChange={(e) => setType(e.target.value as MovementType)}
              >
                {MOVEMENT_TYPES.map((mt) => (
                  <option key={mt} value={mt}>{MOVEMENT_TYPE_LABELS[mt]}</option>
                ))}
              </select>
            </label>
            {!isSelfImplicit && (
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                Target:
                <select
                  className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                >
                  {TARGET_TYPES.map((t) => (
                    <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </label>
            )}
            {isTeleport && (
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                Destination:
                <select
                  className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                  value={destinationSide}
                  onChange={(e) => setDestinationSide(e.target.value as "ally" | "enemy")}
                >
                  <option value="ally">Ally Side</option>
                  <option value="enemy">Enemy Side</option>
                </select>
              </label>
            )}
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Trigger:
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as EffectTrigger)}
              >
                {filteredTriggers.map((t) => (
                  <option key={t} value={t}>{EFFECT_TRIGGER_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Timing:
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={timing}
                onChange={(e) => setTiming(e.target.value as MovementTiming)}
              >
                {MOVEMENT_TIMINGS.map((t) => (
                  <option key={t} value={t}>{MOVEMENT_TIMING_LABELS[t]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleSave} className="text-[10px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white">
              {isEditing ? "Save" : "Add"}
            </button>
            <button onClick={resetForm} className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EnergyActionsEditor({
  steal,
  generate,
  onChangeSteal,
  onChangeGenerate,
}: {
  steal?: EnergyStealAction;
  generate?: EnergyGenerateAction;
  onChangeSteal: (s: EnergyStealAction | undefined) => void;
  onChangeGenerate: (g: EnergyGenerateAction | undefined) => void;
}) {
  return (
    <div className="border-t border-gray-800 pt-2 space-y-1.5">
      <span className="text-[10px] text-pink-400 font-medium uppercase">Energy Actions</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <label className="flex items-center gap-1 text-[10px] text-gray-400">
          <input
            type="checkbox"
            checked={!!steal}
            onChange={(e) => onChangeSteal(e.target.checked ? { count: 1, mode: "random" } : undefined)}
            className="w-3 h-3"
          />
          Steal
        </label>
        {steal && (
          <>
            <input
              type="number"
              min={1}
              max={10}
              className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
              value={steal.count}
              onChange={(e) => onChangeSteal({ ...steal, count: Math.max(1, parseInt(e.target.value) || 1) })}
            />
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
              value={steal.mode}
              onChange={(e) => onChangeSteal({ ...steal, mode: e.target.value as "random" | "choose" })}
            >
              <option value="random">Random</option>
              <option value="choose">Choose</option>
            </select>
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
              value={steal.trigger ?? "on-use"}
              onChange={(e) => onChangeSteal({ ...steal, trigger: e.target.value === "on-use" ? undefined : "on-attack-hit" })}
            >
              <option value="on-use">On Use</option>
              <option value="on-attack-hit">On Hit</option>
            </select>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <label className="flex items-center gap-1 text-[10px] text-gray-400">
          <input
            type="checkbox"
            checked={!!generate}
            onChange={(e) => onChangeGenerate(e.target.checked ? { count: 1, mode: "random" } : undefined)}
            className="w-3 h-3"
          />
          Generate
        </label>
        {generate && (
          <>
            <input
              type="number"
              min={1}
              max={10}
              className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
              value={generate.count}
              onChange={(e) => onChangeGenerate({ ...generate, count: Math.max(1, parseInt(e.target.value) || 1) })}
            />
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
              value={generate.mode}
              onChange={(e) => {
                const mode = e.target.value as "random" | "choose" | "specific";
                onChangeGenerate({ ...generate, mode, color: mode === "specific" ? (generate.color ?? "red") : undefined });
              }}
            >
              <option value="random">Random</option>
              <option value="choose">Choose</option>
              <option value="specific">Specific</option>
            </select>
            {generate.mode === "specific" && (
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
                value={generate.color ?? "red"}
                onChange={(e) => onChangeGenerate({ ...generate, color: e.target.value as EnergyColor })}
              >
                {ENERGY_COLORS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
              value={generate.trigger ?? "on-use"}
              onChange={(e) => onChangeGenerate({ ...generate, trigger: e.target.value === "on-use" ? undefined : "on-attack-hit" })}
            >
              <option value="on-use">On Use</option>
              <option value="on-attack-hit">On Hit</option>
            </select>
          </>
        )}
      </div>
    </div>
  );
}

function DispelsEditor({
  dispels,
  onChange,
}: {
  dispels: DispelAction[];
  onChange: (dispels: DispelAction[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [category, setCategory] = useState<"buff" | "debuff" | "any">("buff");
  const [countMode, setCountMode] = useState<"all" | "number">("all");
  const [count, setCount] = useState(1);
  const [targetType, setTargetType] = useState<TargetType>("target-enemy");

  const isEditing = editIdx !== null;
  const showForm = adding || isEditing;

  const startEdit = (i: number) => {
    const d = dispels[i];
    setEditIdx(i);
    setAdding(false);
    setCategory(d.category);
    if (d.count === -1) {
      setCountMode("all");
      setCount(1);
    } else {
      setCountMode("number");
      setCount(d.count);
    }
    setTargetType(d.targetType);
  };

  const resetForm = () => {
    setAdding(false);
    setEditIdx(null);
    setCategory("buff");
    setCountMode("all");
    setCount(1);
    setTargetType("target-enemy");
  };

  const handleSave = () => {
    const entry: DispelAction = {
      category,
      count: countMode === "all" ? -1 : count,
      targetType,
    };
    if (isEditing && editIdx !== null) {
      onChange(dispels.map((d, i) => (i === editIdx ? entry : d)));
    } else {
      onChange([...dispels, entry]);
    }
    resetForm();
  };

  return (
    <div className="border-t border-gray-800 pt-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-cyan-400 font-medium uppercase">Dispels</span>
        {!showForm && (
          <button
            onClick={() => { setAdding(true); setEditIdx(null); }}
            className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          >
            + Add Dispel
          </button>
        )}
      </div>
      {dispels.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {dispels.map((d, i) => {
            if (editIdx === i) return null;
            const countLabel = d.count === -1 ? "All" : `${d.count}`;
            return (
              <div key={i} className="flex items-center gap-1.5 text-[11px] bg-gray-800/50 rounded px-2 py-0.5">
                <span className="text-cyan-400">Remove {countLabel} {d.category}{d.category !== "any" && d.count !== 1 ? "s" : ""}</span>
                <span className="text-gray-500 text-[10px]">{TARGET_TYPE_LABELS[d.targetType]}</span>
                <button onClick={() => startEdit(i)} className="ml-auto text-gray-600 hover:text-blue-400 text-[10px]">edit</button>
                <button onClick={() => onChange(dispels.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 text-[10px]">x</button>
              </div>
            );
          })}
        </div>
      )}
      {showForm && (
        <div className="mt-1 bg-gray-800 rounded p-2 space-y-1.5">
          <div className="flex gap-1.5 flex-wrap items-center">
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Category:
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={category}
                onChange={(e) => setCategory(e.target.value as "buff" | "debuff" | "any")}
              >
                <option value="buff">Positive (Buffs + Positive Statuses)</option>
                <option value="debuff">Negative (Debuffs + Negative Statuses)</option>
                <option value="any">Any</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Count:
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={countMode}
                onChange={(e) => setCountMode(e.target.value as "all" | "number")}
              >
                <option value="all">All</option>
                <option value="number">Number</option>
              </select>
              {countMode === "number" && (
                <input
                  type="number"
                  className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[11px] focus:outline-none"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                  min={1}
                />
              )}
            </label>
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              Target:
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as TargetType)}
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleSave} className="text-[10px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white">
              {isEditing ? "Save" : "Add"}
            </button>
            <button onClick={resetForm} className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResistanceGrantsEditor({
  grants,
  statusEffects,
  onChange,
}: {
  grants: ResistanceGrant[];
  statusEffects: StatusEffect[];
  onChange: (grants: ResistanceGrant[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [grantType, setGrantType] = useState<"status" | "elemental">("status");
  const [targetId, setTargetId] = useState("");
  const [value, setValue] = useState(50);

  const isEditing = editIdx !== null;
  const showForm = adding || isEditing;

  const resistableEffects = statusEffects.filter((se) => se.resistable);

  const startEdit = (i: number) => {
    const g = grants[i];
    setEditIdx(i);
    setAdding(false);
    setGrantType(g.type);
    setTargetId(g.targetId);
    setValue(g.value);
  };

  const resetForm = () => {
    setAdding(false);
    setEditIdx(null);
    setTargetId("");
    setValue(50);
  };

  const handleSave = () => {
    if (!targetId) return;
    const entry: ResistanceGrant = { type: grantType, targetId, value };
    if (isEditing && editIdx !== null) {
      onChange(grants.map((g, i) => (i === editIdx ? entry : g)));
    } else {
      onChange([...grants, entry]);
    }
    resetForm();
  };

  const getLabel = (g: ResistanceGrant) => {
    if (g.type === "status") {
      const se = statusEffects.find((s) => s.id === g.targetId);
      return se?.name ?? "Unknown";
    }
    return ELEMENT_LABELS[g.targetId as Element] ?? g.targetId;
  };

  return (
    <div className="border-t border-gray-800 pt-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-cyan-400 font-medium uppercase">Resistance Grants</span>
        {!showForm && (
          <button
            onClick={() => { setAdding(true); setEditIdx(null); }}
            className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          >
            + Add Resistance
          </button>
        )}
      </div>

      {grants.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {grants.map((g, i) => {
            if (editIdx === i) return null;
            return (
              <div key={i} className="flex items-center gap-1.5 text-[11px] bg-gray-800/50 rounded px-2 py-0.5">
                <span className="text-[9px] text-gray-500 uppercase">{g.type}</span>
                <span className="font-medium text-cyan-400">{getLabel(g)}</span>
                <span className="text-gray-400">+{g.value}%</span>
                <button onClick={() => startEdit(i)} className="ml-auto text-gray-600 hover:text-blue-400 text-[10px]">edit</button>
                <button onClick={() => onChange(grants.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 text-[10px]">x</button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="mt-1 bg-gray-800 rounded p-2 space-y-1.5">
          {isEditing && <span className="text-[9px] text-blue-400 font-medium">Editing resistance grant</span>}
          <div className="flex gap-1.5 flex-wrap items-center">
            <select
              className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
              value={grantType}
              onChange={(e) => { setGrantType(e.target.value as "status" | "elemental"); setTargetId(""); }}
            >
              <option value="status">Status Resistance</option>
              <option value="elemental">Elemental Resistance</option>
            </select>
            {grantType === "status" ? (
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Select status...</option>
                {resistableEffects.map((se) => (
                  <option key={se.id} value={se.id}>{se.name}</option>
                ))}
              </select>
            ) : (
              <select
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Select element...</option>
                {ELEMENTS.map((el) => (
                  <option key={el} value={el}>{ELEMENT_ICONS[el]} {ELEMENT_LABELS[el]}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            <label className="flex items-center gap-1 text-[10px] text-gray-400">
              +
              <input
                type="number"
                className="w-12 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                value={value}
                onChange={(e) => setValue(parseInt(e.target.value) || 0)}
              />
              %
            </label>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handleSave}
              disabled={!targetId}
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
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!level.passive}
                  onChange={(e) => updateLevel(i, { passive: e.target.checked || undefined })}
                  className="rounded bg-gray-800 border-gray-700 text-cyan-600 focus:ring-cyan-500 w-3 h-3"
                />
                <span className="text-[10px] text-cyan-400 font-medium">While Equipped</span>
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
              {level.damageCategory && level.damageTier === "random" && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-gray-500">Pool:</span>
                  {DAMAGE_TIERS.filter((t) => t !== "random").map((t) => {
                    const pool = level.randomTierPool ?? [];
                    const checked = pool.includes(t);
                    return (
                      <label key={t} className="flex items-center gap-0.5 text-[10px] text-gray-300">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...pool, t]
                              : pool.filter((x) => x !== t);
                            updateLevel(i, { randomTierPool: next.length > 0 ? next : undefined });
                          }}
                        />
                        {DAMAGE_TIER_LABELS[t]}
                      </label>
                    );
                  })}
                </div>
              )}
              {level.damageCategory && (
                <div className="flex items-center gap-1 flex-wrap">
                  <label className="flex items-center gap-1 text-[10px] text-gray-400">
                    <input
                      type="checkbox"
                      checked={!!level.variableRepeat}
                      onChange={(e) => updateLevel(i, { variableRepeat: e.target.checked ? { color: "red", max: 5 } : undefined })}
                    />
                    Variable Repeat
                  </label>
                  {level.variableRepeat && (
                    <>
                      <select
                        className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                        value={level.variableRepeat.color}
                        onChange={(e) => updateLevel(i, { variableRepeat: { ...level.variableRepeat!, color: e.target.value as EnergyColor | "any" } })}
                      >
                        <option value="any">any</option>
                        {ENERGY_COLORS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <span className="text-[10px] text-gray-500">max</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500 w-12"
                        value={level.variableRepeat.max}
                        onChange={(e) => updateLevel(i, { variableRepeat: { ...level.variableRepeat!, max: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) } })}
                      />
                    </>
                  )}
                </div>
              )}
              {level.damageCategory && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">Source:</span>
                  <select
                    className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500"
                    value={level.damageSourceOverride ?? ""}
                    onChange={(e) => updateLevel(i, { damageSourceOverride: (e.target.value || undefined) as SkillLevel["damageSourceOverride"] })}
                    title="Override how this skill is classified for cover/source-resistance interactions"
                  >
                    <option value="">Auto (from target)</option>
                    <option value="direct">Direct</option>
                    <option value="aoe">AOE</option>
                    <option value="indirect">Indirect</option>
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
              {level.damageCategory === "physical" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">Ignore DEF:</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500 w-14"
                    value={level.ignoreDefense ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      updateLevel(i, { ignoreDefense: v || undefined });
                    }}
                  />
                  <span className="text-[10px] text-gray-500">%</span>
                </div>
              )}
              {level.damageCategory === "magical" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">Ignore SPI:</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500 w-14"
                    value={level.ignoreSpirit ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      updateLevel(i, { ignoreSpirit: v || undefined });
                    }}
                  />
                  <span className="text-[10px] text-gray-500">%</span>
                </div>
              )}
              <label className="flex items-center gap-1 cursor-pointer" title="Bypass the back-row defender's -20% damage taken modifier (anti-back-row sniping)">
                <input
                  type="checkbox"
                  checked={!!level.ignoreRowDefense}
                  onChange={(e) => updateLevel(i, { ignoreRowDefense: e.target.checked || undefined })}
                />
                <span className="text-[10px] text-gray-500">Ignore Row DEF</span>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-red-400">HP Cost:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500 w-14"
                  value={level.hpCost ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                    updateLevel(i, { hpCost: v || undefined });
                  }}
                />
                <span className="text-[10px] text-gray-500">% max HP</span>
              </div>
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
              {/* Range tags */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Range:</span>
                {(["melee", "ranged", "magic"] as const).map((tag) => {
                  const active = level.rangeTags?.includes(tag) ?? false;
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        const cur = level.rangeTags ?? [];
                        const next = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
                        updateLevel(i, { rangeTags: next.length > 0 ? next : undefined });
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors capitalize ${
                        active
                          ? tag === "melee" ? "bg-orange-700/40 border-orange-500/60 text-orange-200"
                          : tag === "ranged" ? "bg-cyan-700/40 border-cyan-500/60 text-cyan-200"
                          : "bg-purple-700/40 border-purple-500/60 text-purple-200"
                          : "bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {tag === "melee" ? "⚔" : tag === "ranged" ? "🏹" : "✨"} {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {level.damageCategory && (
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-[10px] text-gray-500">HP Scaling:</span>
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  Caster Missing HP cap:
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                    value={level.casterMissingHpScaling ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      updateLevel(i, { casterMissingHpScaling: v || undefined });
                    }}
                  />
                  %
                </label>
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  Giant Slayer max:
                  <input
                    type="number"
                    min={0}
                    max={500}
                    className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                    value={level.giantSlayerMaxBonus ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(500, parseInt(e.target.value) || 0));
                      updateLevel(i, { giantSlayerMaxBonus: v || undefined });
                    }}
                  />
                  %
                </label>
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  Execute:
                  <input
                    type="number"
                    min={0}
                    max={500}
                    className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                    value={level.executeBonus?.maxBonus ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(500, parseInt(e.target.value) || 0));
                      updateLevel(i, { executeBonus: v > 0 ? { threshold: level.executeBonus?.threshold ?? 25, maxBonus: v } : undefined });
                    }}
                  />
                  % at HP ≤
                  <input
                    type="number"
                    min={1}
                    max={99}
                    className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                    value={level.executeBonus?.threshold ?? 25}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(99, parseInt(e.target.value) || 25));
                      if (level.executeBonus) updateLevel(i, { executeBonus: { ...level.executeBonus, threshold: v } });
                    }}
                  />
                  %
                </label>
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  Bonus HP dmg:
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                    value={level.bonusHpDamage?.percent ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      updateLevel(i, { bonusHpDamage: v > 0 ? { percent: v, source: level.bonusHpDamage?.source ?? "max" } : undefined });
                    }}
                  />
                  % of
                  <select
                    className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                    value={level.bonusHpDamage?.source ?? "max"}
                    onChange={(e) => {
                      if (level.bonusHpDamage) updateLevel(i, { bonusHpDamage: { ...level.bonusHpDamage, source: e.target.value as "max" | "current" } });
                    }}
                  >
                    <option value="max">Max HP</option>
                    <option value="current">Current HP</option>
                  </select>
                </label>
                <div className="flex items-center gap-1 text-[10px] text-gray-400 flex-wrap">
                  <label className="flex items-center gap-1" title="Strip any imbue-tagged buffs from the caster after this skill's damage lands">
                    <input
                      type="checkbox"
                      checked={!!level.consumesCasterImbue}
                      onChange={(e) => updateLevel(i, { consumesCasterImbue: e.target.checked || undefined })}
                    />
                    Consume caster imbue
                  </label>
                </div>
                <div className="flex items-start gap-1 text-[10px] text-gray-400 flex-wrap">
                  <span className="text-gray-500" title="Skill is disabled in the action bar unless the caster has at least one of these statuses active">Requires any of:</span>
                  <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                    {statusEffects.map((se) => {
                      const list = level.requiresAnyStatus ?? [];
                      const checked = list.includes(se.id);
                      return (
                        <label key={se.id} className={`flex items-center gap-0.5 px-1 py-0.5 rounded border ${checked ? "border-emerald-500/60 bg-emerald-900/30" : "border-gray-700 bg-gray-800"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...list, se.id]
                                : list.filter((x) => x !== se.id);
                              updateLevel(i, { requiresAnyStatus: next.length > 0 ? next : undefined });
                            }}
                          />
                          {se.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-gray-400 flex-wrap">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!!level.splashHit}
                      onChange={(e) => updateLevel(i, { splashHit: e.target.checked
                        ? { damageTier: "minor", damageCategory: "true", damageSourceOverride: "indirect", targetPattern: "adjacent-of-target", inheritElement: true }
                        : undefined })}
                    />
                    Splash
                  </label>
                  {level.splashHit && (
                    <>
                      <select
                        className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
                        value={level.splashHit.targetPattern}
                        onChange={(e) => updateLevel(i, { splashHit: { ...level.splashHit!, targetPattern: e.target.value as "adjacent-of-target" | "all-other-enemies" | "row-behind-target" } })}
                      >
                        <option value="adjacent-of-target">Adjacent of target</option>
                        <option value="all-other-enemies">All other enemies</option>
                        <option value="row-behind-target">Row behind target</option>
                      </select>
                      <select
                        className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
                        value={level.splashHit.damageTier}
                        onChange={(e) => updateLevel(i, { splashHit: { ...level.splashHit!, damageTier: e.target.value } })}
                      >
                        {DAMAGE_TIERS.filter((t) => t !== "random").map((t) => (
                          <option key={t} value={t}>{DAMAGE_TIER_LABELS[t]}</option>
                        ))}
                      </select>
                      <select
                        className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
                        value={level.splashHit.damageCategory}
                        onChange={(e) => updateLevel(i, { splashHit: { ...level.splashHit!, damageCategory: e.target.value as "physical" | "magical" | "true" } })}
                      >
                        <option value="physical">Physical</option>
                        <option value="magical">Magical</option>
                        <option value="true">True</option>
                      </select>
                      <select
                        className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px]"
                        value={level.splashHit.damageSourceOverride ?? "indirect"}
                        onChange={(e) => updateLevel(i, { splashHit: { ...level.splashHit!, damageSourceOverride: e.target.value as "direct" | "aoe" | "indirect" } })}
                      >
                        <option value="direct">Direct</option>
                        <option value="aoe">AOE</option>
                        <option value="indirect">Indirect</option>
                      </select>
                      <label className="flex items-center gap-0.5">
                        <input
                          type="checkbox"
                          checked={level.splashHit.inheritElement ?? true}
                          onChange={(e) => updateLevel(i, { splashHit: { ...level.splashHit!, inheritElement: e.target.checked } })}
                        />
                        Inherit element
                      </label>
                    </>
                  )}
                </div>
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  Bonus vs status:
                  <select
                    className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none max-w-[120px]"
                    value={level.bonusDamageVsStatus?.statusEffectId ?? ""}
                    onChange={(e) => {
                      const sid = e.target.value;
                      if (!sid) {
                        updateLevel(i, { bonusDamageVsStatus: undefined });
                      } else {
                        updateLevel(i, { bonusDamageVsStatus: { statusEffectId: sid, percent: level.bonusDamageVsStatus?.percent ?? 10 } });
                      }
                    }}
                  >
                    <option value="">— None —</option>
                    {statusEffects.map((se) => (
                      <option key={se.id} value={se.id}>{se.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    disabled={!level.bonusDamageVsStatus}
                    className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none disabled:opacity-40"
                    value={level.bonusDamageVsStatus?.percent ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(500, parseInt(e.target.value) || 0));
                      if (level.bonusDamageVsStatus) updateLevel(i, { bonusDamageVsStatus: { ...level.bonusDamageVsStatus, percent: v } });
                    }}
                  />
                  %
                </label>
                <label className="flex items-center gap-1 text-[10px] text-gray-400">
                  Stolen Energy:
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-12 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                    value={level.stolenEnergyScaling?.perStack ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      updateLevel(i, { stolenEnergyScaling: v > 0 ? { perStack: v, maxStacks: level.stolenEnergyScaling?.maxStacks ?? 5, resetOnUse: level.stolenEnergyScaling?.resetOnUse ?? true } : undefined });
                    }}
                  />
                  % per stack, max
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className="w-10 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                    value={level.stolenEnergyScaling?.maxStacks ?? 5}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(20, parseInt(e.target.value) || 5));
                      if (level.stolenEnergyScaling) updateLevel(i, { stolenEnergyScaling: { ...level.stolenEnergyScaling, maxStacks: v } });
                    }}
                  />
                  stacks
                  <label className="flex items-center gap-1 ml-1">
                    <input
                      type="checkbox"
                      checked={level.stolenEnergyScaling?.resetOnUse ?? true}
                      onChange={(e) => {
                        if (level.stolenEnergyScaling) updateLevel(i, { stolenEnergyScaling: { ...level.stolenEnergyScaling, resetOnUse: e.target.checked } });
                      }}
                      className="w-3 h-3"
                    />
                    Reset on use
                  </label>
                </label>
              </div>
            )}

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
            <RandomEffectPoolsEditor
              pools={level.randomEffectPools ?? []}
              statusEffects={statusEffects}
              onChange={(pools) => updateLevel(i, { randomEffectPools: pools.length > 0 ? pools : undefined })}
            />
            <RandomEffectPoolsEditor
              mode="choose"
              pools={level.chooseEffectPools ?? []}
              statusEffects={statusEffects}
              onChange={(pools) => updateLevel(i, { chooseEffectPools: pools.length > 0 ? pools : undefined })}
            />
            <RandomEffectPoolsEditor
              mode="cycle"
              pools={level.cycleEffectPools ?? []}
              statusEffects={statusEffects}
              onChange={(pools) => updateLevel(i, { cycleEffectPools: pools.length > 0 ? pools : undefined })}
            />
            {/* Resistance grants (for passive skills) */}
            <ResistanceGrantsEditor
              grants={level.resistanceGrants ?? []}
              statusEffects={statusEffects}
              onChange={(grants) => updateLevel(i, { resistanceGrants: grants.length > 0 ? grants : undefined })}
            />
            {/* Dispels */}
            <DispelsEditor
              dispels={level.dispels ?? []}
              onChange={(dispels) => updateLevel(i, { dispels: dispels.length > 0 ? dispels : undefined })}
            />
            <MovementsEditor
              movements={level.movements ?? []}
              onChange={(movements) => updateLevel(i, { movements: movements.length > 0 ? movements : undefined })}
            />
            <EnergyActionsEditor
              steal={level.energySteal}
              generate={level.energyGenerate}
              onChangeSteal={(es) => updateLevel(i, { energySteal: es })}
              onChangeGenerate={(eg) => updateLevel(i, { energyGenerate: eg })}
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
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.levels[0].passive}
                onChange={(e) => updateLevel(0, { passive: e.target.checked || undefined })}
                className="rounded bg-gray-800 border-gray-700 text-cyan-600 focus:ring-cyan-500 w-3 h-3"
              />
              <span className="text-[10px] text-cyan-400 font-medium">While Equipped</span>
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
            {form.levels[0].damageCategory === "physical" && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Ignore DEF:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500 w-14"
                  value={form.levels[0].ignoreDefense ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                    updateLevel(0, { ignoreDefense: v || undefined });
                  }}
                />
                <span className="text-[10px] text-gray-500">%</span>
              </div>
            )}
            {form.levels[0].damageCategory === "magical" && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Ignore SPI:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500 w-14"
                  value={form.levels[0].ignoreSpirit ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                    updateLevel(0, { ignoreSpirit: v || undefined });
                  }}
                />
                <span className="text-[10px] text-gray-500">%</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-red-400">HP Cost:</span>
              <input
                type="number"
                min={0}
                max={100}
                className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none focus:border-gray-500 w-14"
                value={form.levels[0].hpCost ?? 0}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                  updateLevel(0, { hpCost: v || undefined });
                }}
              />
              <span className="text-[10px] text-gray-500">% max HP</span>
            </div>
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
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-500">Range:</span>
              {(["melee", "ranged", "magic"] as const).map((tag) => {
                const active = form.levels[0].rangeTags?.includes(tag) ?? false;
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      const cur = form.levels[0].rangeTags ?? [];
                      const next = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
                      updateLevel(0, { rangeTags: next.length > 0 ? next : undefined });
                    }}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors capitalize ${
                      active
                        ? tag === "melee" ? "bg-orange-700/40 border-orange-500/60 text-orange-200"
                        : tag === "ranged" ? "bg-cyan-700/40 border-cyan-500/60 text-cyan-200"
                        : "bg-purple-700/40 border-purple-500/60 text-purple-200"
                        : "bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {tag === "melee" ? "⚔" : tag === "ranged" ? "🏹" : "✨"} {tag}
                  </button>
                );
              })}
            </div>
          </div>
          {form.levels[0].damageCategory && (
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-[10px] text-gray-500">HP Scaling:</span>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                Caster Missing HP cap:
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={form.levels[0].casterMissingHpScaling ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                    updateLevel(0, { casterMissingHpScaling: v || undefined });
                  }}
                />
                %
              </label>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                Giant Slayer max:
                <input
                  type="number"
                  min={0}
                  max={500}
                  className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={form.levels[0].giantSlayerMaxBonus ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(500, parseInt(e.target.value) || 0));
                    updateLevel(0, { giantSlayerMaxBonus: v || undefined });
                  }}
                />
                %
              </label>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                Execute:
                <input
                  type="number"
                  min={0}
                  max={500}
                  className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={form.levels[0].executeBonus?.maxBonus ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(500, parseInt(e.target.value) || 0));
                    updateLevel(0, { executeBonus: v > 0 ? { threshold: form.levels[0].executeBonus?.threshold ?? 25, maxBonus: v } : undefined });
                  }}
                />
                % at HP ≤
                <input
                  type="number"
                  min={1}
                  max={99}
                  className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={form.levels[0].executeBonus?.threshold ?? 25}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(99, parseInt(e.target.value) || 25));
                    if (form.levels[0].executeBonus) updateLevel(0, { executeBonus: { ...form.levels[0].executeBonus, threshold: v } });
                  }}
                />
                %
              </label>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                Bonus HP dmg:
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={form.levels[0].bonusHpDamage?.percent ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                    updateLevel(0, { bonusHpDamage: v > 0 ? { percent: v, source: form.levels[0].bonusHpDamage?.source ?? "max" } : undefined });
                  }}
                />
                % of
                <select
                  className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white text-[10px] focus:outline-none"
                  value={form.levels[0].bonusHpDamage?.source ?? "max"}
                  onChange={(e) => {
                    if (form.levels[0].bonusHpDamage) updateLevel(0, { bonusHpDamage: { ...form.levels[0].bonusHpDamage, source: e.target.value as "max" | "current" } });
                  }}
                >
                  <option value="max">Max HP</option>
                  <option value="current">Current HP</option>
                </select>
              </label>
            </div>
          )}
          {/* Effects for basic/innate */}
          <EffectsEditor
            effects={form.levels[0].effects ?? []}
            statusEffects={statusEffects}
            onChange={(effects) => updateLevel(0, { effects: effects.length > 0 ? effects : undefined })}
          />
          <RandomEffectPoolsEditor
            pools={form.levels[0].randomEffectPools ?? []}
            statusEffects={statusEffects}
            onChange={(pools) => updateLevel(0, { randomEffectPools: pools.length > 0 ? pools : undefined })}
          />
          <RandomEffectPoolsEditor
            mode="choose"
            pools={form.levels[0].chooseEffectPools ?? []}
            statusEffects={statusEffects}
            onChange={(pools) => updateLevel(0, { chooseEffectPools: pools.length > 0 ? pools : undefined })}
          />
          <RandomEffectPoolsEditor
            mode="cycle"
            pools={form.levels[0].cycleEffectPools ?? []}
            statusEffects={statusEffects}
            onChange={(pools) => updateLevel(0, { cycleEffectPools: pools.length > 0 ? pools : undefined })}
          />
          {/* Resistance grants for basic/innate */}
          <ResistanceGrantsEditor
            grants={form.levels[0].resistanceGrants ?? []}
            statusEffects={statusEffects}
            onChange={(grants) => updateLevel(0, { resistanceGrants: grants.length > 0 ? grants : undefined })}
          />
          <DispelsEditor
            dispels={form.levels[0].dispels ?? []}
            onChange={(dispels) => updateLevel(0, { dispels: dispels.length > 0 ? dispels : undefined })}
          />
          <MovementsEditor
            movements={form.levels[0].movements ?? []}
            onChange={(movements) => updateLevel(0, { movements: movements.length > 0 ? movements : undefined })}
          />
          <EnergyActionsEditor
            steal={form.levels[0].energySteal}
            generate={form.levels[0].energyGenerate}
            onChangeSteal={(es) => updateLevel(0, { energySteal: es })}
            onChangeGenerate={(eg) => updateLevel(0, { energyGenerate: eg })}
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
