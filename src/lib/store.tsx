"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Character, Skill, CharacterSkill, Team, Form, GlossaryEntry, SkillTemplate, TemplateAction, StatusEffect, EffectTagType } from "./types";

interface Series {
  id: string;
  name: string;
}

interface GameStore {
  skills: Skill[];
  characters: Character[];
  teams: Team[];
  forms: Form[];
  seriesList: Series[];
  addSkill: (skill: Omit<Skill, "id">) => Promise<Skill>;
  updateSkill: (skill: Skill) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  addCharacter: (character: Omit<Character, "id">) => Promise<Character>;
  updateCharacter: (character: Character) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  getSkill: (id: string) => Skill | undefined;
  getCharacter: (id: string) => Character | undefined;
  getFormsForCharacter: (characterId: string) => Form[];
  updateTeam: (team: Team) => Promise<void>;
  resetTeams: () => Promise<void>;
  addForm: (characterId: string, name: string) => Promise<Form>;
  updateForm: (id: string, data: { name: string; photoUrl?: string | null; typeOverride?: string | null; energyOverride?: { color: string; amount: number }[] | null; statOverrides?: Record<string, number> | null; elementalResOverride?: Record<string, number> | null; elementalDmgOverride?: Record<string, number> | null; statusResistanceOverride?: Record<string, number> | null; summary?: string | null }) => Promise<void>;
  deleteForm: (id: string) => Promise<void>;
  reorderForms: (characterId: string, orderedIds: string[]) => Promise<void>;
  addSeries: (name: string) => Promise<Series>;
  updateSeries: (id: string, name: string) => Promise<void>;
  deleteSeries: (id: string) => Promise<void>;
  reorderSeries: (orderedIds: string[]) => Promise<void>;
  glossary: GlossaryEntry[];
  addGlossary: (data: Omit<GlossaryEntry, "id">) => Promise<GlossaryEntry>;
  updateGlossary: (entry: GlossaryEntry) => Promise<void>;
  deleteGlossary: (id: string) => Promise<void>;
  templates: SkillTemplate[];
  templateActions: TemplateAction[];
  addTemplate: (data: Omit<SkillTemplate, "id">) => Promise<SkillTemplate>;
  updateTemplate: (t: SkillTemplate) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  addTemplateAction: (templateId: string, skillId: string) => Promise<TemplateAction>;
  updateTemplateAction: (action: TemplateAction) => Promise<void>;
  deleteTemplateAction: (id: string) => Promise<void>;
  getTemplateActions: (templateId: string) => TemplateAction[];
  characterSkills: CharacterSkill[];
  addCharacterSkill: (data: Omit<CharacterSkill, "id">) => Promise<CharacterSkill>;
  updateCharacterSkill: (cs: CharacterSkill) => Promise<void>;
  deleteCharacterSkill: (id: string) => Promise<void>;
  getCharacterSkills: (characterId: string) => CharacterSkill[];
  statusEffects: StatusEffect[];
  addStatusEffect: (data: Omit<StatusEffect, "id">) => Promise<StatusEffect>;
  updateStatusEffect: (effect: StatusEffect) => Promise<void>;
  deleteStatusEffect: (id: string) => Promise<void>;
  effectTagTypes: EffectTagType[];
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
  const [forms, setForms] = useState<Form[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [templates, setTemplates] = useState<SkillTemplate[]>([]);
  const [templateActions, setTemplateActions] = useState<TemplateAction[]>([]);
  const [characterSkills, setCharacterSkills] = useState<CharacterSkill[]>([]);
  const [statusEffects, setStatusEffects] = useState<StatusEffect[]>([]);
  const [effectTagTypes, setEffectTagTypes] = useState<EffectTagType[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/skills").then((r) => r.json()),
      fetch("/api/characters").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
      fetch("/api/series").then((r) => r.json()),
      fetch("/api/forms").then((r) => r.json()),
      fetch("/api/glossary").then((r) => r.json()),
      fetch("/api/templates").then((r) => r.json()),
      fetch("/api/character-skills").then((r) => r.json()),
      fetch("/api/status-effects").then((r) => r.json()),
      fetch("/api/effect-tag-types").then((r) => r.json()),
    ]).then(([s, c, t, sr, f, g, tmpl, cs, se, ett]) => {
      setSkills(s);
      setCharacters(sortByName(c));
      setTeams(t);
      setSeriesList(sr);
      setForms(f);
      setGlossary(g);
      setTemplates(tmpl);
      setCharacterSkills(cs);
      setStatusEffects(se);
      setEffectTagTypes(ett);
      // Load all template actions
      if (tmpl.length > 0) {
        Promise.all(
          tmpl.map((tp: SkillTemplate) => fetch(`/api/templates/${tp.id}/actions`).then((r) => r.json()))
        ).then((allActions: TemplateAction[][]) => {
          setTemplateActions(allActions.flat());
        });
      }
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
    setCharacterSkills((prev) => prev.filter((cs) => cs.skillId !== id));
    setTemplateActions((prev) => prev.filter((ta) => ta.skillId !== id));
    // Remove from loadouts
    setCharacters((prev) =>
      prev.map((c) => {
        const lo = c.equippedLoadout;
        if (lo.innateId === id || lo.basicId === id || lo.abilityIds.includes(id)) {
          return {
            ...c,
            equippedLoadout: {
              innateId: lo.innateId === id ? null : lo.innateId,
              basicId: lo.basicId === id ? null : lo.basicId,
              abilityIds: lo.abilityIds.filter((s) => s !== id),
            },
          };
        }
        return c;
      })
    );
  }, []);

  const addCharacter = useCallback(async (data: Omit<Character, "id">) => {
    const res = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const { character, form } = (await res.json()) as { character: Character; form: Form };
    setCharacters((prev) => sortByName([...prev, character]));
    setForms((prev) => [...prev, form]);
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
    setCharacterSkills((prev) => prev.filter((cs) => cs.characterId !== id));
    setForms((prev) => prev.filter((f) => f.characterId !== id));
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

  const getFormsForCharacter = useCallback(
    (characterId: string) =>
      forms
        .filter((f) => f.characterId === characterId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [forms]
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

  // --- Forms ---

  const addForm = useCallback(async (characterId: string, name: string) => {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId, name }),
    });
    const form: Form = await res.json();
    setForms((prev) => [...prev, form]);
    return form;
  }, []);

  const updateForm = useCallback(async (id: string, data: { name: string; photoUrl?: string | null; typeOverride?: string | null; energyOverride?: { color: string; amount: number }[] | null; statOverrides?: Record<string, number> | null; elementalResOverride?: Record<string, number> | null; elementalDmgOverride?: Record<string, number> | null; summary?: string | null }) => {
    await fetch(`/api/forms/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setForms((prev) => prev.map((f) => (f.id === id ? {
      ...f,
      name: data.name,
      photoUrl: data.photoUrl ?? undefined,
      typeOverride: (data.typeOverride as Form["typeOverride"]) ?? undefined,
      energyOverride: data.energyOverride as Form["energyOverride"] ?? undefined,
      statOverrides: data.statOverrides as Form["statOverrides"] ?? undefined,
      elementalResOverride: data.elementalResOverride as Form["elementalResOverride"] ?? undefined,
      elementalDmgOverride: data.elementalDmgOverride as Form["elementalDmgOverride"] ?? undefined,
      summary: data.summary ?? undefined,
    } : f)));
  }, []);

  const deleteForm = useCallback(async (id: string) => {
    const res = await fetch(`/api/forms/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    const form = forms.find((f) => f.id === id);
    setForms((prev) => prev.filter((f) => f.id !== id));
    // Remove loadout entry and detach skills from this form
    if (form) {
      // Clear form references from character skill assignments
      setCharacterSkills((prev) =>
        prev.map((cs) => (cs.formId === id ? { ...cs, formId: null } : cs))
      );
    }
  }, [forms]);

  const reorderForms = useCallback(async (characterId: string, orderedIds: string[]) => {
    const res = await fetch("/api/forms/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId, orderedIds }),
    });
    const updated: Form[] = await res.json();
    setForms((prev) => {
      const others = prev.filter((f) => f.characterId !== characterId);
      return [...others, ...updated];
    });
  }, []);

  // --- Series ---

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
        prev.map((c) => (c.series === series.name ? { ...c, series: "" } : c))
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

  // --- Glossary ---

  const addGlossary = useCallback(async (data: Omit<GlossaryEntry, "id">) => {
    const res = await fetch("/api/glossary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const entry: GlossaryEntry = await res.json();
    setGlossary((prev) => [...prev, entry].sort((a, b) => a.keyword.localeCompare(b.keyword)));
    return entry;
  }, []);

  const updateGlossary = useCallback(async (entry: GlossaryEntry) => {
    await fetch(`/api/glossary/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    setGlossary((prev) =>
      prev.map((g) => (g.id === entry.id ? entry : g)).sort((a, b) => a.keyword.localeCompare(b.keyword))
    );
  }, []);

  const deleteGlossary = useCallback(async (id: string) => {
    await fetch(`/api/glossary/${id}`, { method: "DELETE" });
    setGlossary((prev) => prev.filter((g) => g.id !== id));
  }, []);

  // --- Templates ---

  const addTemplate = useCallback(async (data: Omit<SkillTemplate, "id">) => {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const template: SkillTemplate = await res.json();
    setTemplates((prev) => [...prev, template]);
    return template;
  }, []);

  const updateTemplate = useCallback(async (t: SkillTemplate) => {
    await fetch(`/api/templates/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    setTemplates((prev) => prev.map((tp) => (tp.id === t.id ? t : tp)));
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((tp) => tp.id !== id));
    setTemplateActions((prev) => prev.filter((a) => a.templateId !== id));
    setSkills((prev) => prev.map((s) => {
      const hasRef = s.levels.some((lv) => lv.templateId === id);
      if (!hasRef) return s;
      return { ...s, levels: s.levels.map((lv) => lv.templateId === id ? { ...lv, templateId: null } : lv) as [typeof s.levels[0], typeof s.levels[1], typeof s.levels[2]] };
    }));
  }, []);

  const addTemplateAction = useCallback(async (templateId: string, skillId: string) => {
    const res = await fetch(`/api/templates/${templateId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId, sortOrder: templateActions.filter((a) => a.templateId === templateId).length }),
    });
    const action: TemplateAction = await res.json();
    setTemplateActions((prev) => [...prev, action]);
    return action;
  }, [templateActions]);

  const updateTemplateAction = useCallback(async (action: TemplateAction) => {
    await fetch(`/api/template-actions/${action.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    setTemplateActions((prev) => prev.map((a) => (a.id === action.id ? action : a)));
  }, []);

  const deleteTemplateAction = useCallback(async (id: string) => {
    await fetch(`/api/template-actions/${id}`, { method: "DELETE" });
    setTemplateActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const getTemplateActions = useCallback(
    (templateId: string) => templateActions.filter((a) => a.templateId === templateId).sort((a, b) => a.sortOrder - b.sortOrder),
    [templateActions]
  );

  // --- Character Skills ---

  const addCharacterSkill = useCallback(async (data: Omit<CharacterSkill, "id">) => {
    const res = await fetch("/api/character-skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const cs: CharacterSkill = await res.json();
    setCharacterSkills((prev) => [...prev, cs]);
    return cs;
  }, []);

  const updateCharacterSkill = useCallback(async (cs: CharacterSkill) => {
    await fetch(`/api/character-skills/${cs.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cs),
    });
    setCharacterSkills((prev) => prev.map((c) => (c.id === cs.id ? cs : c)));
  }, []);

  const deleteCharacterSkill = useCallback(async (id: string) => {
    await fetch(`/api/character-skills/${id}`, { method: "DELETE" });
    setCharacterSkills((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const getCharacterSkills = useCallback(
    (characterId: string) => characterSkills.filter((cs) => cs.characterId === characterId),
    [characterSkills]
  );

  const addStatusEffect = useCallback(async (data: Omit<StatusEffect, "id">) => {
    const res = await fetch("/api/status-effects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const effect = await res.json();
    setStatusEffects((prev) => [...prev, effect]);
    return effect;
  }, []);

  const updateStatusEffect = useCallback(async (effect: StatusEffect) => {
    await fetch(`/api/status-effects/${effect.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(effect) });
    setStatusEffects((prev) => prev.map((e) => (e.id === effect.id ? effect : e)));
  }, []);

  const deleteStatusEffect = useCallback(async (id: string) => {
    await fetch(`/api/status-effects/${id}`, { method: "DELETE" });
    setStatusEffects((prev) => prev.filter((e) => e.id !== id));
  }, []);

  if (!loaded) return null;

  return (
    <StoreContext.Provider
      value={{
        skills,
        characters,
        teams,
        forms,
        addSkill,
        updateSkill,
        deleteSkill,
        addCharacter,
        updateCharacter,
        deleteCharacter,
        getSkill,
        getCharacter,
        getFormsForCharacter,
        updateTeam,
        resetTeams,
        addForm,
        updateForm,
        deleteForm,
        reorderForms,
        seriesList,
        addSeries,
        updateSeries,
        deleteSeries,
        reorderSeries,
        glossary,
        addGlossary,
        updateGlossary,
        deleteGlossary,
        templates,
        templateActions,
        addTemplate,
        updateTemplate,
        deleteTemplate,
        addTemplateAction,
        updateTemplateAction,
        deleteTemplateAction,
        getTemplateActions,
        characterSkills,
        addCharacterSkill,
        updateCharacterSkill,
        deleteCharacterSkill,
        getCharacterSkills,
        statusEffects,
        addStatusEffect,
        updateStatusEffect,
        deleteStatusEffect,
        effectTagTypes,
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
