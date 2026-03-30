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

export default function ConfigPage() {
  const {
    seriesList,
    addSeries,
    updateSeries,
    deleteSeries,
    reorderSeries,
  } = useStore();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Config</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-300">Series</h2>

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
      </section>
    </div>
  );
}
