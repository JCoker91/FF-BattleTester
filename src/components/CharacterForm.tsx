"use client";

import { useState } from "react";
import {
  Character,
  CharacterStats,
  EnergyGeneration,
  ElementalValues,
  Element,
  CHARACTER_TYPES,
  ENERGY_COLORS,
  ELEMENTS,
  ELEMENT_LABELS,
  ELEMENT_ICONS,
  DEFAULT_ELEMENTAL,
  EnergyColor,
  CharacterType,
} from "@/lib/types";

const ENERGY_HEX: Record<EnergyColor, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  yellow: "#eab308",
};

const defaultStats = (): CharacterStats => ({
  hp: 1000,
  atk: 10,
  mAtk: 10,
  def: 10,
  spi: 10,
  spd: 5,
});

interface CharacterFormProps {
  initial?: Character;
  availableSeries: { id: string; name: string }[];
  onSave: (data: Omit<Character, "id">) => void;
  onCancel: () => void;
}

export function CharacterForm({
  initial,
  availableSeries,
  onSave,
  onCancel,
}: CharacterFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [series, setSeries] = useState(initial?.series ?? "");
  const [type, setType] = useState<CharacterType>(
    initial?.type ?? "Buster"
  );
  const [energyGen, setEnergyGen] = useState<EnergyGeneration[]>(
    initial?.energyGeneration ?? []
  );
  const [stats, setStats] = useState<CharacterStats>(
    initial?.stats ?? defaultStats()
  );
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [gender, setGender] = useState<Character["gender"] | "">(initial?.gender ?? "");
  const [elemRes, setElemRes] = useState<ElementalValues>(initial?.elementalResistance ?? { ...DEFAULT_ELEMENTAL });
  const [elemDmg, setElemDmg] = useState<ElementalValues>(initial?.elementalDamage ?? { ...DEFAULT_ELEMENTAL });
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(
    initial?.photoUrl
  );
  const [uploading, setUploading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const { url } = await res.json();
    setPhotoUrl(url);
    setUploading(false);
  };

  const addEnergy = (color: EnergyColor) => {
    const existing = energyGen.find((e) => e.color === color);
    if (existing) {
      setEnergyGen(
        energyGen.map((e) =>
          e.color === color ? { ...e, amount: e.amount + 1 } : e
        )
      );
    } else {
      setEnergyGen([...energyGen, { color, amount: 1 }]);
    }
  };

  const removeEnergy = (color: EnergyColor) => {
    setEnergyGen(
      energyGen
        .map((e) => (e.color === color ? { ...e, amount: e.amount - 1 } : e))
        .filter((e) => e.amount > 0)
    );
  };

  const updateStat = (key: keyof CharacterStats, value: number) => {
    setStats({ ...stats, [key]: value });
  };

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name,
      series,
      type,
      energyGeneration: energyGen,
      stats,
      elementalResistance: elemRes,
      elementalDamage: elemDmg,
      equippedLoadout: initial?.equippedLoadout ?? { innateId: null, basicId: null, abilityIds: [] },
      statusResistance: initial?.statusResistance ?? {},
      photoUrl,
      summary: summary || undefined,
      gender: gender || undefined,
    });
  };

  return (
    <div className="space-y-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Name
          </label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cloud"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Series
          </label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
          >
            <option value="">-- None --</option>
            {availableSeries.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
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
            value={type}
            onChange={(e) => setType(e.target.value as CharacterType)}
          >
            {CHARACTER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Gender
          </label>
          <select
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
            value={gender ?? ""}
            onChange={(e) => setGender((e.target.value || "") as Character["gender"] | "")}
          >
            <option value="">— Unspecified —</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Photo */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Photo
        </label>
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Character"
              className="w-16 h-16 rounded-lg object-cover border border-gray-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600 text-xs">
              No photo
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded cursor-pointer inline-block text-center">
              {uploading ? "Uploading..." : "Upload"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
                disabled={uploading}
              />
            </label>
            {photoUrl && (
              <button
                onClick={() => setPhotoUrl(undefined)}
                className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-300 text-xs rounded"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Energy Generation */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Energy Generation
        </label>
        <div className="flex gap-2 items-center flex-wrap mb-2">
          <span className="text-xs text-gray-500">
            Total: {energyGen.reduce((sum, e) => sum + e.amount, 0)}
          </span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {ENERGY_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => addEnergy(color)}
              className="px-2 py-0.5 rounded text-xs text-white capitalize hover:opacity-80"
              style={{ backgroundColor: ENERGY_HEX[color] }}
            >
              +{color}
            </button>
          ))}
          {energyGen.map((e) => (
            <button
              key={e.color}
              onClick={() => removeEnergy(e.color)}
              className="px-2 py-0.5 rounded text-xs text-white capitalize opacity-60 hover:opacity-100"
              style={{ backgroundColor: ENERGY_HEX[e.color] }}
            >
              -{e.color}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Stats
        </label>
        <div className="grid grid-cols-6 gap-2">
          {(["hp", "atk", "mAtk", "def", "spi", "spd"] as const).map((key) => {
            const val = stats[key];
            return (
            <div key={key}>
              <label className="block text-xs text-gray-500 uppercase">
                {key}
              </label>
              <input
                type="number"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-gray-500"
                value={val}
                onChange={(e) =>
                  updateStat(key, parseInt(e.target.value) || 0)
                }
              />
            </div>
            );
          })}
        </div>
      </div>

      {/* Elemental Resistance */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Elemental Resistance (%)
        </label>
        <div className="grid grid-cols-7 gap-2">
          {ELEMENTS.map((elem) => (
            <div key={elem}>
              <label className="block text-[10px] text-gray-500 text-center">
                {ELEMENT_ICONS[elem]} {ELEMENT_LABELS[elem]}
              </label>
              <input
                type="number"
                className={`w-full bg-gray-800 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-gray-500 ${
                  elemRes[elem] !== 100 ? "border-blue-500/50 text-blue-300" : "border-gray-700 text-white"
                }`}
                value={elemRes[elem]}
                onChange={(e) => setElemRes({ ...elemRes, [elem]: parseInt(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Elemental Damage */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Elemental Damage (%)
        </label>
        <div className="grid grid-cols-7 gap-2">
          {ELEMENTS.map((elem) => (
            <div key={elem}>
              <label className="block text-[10px] text-gray-500 text-center">
                {ELEMENT_ICONS[elem]} {ELEMENT_LABELS[elem]}
              </label>
              <input
                type="number"
                className={`w-full bg-gray-800 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-gray-500 ${
                  elemDmg[elem] !== 100 ? "border-blue-500/50 text-blue-300" : "border-gray-700 text-white"
                }`}
                value={elemDmg[elem]}
                onChange={(e) => setElemDmg({ ...elemDmg, [elem]: parseInt(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Summary <span className="text-gray-500 font-normal">(optional)</span>
        </label>
        <textarea
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500 min-h-[80px]"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What does this character contribute to the party? How do they play?"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={submit}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium"
        >
          {initial ? "Update Character" : "Create Character"}
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
