import { supabase } from "@/integrations/supabase/client";

export type RecipeImportSource = "file_csv" | "pasted_csv";

const PARSER_VERSION = "recipe-csv-v1";

async function sha256Hex(content: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function stageRecipeImport(input: {
  sourceType: RecipeImportSource;
  fileName?: string | null;
  content: string;
  rowCount: number;
}) {
  const fileSha256 = await sha256Hex(input.content);
  const result = await supabase.rpc("stage_recipe_import_v1" as never, {
    p_source_type: input.sourceType,
    p_file_name: input.fileName ?? null,
    p_file_sha256: fileSha256,
    p_parser_version: PARSER_VERSION,
    p_row_count: input.rowCount,
  } as never);
  if (result.error) throw new Error(`Não foi possível registrar a origem do CSV: ${result.error.message}`);
}
