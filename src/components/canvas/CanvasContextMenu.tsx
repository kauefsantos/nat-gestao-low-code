import { useEffect, useRef } from "react";
import { Copy, Download, ArrowUpToLine, ArrowDownToLine, Trash2 } from "lucide-react";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  itemId: string | null;
  itemType: string | null;
  hasImageUrl: boolean;
}

interface Props {
  menu: ContextMenuState;
  onClose: () => void;
  onDuplicate: (itemId: string) => void;
  onDownload: (itemId: string) => void;
  onBringToFront: (itemId: string) => void;
  onSendToBack: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

export function CanvasContextMenu({ menu, onClose, onDuplicate, onDownload, onBringToFront, onSendToBack, onDelete }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu.visible) return;
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") { onClose(); return; }
      if (e instanceof MouseEvent && ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [menu.visible, onClose]);

  if (!menu.visible || !menu.itemId) return null;

  const itemId = menu.itemId;

  const actions = [
    { label: "Duplicate", icon: Copy, action: () => onDuplicate(itemId) },
    ...(menu.hasImageUrl
      ? [{ label: "Download", icon: Download, action: () => onDownload(itemId) }]
      : []),
    { label: "Bring to Front", icon: ArrowUpToLine, action: () => onBringToFront(itemId) },
    { label: "Send to Back", icon: ArrowDownToLine, action: () => onSendToBack(itemId) },
    { label: "Delete", icon: Trash2, action: () => onDelete(itemId), destructive: true },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
    >
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={() => { a.action(); onClose(); }}
          className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors ${
            (a as any).destructive
              ? "text-destructive hover:bg-destructive/10"
              : "text-popover-foreground hover:bg-accent"
          }`}
        >
          <a.icon className="h-3.5 w-3.5" />
          {a.label}
        </button>
      ))}
    </div>
  );
}
