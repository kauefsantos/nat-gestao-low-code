import { useState, useRef, useEffect } from "react";
import { Wand2, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  boardId: string;
  /** Screen-space position for the prompt bar */
  position: { x: number; y: number; width: number };
  /** Optional reference image URL for editing an existing image */
  referenceImageUrl?: string | null;
  onGenerated: (imageUrl: string) => void;
  onClose: () => void;
}

export function AiPromptOverlay({ boardId, position, referenceImageUrl, onGenerated, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: { prompt: prompt.trim(), boardId, referenceImageUrl: referenceImageUrl || undefined },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.image_url) {
        onGenerated(data.image_url);
        toast.success("Image generated!");
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed z-50 flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-md"
      style={{
        left: position.x,
        top: position.y + 8,
        width: Math.max(position.width, 280),
      }}
    >
      <Wand2 className="h-4 w-4 shrink-0 text-primary" />
      <input
        ref={inputRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleGenerate();
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
        placeholder="Describe the image to generate…"
        disabled={loading}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
      />
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
