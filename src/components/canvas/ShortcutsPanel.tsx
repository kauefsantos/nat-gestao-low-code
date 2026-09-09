import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Lightbulb } from "lucide-react";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl";

const shortcuts = [
  { keys: `${mod} + C`, desc: "Copy selected item" },
  { keys: `${mod} + V`, desc: "Paste item" },
  { keys: `${mod} + Z`, desc: "Undo last action" },
  { keys: "Delete / Backspace", desc: "Delete selected item" },
  { keys: "Scroll wheel", desc: "Zoom in / out" },
  { keys: "Click + drag canvas", desc: "Pan around" },
  { keys: "Click item", desc: "Select item" },
  { keys: "Drag item", desc: "Move item" },
  { keys: "Drag handles", desc: "Resize item" },
  { keys: "Corner handle", desc: "Rotate item" },
  { keys: "Double-click text", desc: "Edit text" },
];

export function ShortcutsButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Shortcuts"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Lightbulb className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        className="w-72 p-3"
      >
        <p className="mb-2 text-xs font-semibold text-foreground">Keyboard shortcuts</p>
        <div className="flex flex-col gap-1.5">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">{s.desc}</span>
              <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
