import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { batchSignUrls } from "@/utils/sign-urls.functions";
import { useAuth } from "@/hooks/use-auth";
import { Plus, LayoutGrid, LogOut, Sun, Moon, Pencil, ImagePlus, GripVertical, Trash2 } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { auth } = Route.useRouteContext();
  const { session } = useAuth();

  const { data: boards, isLoading } = useQuery({
    queryKey: ["boards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boards")
        .select("*, board_items(count)")
        .order("sort_order", { ascending: true });
      if (error) throw error;

      // Sign thumbnail URLs (bucket is private)
      const thumbnailUrls = data
        ?.map((b) => b.thumbnail_url)
        .filter((url): url is string => !!url) ?? [];

      if (thumbnailUrls.length === 0 || !session?.access_token) return data;

      const { signedMap } = await batchSignUrls({
        data: { urls: thumbnailUrls },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      return data?.map((b) => ({
        ...b,
        thumbnail_url: b.thumbnail_url ? (signedMap[b.thumbnail_url] ?? b.thumbnail_url) : null,
      }));
    },
    enabled: !!session,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const reorderBoards = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, i) =>
        supabase.from("boards").update({ sort_order: i }).eq("id", id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !boards) return;

      const oldIndex = boards.findIndex((b) => b.id === active.id);
      const newIndex = boards.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(boards, oldIndex, newIndex);
      // Optimistic update
      queryClient.setQueryData(["boards"], reordered);
      reorderBoards.mutate(reordered.map((b) => b.id));
    },
    [boards, queryClient, reorderBoards]
  );

  const createBoard = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("boards")
        .insert({ title: "Untitled Board", user_id: auth.user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      navigate({ to: "/boards/$boardId", params: { boardId: data.id } });
    },
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div
      className="min-h-screen bg-background"
      style={{
        backgroundImage: "radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Inspo</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => createBoard.mutate()}
              disabled={createBoard.isPending}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              New board
            </button>
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : !boards?.length ? (
          <EmptyState onCreate={() => createBoard.mutate()} isPending={createBoard.isPending} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={boards.map((b) => b.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {boards.map((board, index) => (
                  <SortableBoardCard key={board.id} board={board} index={index} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>
    </div>
  );
}

function EmptyState({ onCreate, isPending }: { onCreate: () => void; isPending: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center justify-center py-32 text-center"
    >
      <div className="mb-6 rounded-full bg-muted p-5">
        <LayoutGrid className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mb-3 text-lg font-medium tracking-tight text-foreground">No boards yet</p>
      <p className="mb-8 text-sm text-muted-foreground/70">
        Create your first mood board to start collecting inspiration.
      </p>
      <button
        onClick={onCreate}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Create first board
      </button>
    </motion.div>
  );
}

function SortableBoardCard({ board, index }: { board: any; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <BoardCard board={board} index={index} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function BoardCard({ board, index, dragHandleProps }: { board: any; index: number; dragHandleProps?: Record<string, any> }) {
  const itemCount = board.board_items?.[0]?.count ?? 0;
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(board.title);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateBoard = useMutation({
    mutationFn: async (updates: { title?: string; thumbnail_url?: string }) => {
      const { error } = await supabase.from("boards").update(updates).eq("id", board.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });

  const deleteBoard = useMutation({
    mutationFn: async () => {
      // Delete items first, then the board
      const { error: itemsError } = await supabase.from("board_items").delete().eq("board_id", board.id);
      if (itemsError) throw itemsError;
      const { error } = await supabase.from("boards").delete().eq("id", board.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Board deleted");
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
    onError: () => {
      toast.error("Failed to delete board");
    },
  });

  const handleTitleSubmit = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== board.title) {
      updateBoard.mutate({ title: titleValue.trim() });
    } else {
      setTitleValue(board.title);
    }
  };

  const handleThumbnailUpload = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${board.id}/thumbnail.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("board-images")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Upload failed");
      return;
    }

    // Store the raw storage path, not a public URL
    updateBoard.mutate({ thumbnail_url: path });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
        <Link
          to="/boards/$boardId"
          params={{ boardId: board.id }}
          className="block"
        >
          <div className="relative aspect-[4/3] bg-muted">
            {board.thumbnail_url ? (
              <img src={board.thumbnail_url} alt={board.title} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="grid grid-cols-3 gap-1.5 opacity-20">
                  {[...Array(9)].map((_, i) => (
                    <div key={i} className="h-4 w-4 rounded-sm bg-foreground/40" />
                  ))}
                </div>
              </div>
            )}
            {/* Thumbnail upload overlay */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-card/90 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-all hover:bg-card hover:text-foreground group-hover:opacity-100"
              title="Change thumbnail"
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </Link>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleThumbnailUpload(file);
            e.target.value = "";
          }}
        />

        <div className="flex items-start gap-2 p-4">
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSubmit();
                  if (e.key === "Escape") {
                    setTitleValue(board.title);
                    setEditingTitle(false);
                  }
                }}
                className="w-full rounded border border-primary/30 bg-transparent px-1.5 py-0.5 text-sm font-medium tracking-tight text-card-foreground outline-none"
              />
            ) : (
              <Link
                to="/boards/$boardId"
                params={{ boardId: board.id }}
                className="block truncate text-sm font-medium tracking-tight text-card-foreground hover:underline"
              >
                {board.title}
              </Link>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(board.updated_at), "MMM d")}
              </span>
            </div>
          </div>
          <button
            onClick={() => setEditingTitle(true)}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
            title="Rename board"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                title="Delete board"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{board.title}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this board and all its items. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteBoard.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div
            {...dragHandleProps}
            className="mt-0.5 flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="h-3 w-3" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
