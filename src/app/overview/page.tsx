"use client";

import { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { useStore } from "@/lib/store";
import {
  EnergyColor,
  ENERGY_COLORS,
  CharacterType,
  CHARACTER_TYPES,
  Character,
  Form,
  CharacterStats,
} from "@/lib/types";

const ENERGY_HEX: Record<EnergyColor, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  yellow: "#eab308",
};

const TYPE_COLORS: Record<CharacterType, string> = {
  Agent: "#6366f1",
  Specialist: "#f59e0b",
  Buster: "#ef4444",
  Vanguard: "#3b82f6",
  Arcanist: "#a855f7",
};

export default function OverviewPage() {
  const { characters, forms, updateCharacter, updateForm } = useStore();

  const energyRadarData = useMemo(() => {
    const totals: Record<EnergyColor, number> = {
      red: 0,
      blue: 0,
      green: 0,
      purple: 0,
      yellow: 0,
    };
    for (const char of characters) {
      for (const eg of char.energyGeneration) {
        totals[eg.color] += eg.amount;
      }
    }
    return ENERGY_COLORS.map((color) => ({
      energy: color.charAt(0).toUpperCase() + color.slice(1),
      value: totals[color],
      fill: ENERGY_HEX[color],
    }));
  }, [characters]);

  const typeBarData = useMemo(() => {
    const counts: Record<CharacterType, number> = {
      Agent: 0,
      Specialist: 0,
      Buster: 0,
      Vanguard: 0,
      Arcanist: 0,
    };
    for (const char of characters) {
      counts[char.type]++;
    }
    return CHARACTER_TYPES.map((t) => ({
      type: t,
      count: counts[t],
      fill: TYPE_COLORS[t],
    }));
  }, [characters]);

  const totalEnergy = energyRadarData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Overview</h1>

      {/* Energy Radar */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-300">
          Energy Generation — All Characters
        </h2>
        <p className="text-xs text-gray-500">
          Total energy across {characters.length} character
          {characters.length !== 1 && "s"}: {totalEnergy}
        </p>
        {characters.length === 0 ? (
          <p className="text-sm text-gray-500">No characters created yet.</p>
        ) : (
          <div className="max-w-md">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={energyRadarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis
                  dataKey="energy"
                  tick={(props: Record<string, unknown>) => {
                    const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
                    const color = ENERGY_HEX[payload.value.toLowerCase() as EnergyColor] ?? "#9ca3af";
                    return (
                      <text x={x as number} y={y as number} textAnchor="middle" fill={color} fontSize={12} fontWeight={600}>
                        {payload.value}
                      </text>
                    );
                  }}
                />
                <PolarRadiusAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
                <Radar
                  dataKey="value"
                  stroke="#60a5fa"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Character Types Bar Chart */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-300">Character Types</h2>
        <p className="text-xs text-gray-500">
          Distribution across {characters.length} character
          {characters.length !== 1 && "s"}
        </p>
        {characters.length === 0 ? (
          <p className="text-sm text-gray-500">No characters created yet.</p>
        ) : (
          <div className="max-w-lg">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={typeBarData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="type"
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: 8,
                    color: "#f3f4f6",
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {typeBarData.map((entry) => (
                    <Cell key={entry.type} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Character Stats Table */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-300">Character Stats</h2>
        {characters.length === 0 ? (
          <p className="text-sm text-gray-500">No characters created yet.</p>
        ) : (
          <CharacterStatsTable characters={characters} forms={forms} updateCharacter={updateCharacter} updateForm={updateForm} />
        )}
      </section>
    </div>
  );
}

type SortKey = "name" | "type" | "hp" | "atk" | "mAtk" | "def" | "spi" | "spd" | "total" | "adjTotal";
type SortDir = "asc" | "desc";

interface TableRow {
  id: string;
  name: string;
  formName?: string;
  formId?: string;
  photoUrl?: string;
  type: string;
  stats: CharacterStats;
  isForm: boolean;
  charId: string;
}

function StatTooltipCell({ value, lines, title, className }: { value: number; lines: string[]; title: string; className?: string }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLTableCellElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    }
    setShow(true);
  };

  return (
    <td
      ref={ref}
      className={`px-2 py-2 text-right text-sm font-mono cursor-help ${className ?? "text-gray-400"}`}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {value}
      {show && createPortal(
        <div
          className="fixed pointer-events-none"
          style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -100%)", zIndex: 9999 }}
        >
          <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 shadow-xl w-max text-left leading-relaxed">
            <span className="font-semibold text-white block mb-1">{title}</span>
            {lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div className="mt-1 pt-1 border-t border-gray-700 font-bold text-white">= {value}</div>
          </div>
        </div>,
        document.body
      )}
    </td>
  );
}

function CharacterStatsTable({ characters, forms, updateCharacter, updateForm }: {
  characters: Character[];
  forms: Form[];
  updateCharacter: (char: Character) => Promise<void>;
  updateForm: (id: string, data: { name: string; photoUrl?: string | null; typeOverride?: string | null; energyOverride?: { color: string; amount: number }[] | null; statOverrides?: Record<string, number> | null; elementalResOverride?: Record<string, number> | null; elementalDmgOverride?: Record<string, number> | null; summary?: string | null }) => Promise<void>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const calcTotal = (s: CharacterStats) => {
    const hpContrib = Math.floor(s.hp / 2);
    return hpContrib + s.atk + s.mAtk + s.def + s.spi + s.spd;
  };

  const calcAdjTotal = (s: CharacterStats) => {
    const hpContrib = Math.floor(s.hp / 2);
    const mainAtk = Math.max(s.atk, s.mAtk);
    return hpContrib + mainAtk + s.def + s.spi + s.spd;
  };

  const getTotalBreakdown = (s: CharacterStats) => {
    const hpContrib = Math.floor(s.hp / 2);
    return [
      `HP: ${s.hp} (÷2 = ${hpContrib})`,
      `ATK: ${s.atk}`,
      `MATK: ${s.mAtk}`,
      `DEF: ${s.def}`,
      `SPI: ${s.spi}`,
      `SPD: ${s.spd}`,
    ];
  };

  const getAdjTotalBreakdown = (s: CharacterStats) => {
    const hpContrib = Math.floor(s.hp / 2);
    const mainAtk = Math.max(s.atk, s.mAtk);
    const mainLabel = s.atk >= s.mAtk ? "ATK" : "MATK";
    return [
      `HP: ${s.hp} (÷2 = ${hpContrib})`,
      `${mainLabel}: ${mainAtk} (higher of ATK ${s.atk} / MATK ${s.mAtk})`,
      `DEF: ${s.def}`,
      `SPI: ${s.spi}`,
      `SPD: ${s.spd}`,
    ];
  };
  const [showForms, setShowForms] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "type" ? "asc" : "desc");
    }
  };

  // Build rows: base characters + optional form rows
  const rows = useMemo(() => {
    const result: TableRow[] = [];
    for (const char of characters) {
      result.push({
        id: char.id,
        name: char.name,
        photoUrl: char.photoUrl,
        type: char.type,
        stats: char.stats,
        isForm: false,
        charId: char.id,
      });
      if (showForms) {
        const charForms = forms
          .filter((f) => f.characterId === char.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        // Skip the first form (base) — only show alternate forms that have overrides
        for (const form of charForms.slice(1)) {
          const hasOverrides = form.statOverrides || form.typeOverride || form.photoUrl;
          if (!hasOverrides) continue;
          result.push({
            id: `${char.id}-${form.id}`,
            name: char.name,
            formName: form.name,
            formId: form.id,
            photoUrl: form.photoUrl ?? char.photoUrl,
            type: form.typeOverride ?? char.type,
            stats: form.statOverrides ? { ...char.stats, ...form.statOverrides } : char.stats,
            isForm: true,
            charId: char.id,
          });
        }
      }
    }
    return result;
  }, [characters, forms, showForms]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        const nameA = a.isForm ? `${a.name} (${a.formName})` : a.name;
        const nameB = b.isForm ? `${b.name} (${b.formName})` : b.name;
        cmp = nameA.localeCompare(nameB);
      } else if (sortKey === "type") {
        cmp = a.type.localeCompare(b.type);
      } else if (sortKey === "total") {
        cmp = calcTotal(a.stats) - calcTotal(b.stats);
      } else if (sortKey === "adjTotal") {
        cmp = calcAdjTotal(a.stats) - calcAdjTotal(b.stats);
      } else {
        cmp = a.stats[sortKey] - b.stats[sortKey];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const STAT_COLS: { key: SortKey; label: string }[] = [
    { key: "hp", label: "HP" },
    { key: "atk", label: "ATK" },
    { key: "mAtk", label: "MATK" },
    { key: "def", label: "DEF" },
    { key: "spi", label: "SPI" },
    { key: "spd", label: "SPD" },
  ];

  const SortHeader = ({ col }: { col: { key: SortKey; label: string } }) => (
    <th
      className="px-2 py-2 text-[10px] uppercase text-gray-500 font-semibold cursor-pointer hover:text-gray-300 transition-colors text-right select-none"
      onClick={() => toggleSort(col.key)}
    >
      {col.label}
      {sortKey === col.key && (
        <span className="ml-0.5 text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );

  const handleStatChange = async (row: TableRow, statKey: string, value: number) => {
    const char = characters.find((c) => c.id === row.charId);
    if (!char) return;

    if (row.isForm && row.formId) {
      // Update form stat override
      const form = forms.find((f) => f.id === row.formId);
      if (!form) return;
      const currentOverrides = form.statOverrides ?? {};
      const newOverrides: Record<string, number> = { ...currentOverrides, [statKey]: value };
      // If value matches base stat, remove the override
      if (value === char.stats[statKey as keyof CharacterStats]) {
        delete newOverrides[statKey];
      }
      await updateForm(form.id, {
        name: form.name,
        photoUrl: form.photoUrl ?? null,
        typeOverride: form.typeOverride ?? null,
        energyOverride: form.energyOverride ?? null,
        statOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : null,
        elementalResOverride: form.elementalResOverride ?? null,
        elementalDmgOverride: form.elementalDmgOverride ?? null,
        summary: form.summary ?? null,
      });
    } else {
      // Update base character stat
      await updateCharacter({
        ...char,
        stats: { ...char.stats, [statKey]: value },
      });
    }
  };

  // Compute min/max for each stat to color-code (all visible rows)
  const statRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const col of STAT_COLS) {
      const vals = rows.map((r) => r.stats[col.key as keyof typeof r.stats] as number);
      if (vals.length === 0) { ranges[col.key] = { min: 0, max: 0 }; continue; }
      ranges[col.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    return ranges;
  }, [rows]);

  const getStatColor = (key: string, val: number) => {
    const range = statRanges[key];
    if (!range || range.min === range.max) return "text-white";
    const ratio = (val - range.min) / (range.max - range.min);
    if (ratio >= 0.8) return "text-green-400";
    if (ratio <= 0.2) return "text-red-400";
    return "text-white";
  };

  const hasAnyForms = forms.some((f) => {
    const charForms = forms.filter((ff) => ff.characterId === f.characterId);
    return charForms.length > 1;
  });

  return (
    <div className="space-y-2">
      {hasAnyForms && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showForms}
            onChange={(e) => setShowForms(e.target.checked)}
            className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">Show alternate forms</span>
        </label>
      )}
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th
              className="px-2 py-2 text-[10px] uppercase text-gray-500 font-semibold cursor-pointer hover:text-gray-300 text-left select-none"
              onClick={() => toggleSort("name")}
            >
              Character
              {sortKey === "name" && (
                <span className="ml-0.5 text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>
              )}
            </th>
            <th
              className="px-2 py-2 text-[10px] uppercase text-gray-500 font-semibold cursor-pointer hover:text-gray-300 text-left select-none"
              onClick={() => toggleSort("type")}
            >
              Type
              {sortKey === "type" && (
                <span className="ml-0.5 text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>
              )}
            </th>
            {STAT_COLS.map((col) => (
              <SortHeader key={col.key} col={col} />
            ))}
            <th
              className="px-2 py-2 text-[10px] uppercase text-gray-500 font-semibold cursor-pointer hover:text-gray-300 transition-colors text-right select-none"
              onClick={() => toggleSort("total")}
            >
              Total
              {sortKey === "total" && (
                <span className="ml-0.5 text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>
              )}
            </th>
            <th
              className="px-2 py-2 text-[10px] uppercase text-gray-500 font-semibold cursor-pointer hover:text-gray-300 transition-colors text-right select-none"
              onClick={() => toggleSort("adjTotal")}
            >
              Adj
              {sortKey === "adjTotal" && (
                <span className="ml-0.5 text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const total = row.stats.hp + row.stats.atk + row.stats.mAtk + row.stats.def + row.stats.spi + row.stats.spd;
            return (
              <tr key={row.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    {row.photoUrl ? (
                      <img src={row.photoUrl} alt={row.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                        {row.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <span className="text-white font-medium text-sm">{row.name}</span>
                      {row.isForm && (
                        <span className="ml-1.5 text-[10px] text-blue-400 font-medium">{row.formName}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-xs text-gray-400">{row.type}</td>
                {STAT_COLS.map((col) => {
                  const val = row.stats[col.key as keyof typeof row.stats] as number;
                  return (
                    <td key={col.key} className="px-1 py-1">
                      <input
                        type="number"
                        className={`w-full bg-transparent border border-transparent hover:border-gray-700 focus:border-blue-500 focus:bg-gray-800 rounded px-1 py-0.5 text-right text-sm font-mono font-bold outline-none transition-colors ${getStatColor(col.key, val)}`}
                        value={val}
                        onChange={(e) => {
                          const newVal = parseInt(e.target.value) || 0;
                          handleStatChange(row, col.key, newVal);
                        }}
                      />
                    </td>
                  );
                })}
                <StatTooltipCell
                  value={calcTotal(row.stats)}
                  lines={getTotalBreakdown(row.stats)}
                  title="Total Breakdown"
                />
                <StatTooltipCell
                  value={calcAdjTotal(row.stats)}
                  lines={getAdjTotalBreakdown(row.stats)}
                  title="Adjusted Total"
                  className="text-blue-400"
                />
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
