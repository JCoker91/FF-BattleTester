"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Character, Skill, Team } from "./types";

interface Series {
  id: string;
  name: string;
}

interface GameStore {
  skills: Skill[];
  characters: Character[];
  teams: Team[];
  seriesList: Series[];
  addSkill: (skill: Omit<Skill, "id">) => Promise<Skill>;
  updateSkill: (skill: Skill) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  addCharacter: (character: Omit<Character, "id">) => Promise<Character>;
  updateCharacter: (character: Character) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  getSkill: (id: string) => Skill | undefined;
  getCharacter: (id: string) => Character | undefined;
  updateTeam: (team: Team) => Promise<void>;
  resetTeams: () => Promise<void>;
  addSeries: (name: string) => Promise<Series>;
  updateSeries: (id: string, name: string) => Promise<void>;
  deleteSeries: (id: string) => Promise<void>;
  reorderSeries: (orderedIds: string[]) => Promise<void>;
}

const StoreContext = createContext<GameStore | null>(null);

const DEFAULT_TEAMS: Team[] = [
  { id: "team-left", name: "Team A", side: "left", placements: [] },
  { id: "team-right", name: "Team B", side: "right", placements: [] },
];

const sortByName = <T extends { name: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.name.localeCompare(b.name));

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [teams, setTeams] = useState<Team[]>(DEFAULT_TEAMS);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/skills").then((r) => r.json()),
      fetch("/api/characters").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
      fetch("/api/series").then((r) => r.json()),
    ]).then(([s, c, t, sr]) => {
      setSkills(s);
      setCharacters(sortByName(c));
      setTeams(t);
      setSeriesList(sr);
      setLoaded(true);
    });
  }, []);

  const addSkill = useCallback(async (data: Omit<Skill, "id">) => {
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const skill: Skill = await res.json();
    setSkills((prev) => [...prev, skill]);
    return skill;
  }, []);

  const updateSkill = useCallback(async (skill: Skill) => {
    await fetch(`/api/skills/${skill.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skill),
    });
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? skill : s)));
  }, []);

  const deleteSkill = useCallback(async (id: string) => {
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    setSkills((prev) => prev.filter((s) => s.id !== id));
    setCharacters((prev) =>
      prev.map((c) => ({
        ...c,
        equippedInnateId: c.equippedInnateId === id ? null : c.equippedInnateId,
        equippedBasicId: c.equippedBasicId === id ? null : c.equippedBasicId,
        equippedAbilityIds: c.equippedAbilityIds.filter((sid) => sid !== id),
      }))
    );
  }, []);

  const addCharacter = useCallback(async (data: Omit<Character, "id">) => {
    const res = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const character: Character = await res.json();
    setCharacters((prev) => sortByName([...prev, character]));
    return character;
  }, []);

  const updateCharacter = useCallback(async (character: Character) => {
    await fetch(`/api/characters/${character.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character),
    });
    setCharacters((prev) =>
      sortByName(prev.map((c) => (c.id === character.id ? character : c)))
    );
  }, []);

  const deleteCharacter = useCallback(async (id: string) => {
    await fetch(`/api/characters/${id}`, { method: "DELETE" });
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    setSkills((prev) => prev.filter((s) => s.characterId !== id));
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        placements: t.placements.filter((p) => p.characterId !== id),
      }))
    );
  }, []);

  const getSkill = useCallback(
    (id: string) => skills.find((s) => s.id === id),
    [skills]
  );

  const getCharacter = useCallback(
    (id: string) => characters.find((c) => c.id === id),
    [characters]
  );

  const updateTeam = useCallback(async (team: Team) => {
    await fetch(`/api/teams/${team.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(team),
    });
    setTeams((prev) => prev.map((t) => (t.id === team.id ? team : t)));
  }, []);

  const resetTeams = useCallback(async () => {
    const res = await fetch("/api/teams/reset", { method: "POST" });
    const t: Team[] = await res.json();
    setTeams(t);
  }, []);

  const addSeries = useCallback(async (name: string) => {
    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const series: Series = await res.json();
    setSeriesList((prev) => [...prev, series]);
    return series;
  }, []);

  const updateSeries = useCallback(async (id: string, name: string) => {
    await fetch(`/api/series/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSeriesList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name } : s))
    );
  }, []);

  const deleteSeries = useCallback(async (id: string) => {
    const series = seriesList.find((s) => s.id === id);
    await fetch(`/api/series/${id}`, { method: "DELETE" });
    setSeriesList((prev) => prev.filter((s) => s.id !== id));
    if (series) {
      setCharacters((prev) =>
        prev.map((c) =>
          c.series === series.name ? { ...c, series: "" } : c
        )
      );
    }
  }, [seriesList]);

  const reorderSeries = useCallback(async (orderedIds: string[]) => {
    const res = await fetch("/api/series/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    const updated: Series[] = await res.json();
    setSeriesList(updated);
  }, []);

  if (!loaded) return null;

  return (
    <StoreContext.Provider
      value={{
        skills,
        characters,
        teams,
        addSkill,
        updateSkill,
        deleteSkill,
        addCharacter,
        updateCharacter,
        deleteCharacter,
        getSkill,
        getCharacter,
        updateTeam,
        resetTeams,
        seriesList,
        addSeries,
        updateSeries,
        deleteSeries,
        reorderSeries,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): GameStore {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
