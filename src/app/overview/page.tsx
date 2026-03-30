"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { EnergyColor, ENERGY_COLORS } from "@/lib/types";

const COLOR_HEX: Record<EnergyColor, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  yellow: "#eab308",
};

function BarChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-400 w-16 text-right capitalize">
            {d.label}
          </span>
          <div className="flex-1 h-7 bg-gray-800 rounded overflow-hidden relative">
            <div
              className="h-full rounded transition-all duration-300"
              style={{
                width: `${(d.value / max) * 100}%`,
                backgroundColor: d.color,
              }}
            />
            <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white">
              {d.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const { characters, seriesList } = useStore();

  const energyTotals = useMemo(() => {
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
      label: color,
      value: totals[color],
      color: COLOR_HEX[color],
    }));
  }, [characters]);

  const energyBySeries = useMemo(() => {
    const groups: {
      seriesName: string;
      totals: { label: string; value: number; color: string }[];
    }[] = [];

    for (const s of seriesList) {
      const chars = characters.filter((c) => c.series === s.name);
      if (chars.length === 0) continue;
      const totals: Record<EnergyColor, number> = {
        red: 0,
        blue: 0,
        green: 0,
        purple: 0,
        yellow: 0,
      };
      for (const char of chars) {
        for (const eg of char.energyGeneration) {
          totals[eg.color] += eg.amount;
        }
      }
      groups.push({
        seriesName: s.name,
        totals: ENERGY_COLORS.map((color) => ({
          label: color,
          value: totals[color],
          color: COLOR_HEX[color],
        })),
      });
    }
    return groups;
  }, [characters, seriesList]);

  const totalEnergy = energyTotals.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Overview</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-300">
          Energy Generation — All Characters
        </h2>
        <p className="text-xs text-gray-500">
          Total energy across {characters.length} character
          {characters.length !== 1 && "s"}: {totalEnergy}
        </p>
        {characters.length === 0 ? (
          <p className="text-sm text-gray-500">
            No characters created yet.
          </p>
        ) : (
          <BarChart data={energyTotals} />
        )}
      </section>

      {energyBySeries.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-300">
            Energy Generation — By Series
          </h2>
          {energyBySeries.map((group) => (
            <div key={group.seriesName} className="space-y-2">
              <h3 className="text-sm font-medium text-gray-400">
                {group.seriesName}
              </h3>
              <BarChart data={group.totals} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
