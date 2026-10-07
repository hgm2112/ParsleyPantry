"use client";

import { useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DndContextProps,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Local drag order for a list of `{ id }` rows. The working copy stays valid
 * while the row set is unchanged (renames are fine); if rows are added or
 * removed the list falls back to the server-provided order. `save` runs on
 * drop and returns whether it succeeded — on failure the list snaps back to
 * the server order (the caller shows the toast).
 */
export function useRowReorder<T extends { id: string }>(
  rows: T[],
  save: (ids: string[]) => Promise<boolean>,
) {
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const serverIds = rows.map((row) => row.id);
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const isUsable = (order: string[] | null): order is string[] =>
    order !== null &&
    order.length === serverIds.length &&
    serverIds.every((id) => order.includes(id));

  const displayedIds = isUsable(dragOrder) ? dragOrder : serverIds;
  const displayed = displayedIds
    .map((id) => rowById.get(id))
    .filter((row): row is T => row !== undefined);

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setDragOrder((prev) => {
      const list = isUsable(prev) ? prev : serverIds;
      const from = list.indexOf(activeId);
      const to = list.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return prev;
      return arrayMove(list, from, to);
    });
  }

  async function onDragEnd(event: DragEndEvent) {
    void event;
    const next = dragOrder;
    if (!next) return;
    const ok = await save(next);
    if (!ok) {
      setDragOrder(null);
      return;
    }
    // Keep the local order; the refreshed props arrive in the same order.
  }

  function onDragCancel() {
    setDragOrder(null);
  }

  const dndProps: DndContextProps = {
    sensors,
    collisionDetection: closestCenter,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };

  // Call after non-drag mutations (move buttons, adds, deletes) so a kept
  // drag order can't shadow the refreshed server order.
  const reset = () => setDragOrder(null);

  return { displayed, ids: displayedIds, dndProps, reset };
}

export function SortableRow({
  id,
  children,
  draggable = true,
  dragLabel,
  className,
}: {
  id: string;
  children: React.ReactNode;
  draggable?: boolean;
  dragLabel: string;
  className?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !draggable });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2",
        isDragging && "relative z-10 bg-background shadow-md",
        className,
      )}
    >
      {draggable ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className="-ml-1 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-label={dragLabel}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      {children}
    </li>
  );
}

export function SortableList({
  ids,
  dndProps,
  children,
  className,
}: {
  ids: string[];
  dndProps: DndContextProps;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DndContext {...dndProps}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={className}>{children}</ol>
      </SortableContext>
    </DndContext>
  );
}
