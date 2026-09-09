import { useState, useRef, useCallback, useEffect } from "react";
import { Stage, Layer } from "react-konva";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { CanvasImage } from "./CanvasImage";
import { CanvasText } from "./CanvasText";
import { DotGrid } from "./DotGrid";
import { FloatingDock } from "./FloatingDock";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { AiPromptOverlay } from "./AiPromptOverlay";

import { useUndoStack, type UndoAction } from "@/hooks/use-undo-stack";

interface BoardItem {
  id: string;
  board_id: string;
  type: string;
  image_url: string | null;
  source_url: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  notes: string | null;
  tags: string[] | null;
  metadata: any;
  created_at: string;
}

interface Board {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  board: Board;
  items: BoardItem[];
  onTitleChange: (title: string) => void;
}

export function CanvasWorkspace({ board, items, onTitleChange }: Props) {
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "upload" | "text">("select");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(board.title);
  const stageRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const queryClient = useQueryClient();
  const { push: pushUndo, pop: popUndo } = useUndoStack();
  const clipboardRef = useRef<BoardItem | null>(null);
  const [aiPrompt, setAiPrompt] = useState<{ itemId: string | null } | null>(null);

  // Spacebar pan state
  const isSpaceDownRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean; x: number; y: number; itemId: string | null; itemType: string | null; hasImageUrl: boolean;
  }>({ visible: false, x: 0, y: 0, itemId: null, itemType: null, hasImageUrl: false });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ width, height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Spacebar pan listeners
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isSpaceDownRef.current) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        isSpaceDownRef.current = true;
        setIsPanning(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceDownRef.current = false;
        setIsPanning(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);


  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.08;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(Math.max(oldScale * Math.pow(scaleBy, direction), 0.1), 5);
    setStageScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, []);

  // Save item position/size
  const updateItem = useMutation({
    mutationFn: async (updates: Partial<BoardItem> & { id: string }) => {
      const { id, ...data } = updates;
      const { error } = await supabase.from("board_items").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-items", board.id] });
    },
  });

  // Add item (image or text)
  const addItem = useMutation({
    mutationFn: async (item: { type?: string; image_url?: string; source_url?: string; width: number; height: number; x?: number; y?: number; metadata?: any }) => {
      const centerX = item.x ?? (-stagePos.x + stageSize.width / 2) / stageScale - item.width / 2;
      const centerY = item.y ?? (-stagePos.y + stageSize.height / 2) / stageScale - item.height / 2;
      const maxZ = items.length > 0 ? Math.max(...items.map((i) => i.z_index)) + 1 : 0;

      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.from("board_items").insert({
        board_id: board.id,
        type: item.type || "image",
        image_url: item.image_url || null,
        source_url: item.source_url || null,
        x: centerX,
        y: centerY,
        width: item.width,
        height: item.height,
        z_index: maxZ,
        user_id: session?.user?.id,
        metadata: item.metadata || {},
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data) pushUndo({ type: "add", itemId: data.id });
      queryClient.invalidateQueries({ queryKey: ["board-items", board.id] });
    },
  });

  // Delete item (with undo tracking)
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const deletedItem = items.find((i) => i.id === id);
      const { error } = await supabase.from("board_items").delete().eq("id", id);
      if (error) throw error;
      return deletedItem;
    },
    onSuccess: (deletedItem) => {
      if (deletedItem) pushUndo({ type: "delete", item: deletedItem });
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["board-items", board.id] });
    },
  });

  // File upload handler
  const handleFileUpload = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop();
      const path = `${board.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("board-images")
        .upload(path, file);

      if (uploadError) {
        toast.error("Upload failed");
        return;
      }

      // Get a signed URL (bucket is private)
      const { data: signedData, error: signError } = await supabase.storage
        .from("board-images")
        .createSignedUrl(path, 3600); // 1 hour

      if (signError || !signedData?.signedUrl) {
        toast.error("Failed to get image URL");
        return;
      }

      const imageUrl = signedData.signedUrl;

      // Get image dimensions
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 400;
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
        addItem.mutate({
          image_url: imageUrl,
          width: img.width * ratio,
          height: img.height * ratio,
        });
      };
      img.src = imageUrl;
    },
    [board.id, addItem]
  );



  // Handle stage click — deselect or create text
  const handleStageClick = (e: any) => {
    if (contextMenu.visible) { setContextMenu((m) => ({ ...m, visible: false })); return; }
    if (isPanning) return;
    const isBackground = e.target === e.target.getStage() || e.target.attrs.name === "dot-grid";
    if (!isBackground) return;

    if (tool === "text") {
      const stage = stageRef.current;
      const pointer = stage.getPointerPosition();
      const x = (pointer.x - stagePos.x) / stageScale;
      const y = (pointer.y - stagePos.y) / stageScale;
      addItem.mutate({
        type: "text",
        width: 200,
        height: 30,
        x,
        y,
        metadata: { text: "Text" },
      });
      setTool("select");
      return;
    }

    setSelectedId(null);
  };

  // Right-click context menu on items
  const handleItemContextMenu = useCallback((e: any, item: BoardItem) => {
    e.evt.preventDefault();
    setSelectedId(item.id);
    setContextMenu({
      visible: true,
      x: e.evt.clientX,
      y: e.evt.clientY,
      itemId: item.id,
      itemType: item.type,
      hasImageUrl: !!item.image_url,
    });
  }, []);

  const handleContextDuplicate = useCallback((itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    addItem.mutate({
      type: item.type,
      image_url: item.image_url || undefined,
      source_url: item.source_url || undefined,
      width: item.width,
      height: item.height,
      x: item.x + 30,
      y: item.y + 30,
      metadata: item.metadata,
    });
  }, [items, addItem]);

  const handleContextDownload = useCallback((itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item?.image_url) return;
    const a = document.createElement("a");
    a.href = item.image_url;
    a.download = `image-${item.id.slice(0, 8)}.${item.image_url.split(".").pop()?.split("?")[0] || "png"}`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [items]);

  const handleContextBringToFront = useCallback((itemId: string) => {
    const maxZ = items.length > 0 ? Math.max(...items.map((i) => i.z_index)) : 0;
    updateItem.mutate({ id: itemId, z_index: maxZ + 1 });
  }, [items, updateItem]);

  const handleContextSendToBack = useCallback((itemId: string) => {
    const minZ = items.length > 0 ? Math.min(...items.map((i) => i.z_index)) : 0;
    updateItem.mutate({ id: itemId, z_index: minZ - 1 });
  }, [items, updateItem]);

  const handleContextDelete = useCallback((itemId: string) => {
    deleteItem.mutate(itemId);
  }, [deleteItem]);



  // Undo handler
  const handleUndo = useCallback(async () => {
    const action = popUndo();
    if (!action) return;

    if (action.type === "add") {
      await supabase.from("board_items").delete().eq("id", action.itemId);
      setSelectedId(null);
    } else if (action.type === "delete") {
      const { id, created_at, ...rest } = action.item;
      await supabase.from("board_items").insert(rest as any);
    } else if (action.type === "update") {
      await supabase.from("board_items").update(action.prev as any).eq("id", action.itemId);
    }

    queryClient.invalidateQueries({ queryKey: ["board-items", board.id] });
  }, [popUndo, board.id, queryClient]);

  // Keyboard shortcuts: delete, undo, copy, paste
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip shortcuts when typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (editingTitle) return;
      const mod = e.metaKey || e.ctrlKey;

      // Delete / Backspace
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteItem.mutate(selectedId);
        return;
      }

      // Ctrl+Z — undo
      if (mod && e.key === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+C — copy
      if (mod && e.key === "c" && selectedId) {
        const item = items.find((i) => i.id === selectedId);
        if (item) clipboardRef.current = item;
        return;
      }

      // Ctrl+V — paste
      if (mod && e.key === "v") {
        e.preventDefault();
        const clip = clipboardRef.current;
        if (clip) {
          addItem.mutate({
            type: clip.type,
            image_url: clip.image_url || undefined,
            source_url: clip.source_url || undefined,
            width: clip.width,
            height: clip.height,
            x: clip.x + 30,
            y: clip.y + 30,
            metadata: clip.metadata,
          });
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, editingTitle, deleteItem, handleUndo, items, addItem]);

  // Handle title submit
  const submitTitle = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== board.title) {
      onTitleChange(titleValue.trim());
    } else {
      setTitleValue(board.title);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden bg-background"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return;
        if (files.length > 10) {
          toast.error("You can drop a maximum of 10 images at once");
          return;
        }
        files.forEach((file) => handleFileUpload(file));
      }}
    >
      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center gap-3 px-4 py-3">
        <Link
          to="/dashboard"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {editingTitle ? (
          <input
            autoFocus
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={submitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTitle();
              if (e.key === "Escape") {
                setTitleValue(board.title);
                setEditingTitle(false);
              }
            }}
            className="rounded-md border border-primary/30 bg-card/80 px-2.5 py-1 text-sm font-medium tracking-tight text-foreground shadow-sm backdrop-blur-sm outline-none"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="rounded-md px-2.5 py-1 text-sm font-medium tracking-tight text-foreground transition-colors hover:bg-card/80"
          >
            {board.title}
          </button>
        )}

        {/* Item count */}
        <span className="font-mono text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 10) {
            toast.error("You can upload a maximum of 10 images at once");
            e.target.value = "";
            return;
          }
          files.forEach((file) => handleFileUpload(file));
          e.target.value = "";
        }}
      />

      {/* Konva Stage */}
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={tool === "select" || isPanning}
        style={{ cursor: isPanning ? "grab" : tool === "text" ? "crosshair" : "default" }}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
      >
        <Layer>
          <DotGrid
            stagePos={stagePos}
            stageScale={stageScale}
            stageSize={stageSize}
          />
        </Layer>
        <Layer>
          {[...items].sort((a, b) => a.z_index - b.z_index).map((item) => {
            const commonProps = {
              key: item.id,
              item,
              isSelected: selectedId === item.id,
              onSelect: () => {
                setSelectedId(item.id);
                const maxZ = items.length > 0 ? Math.max(...items.map((i) => i.z_index)) : 0;
                if (item.z_index < maxZ) {
                  updateItem.mutate({ id: item.id, z_index: maxZ + 1 });
                }
              },
              onUpdate: (updates: Record<string, any>) => {
                const prev: Record<string, any> = {};
                for (const key of Object.keys(updates)) {
                  prev[key] = (item as any)[key];
                }
                pushUndo({ type: "update", itemId: item.id, prev });
                updateItem.mutate({ id: item.id, ...updates });
              },
              onContextMenu: (e: any) => handleItemContextMenu(e, item),
            };

            if (item.type === "text") {
              return (
                <CanvasText
                  {...commonProps}
                  stageRef={stageRef}
                  stageScale={stageScale}
                  stagePos={stagePos}
                />
              );
            }

            return <CanvasImage {...commonProps} />;
          })}
        </Layer>
      </Stage>

      {/* Context Menu */}
      <CanvasContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu((m) => ({ ...m, visible: false }))}
        onDuplicate={handleContextDuplicate}
        onDownload={handleContextDownload}
        onBringToFront={handleContextBringToFront}
        onSendToBack={handleContextSendToBack}
        onDelete={handleContextDelete}
      />

      {/* Floating Dock */}
      <FloatingDock
        tool={tool}
        onToolChange={setTool}
        onUpload={() => fileInputRef.current?.click()}
        selectedId={selectedId}
        selectedType={selectedId ? (items.find((i) => i.id === selectedId)?.type ?? null) : null}
        onDelete={() => selectedId && deleteItem.mutate(selectedId)}
        onDownload={() => {
          if (!selectedId) return;
          const item = items.find((i) => i.id === selectedId);
          if (!item?.image_url) return;
          const a = document.createElement("a");
          a.href = item.image_url;
          a.download = `image-${item.id.slice(0, 8)}.${item.image_url.split(".").pop()?.split("?")[0] || "png"}`;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }}
        onAiGenerate={() => {
          setAiPrompt({ itemId: selectedId });
        }}
      />

      {/* AI Prompt Overlay */}
      {aiPrompt && (() => {
        const item = aiPrompt.itemId ? items.find((i) => i.id === aiPrompt.itemId) : null;
        const stage = stageRef.current;
        if (!stage) return null;
        // Position below selected item or at center of viewport
        const screenX = item ? item.x * stageScale + stagePos.x : stageSize.width / 2 - 160;
        const screenY = item ? (item.y + item.height) * stageScale + stagePos.y : stageSize.height / 2;
        const screenW = item ? item.width * stageScale : 320;
        return (
          <AiPromptOverlay
            boardId={board.id}
            position={{ x: screenX, y: screenY, width: screenW }}
            referenceImageUrl={item?.image_url}
            onGenerated={(imageUrl) => {
              // Load image to get dimensions, then add as new item
              const img = new window.Image();
              img.onload = () => {
                const maxDim = 400;
                const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
                const baseX = item ? item.x + 30 : (-stagePos.x + stageSize.width / 2) / stageScale;
                const baseY = item ? item.y + 30 : (-stagePos.y + stageSize.height / 2) / stageScale;
                addItem.mutate({
                  image_url: imageUrl,
                  width: img.width * ratio,
                  height: img.height * ratio,
                  x: baseX,
                  y: baseY,
                });
              };
              img.onerror = () => {
                // Fallback: add with default size
                const baseX = item ? item.x + 30 : (-stagePos.x + stageSize.width / 2) / stageScale;
                const baseY = item ? item.y + 30 : (-stagePos.y + stageSize.height / 2) / stageScale;
                addItem.mutate({ image_url: imageUrl, width: 300, height: 300, x: baseX, y: baseY });
              };
              img.src = imageUrl;
            }}
            onClose={() => setAiPrompt(null)}
          />
        );
      })()}
    </div>
  );
}
