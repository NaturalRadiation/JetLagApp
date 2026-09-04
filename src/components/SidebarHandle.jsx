// the strip at the top of the mobile bottom sheet: a grab pill + a one-line
// summary. a plain tap toggles open/closed; dragging it up or down (mouse or
// touch, via pointer events) drags the sheet with the finger and snaps to
// whichever state it's closer to on release.
import { useRef } from "react";

// px of the sheet left visible when collapsed — must match the 56px baked
// into .sidebar-handle / the translateY calc() in styles.css
const COLLAPSED_PX = 56;
const DRAG_THRESHOLD_PX = 6; // ignore jitter smaller than this — treat as a tap

export function SidebarHandle({ open, onSetOpen, summary }) {
  const dragRef = useRef(null);

  function handlePointerDown(e) {
    const sheet = e.currentTarget.closest(".sidebar");
    if (!sheet) return;
    const sheetHeight = sheet.getBoundingClientRect().height;
    dragRef.current = {
      sheet,
      startY: e.clientY,
      baseOffset: open ? 0 : sheetHeight - COLLAPSED_PX,
      maxOffset: sheetHeight - COLLAPSED_PX,
      moved: false,
      lastPx: null,
    };
    sheet.style.transition = "none";
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone (e.g. cancelled between down and here) — the drag
         still works via document-level move/up, this just keeps it captured
         when the finger strays outside the handle */
    }
  }

  function handlePointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const next = Math.min(drag.maxOffset, Math.max(0, drag.baseOffset + delta));
    drag.lastPx = next;
    drag.sheet.style.transform = `translateY(${next}px)`;
  }

  function endDrag({ commit }) {
    const drag = dragRef.current;
    if (!drag) return;
    drag.sheet.style.transition = "";
    drag.sheet.style.transform = "";
    dragRef.current = null;
    if (!commit) return; // cancelled — snap back to whatever it already was
    if (!drag.moved) {
      onSetOpen(!open); // plain tap
      return;
    }
    onSetOpen((drag.lastPx ?? drag.baseOffset) < drag.maxOffset * 0.5);
  }

  return (
    <div
      className="sidebar-handle"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => endDrag({ commit: true })}
      onPointerCancel={() => endDrag({ commit: false })}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={open ? "Collapse questions panel" : "Expand questions panel"}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSetOpen(!open);
        }
      }}
    >
      <span className="sidebar-handle-grip" aria-hidden="true" />
      <span className="sidebar-handle-summary">{summary}</span>
    </div>
  );
}
