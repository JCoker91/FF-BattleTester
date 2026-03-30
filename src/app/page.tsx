"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

export default function Home() {
  const { skills, characters } = useStore();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">FF Battler Playtester</h1>
      <p className="text-gray-400 max-w-xl">
        A prototyping tool for your 5v5 turn-based battler. Create skills and
        characters, assign abilities, then test formations on the battlefield.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/skills"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-6 hover:border-gray-600 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-1">Skills</h2>
          <p className="text-sm text-gray-400">
            {skills.length} skill{skills.length !== 1 && "s"} created
          </p>
        </Link>
        <Link
          href="/characters"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-6 hover:border-gray-600 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-1">Characters</h2>
          <p className="text-sm text-gray-400">
            {characters.length} character{characters.length !== 1 && "s"}{" "}
            created
          </p>
        </Link>
        <Link
          href="/battlefield"
          className="block rounded-lg border border-gray-800 bg-gray-900 p-6 hover:border-gray-600 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-1">Battlefield</h2>
          <p className="text-sm text-gray-400">
            Drag & drop characters onto the grid
          </p>
        </Link>
      </div>
    </div>
  );
}
