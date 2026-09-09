import { MousePointer2, ImagePlus, Trash2, Type, Download, Wand2 } from "lucide-react";
import { motion } from "framer-motion";
import { ShortcutsButton } from "./ShortcutsPanel";

interface Props {
  tool: "select" | "upload" | "text";
  onToolChange: (tool: "select" | "upload" | "text") => void;
  onUpload: () => void;
  selectedId: string | null;
  selectedType: string | null;
  onDelete: () => void;
  onDownload: () => void;
  onAiGenerate?: () => void;
}

export function FloatingDock({ tool, onToolChange, onUpload, selectedId, selectedType, onDelete, onDownload, onAiGenerate }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-card/90 px-2 py-1.5 shadow-lg backdrop-blur-md"
    >
      <DockButton
        icon={<MousePointer2 className="h-4 w-4" />}
        label="Select"
        active={tool === "select"}
        onClick={() => onToolChange("select")}
      />
      <DockButton
        icon={<Type className="h-4 w-4" />}
        label="Text"
        active={tool === "text"}
        onClick={() => onToolChange("text")}
      />
      <DockButton
        icon={<ImagePlus className="h-4 w-4" />}
        label="Upload"
        active={false}
        onClick={onUpload}
      />

      <div className="mx-1 h-5 w-px bg-border" />
      <ShortcutsButton />

      {selectedId && (
        <>
          <div className="mx-1 h-5 w-px bg-border" />
          {selectedType === "image" && (
            <>
              <DockButton
                icon={<Wand2 className="h-4 w-4" />}
                label="AI Generate"
                active={false}
                onClick={() => onAiGenerate?.()}
              />
              <DockButton
                icon={<Download className="h-4 w-4" />}
                label="Download"
                active={false}
                onClick={onDownload}
              />
            </>
          )}
          <DockButton
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete"
            active={false}
            onClick={onDelete}
            destructive
          />
        </>
      )}
    </motion.div>
  );
}

function DockButton({
  icon,
  label,
  active,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : destructive
            ? "text-destructive hover:bg-destructive/10"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {icon}
    </button>
  );
}
