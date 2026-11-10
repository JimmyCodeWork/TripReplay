import { type PointerEvent as ReactPointerEvent, useState } from "react";

/** Where a dragged item would go, and the row beside which the place is marked. */
interface Drop {
  readonly position: number;
  readonly overId: string;
  readonly side: "before" | "after";
}

/**
 * Reordering a list by dragging a handle, with a mouse, pen or finger. Rows carry
 * `data-drag-item` with their id; the row under the pointer decides the place, its upper half
 * before it and its lower half after it. `onMove` gets the position among the other items.
 */
export function useDragReorder(ids: readonly string[], onMove: (id: string, position: number) => void) {
  const [drag, setDrag] = useState<{ readonly id: string; readonly drop?: Drop } | undefined>();

  const dropAt = (event: ReactPointerEvent, id: string): Drop | undefined => {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-drag-item]");
    const overId = row?.dataset.dragItem;
    if (!row || !overId || overId === id || !ids.includes(overId)) return undefined;
    const box = row.getBoundingClientRect();
    const side = event.clientY < box.top + box.height / 2 ? "before" : "after";
    const index = ids.filter((other) => other !== id).indexOf(overId);
    return { position: side === "before" ? index : index + 1, overId, side };
  };

  const handle = (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic pointer cannot be captured; the drag still follows the events it gets.
      }
      setDrag({ id });
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (drag?.id !== id) return;
      const drop = dropAt(event, id);
      setDrag(drop ? { id, drop } : { id });
    },
    onPointerUp: () => {
      const drop = drag?.drop;
      setDrag(undefined);
      if (drag && drop && drop.position !== ids.indexOf(drag.id)) onMove(drag.id, drop.position);
    },
    onPointerCancel: () => setDrag(undefined),
  });

  return {
    handle,
    /** The item being dragged, if any. */
    dragging: drag?.id,
    /** Where the place is marked: before or after this item, or nowhere. */
    markOf: (id: string) => (drag?.drop?.overId === id ? drag.drop.side : undefined),
  };
}
