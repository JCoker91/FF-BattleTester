"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Character } from "@/lib/types";
import { CharacterForm } from "@/components/CharacterForm";
import { EnergyBadge } from "@/components/EnergyBadge";

function CharacterCard({ char }: { char: Character }) {
  return (
    <Link
      href={`/characters/${char.id}`}
      className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-600 transition-colors"
    >
      {char.photoUrl ? (
        <img
          src={char.photoUrl}
          alt={char.name}
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
          {char.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white truncate">
            {char.name}
          </span>
          <span className="text-xs text-gray-500 shrink-0">{char.type}</span>
        </div>
        {char.summary && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {char.summary}
          </p>
        )}
      </div>
      <div className="flex gap-0.5 shrink-0">
        {char.energyGeneration.map((eg) =>
          Array.from({ length: eg.amount }).map((_, j) => (
            <EnergyBadge key={`${eg.color}-${j}`} color={eg.color} />
          ))
        )}
      </div>
    </Link>
  );
}

export default function CharactersPage() {
  const { characters, seriesList, addCharacter } = useStore();
  const [creating, setCreating] = useState(false);

  const groupedCharacters = useMemo(() => {
    const groups: { seriesName: string; chars: Character[] }[] = [];

    for (const s of seriesList) {
      const chars = characters.filter((c) => c.series === s.name);
      if (chars.length > 0) {
        groups.push({ seriesName: s.name, chars });
      }
    }

    const unassigned = characters.filter(
      (c) => !c.series || !seriesList.some((s) => s.name === c.series)
    );
    if (unassigned.length > 0) {
      groups.push({ seriesName: "", chars: unassigned });
    }

    return groups;
  }, [characters, seriesList]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Characters</h1>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium"
          >
            + New Character
          </button>
        )}
      </div>

      {creating && (
        <CharacterForm
          availableSeries={seriesList}
          onSave={(data) => {
            addCharacter(data);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {characters.length === 0 && !creating && (
        <p className="text-gray-500 text-sm">
          No characters yet. Create one to get started.
        </p>
      )}

      {groupedCharacters.map((group) => (
        <div key={group.seriesName || "__unassigned"} className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-800 pb-1">
            {group.seriesName || "Unassigned"}
          </h2>
          {group.chars.map((char) => (
            <CharacterCard key={char.id} char={char} />
          ))}
        </div>
      ))}
    </div>
  );
}
