import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CanvasWorkspace } from "@/components/canvas/CanvasWorkspace";
import { batchSignUrls } from "@/utils/sign-urls.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  component: BoardPage,
});

function BoardPage() {
  const { boardId } = Route.useParams();
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ["board", boardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boards")
        .select("*")
        .eq("id", boardId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["board-items", boardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_items")
        .select("*")
        .eq("board_id", boardId)
        .order("z_index", { ascending: true });
      if (error) throw error;

      // Collect all image URLs that need signing
      const imageUrls = data
        ?.map((item) => item.image_url)
        .filter((url): url is string => !!url) ?? [];

      if (imageUrls.length === 0) return data;

      // Get auth token for the server function
      const token = session?.access_token;
      if (!token) return data;

      // Batch sign all URLs in one call
      const { signedMap } = await batchSignUrls({
        data: { urls: imageUrls },
        headers: { Authorization: `Bearer ${token}` },
      });

      // Replace image_url with signed versions
      return data?.map((item) => ({
        ...item,
        image_url: item.image_url ? (signedMap[item.image_url] ?? item.image_url) : null,
      }));
    },
    enabled: !!session,
  });

  const updateTitle = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase.from("boards").update({ title }).eq("id", boardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });

  if (boardLoading || itemsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="font-mono text-sm text-muted-foreground">Board not found</p>
        <Link to="/dashboard" className="text-sm text-primary hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <CanvasWorkspace
      board={board}
      items={items ?? []}
      onTitleChange={(title) => updateTitle.mutate(title)}
    />
  );
}
