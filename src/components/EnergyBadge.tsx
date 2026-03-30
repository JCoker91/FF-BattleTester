"use client";

import { EnergyColor } from "@/lib/types";

const COLOR_MAP: Record<EnergyColor, string> = {
  red: "bg-energy-red",
  blue: "bg-energy-blue",
  green: "bg-energy-green",
  purple: "bg-energy-purple",
  yellow: "bg-energy-yellow",
};

export function EnergyBadge({
  color,
  amount,
  size = "sm",
}: {
  color: EnergyColor;
  amount?: number;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "md" ? "w-6 h-6 text-xs" : "w-4 h-4 text-[10px]";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${COLOR_MAP[color]} ${sizeClass} text-white font-bold shrink-0`}
      title={color}
    >
      {amount !== undefined && amount > 1 ? amount : ""}
    </span>
  );
}

export function EnergyCostDisplay({
  cost,
}: {
  cost: { color: EnergyColor; amount: number }[];
}) {
  if (cost.length === 0)
    return <span className="text-gray-500 text-xs">No cost</span>;
  return (
    <span className="inline-flex gap-0.5 items-center">
      {cost.map((c, i) =>
        Array.from({ length: c.amount }).map((_, j) => (
          <EnergyBadge key={`${i}-${j}`} color={c.color} />
        ))
      )}
    </span>
  );
}
