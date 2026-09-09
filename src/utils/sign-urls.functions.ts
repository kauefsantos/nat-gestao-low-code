import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Batch-sign storage URLs for board images.
 * Accepts an array of full public URLs or storage paths,
 * returns a map of original URL → signed URL.
 */
export const batchSignUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { urls: string[] }) => {
    if (!Array.isArray(input.urls) || input.urls.length === 0) {
      throw new Error("urls must be a non-empty array");
    }
    if (input.urls.length > 200) {
      throw new Error("Maximum 200 URLs per batch");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const BUCKET = "board-images";
    const EXPIRY = 3600; // 1 hour

    // Extract clean storage paths from any URL format
    const extractPath = (raw: string): string => {
      // Try to find the bucket name in the URL and grab everything after it
      const patterns = [
        `/storage/v1/object/public/${BUCKET}/`,
        `/storage/v1/object/sign/${BUCKET}/`,
        `/storage/v1/object/${BUCKET}/`,
      ];
      for (const pattern of patterns) {
        const idx = raw.indexOf(pattern);
        if (idx !== -1) {
          const afterBucket = raw.substring(idx + pattern.length);
          // Strip query string and hash
          return afterBucket.split("?")[0].split("#")[0];
        }
      }
      // Already a raw path – still strip query/hash
      return raw.split("?")[0].split("#")[0];
    };

    const paths = data.urls.map(extractPath);

    // Batch sign all paths in a single call
    const { data: signedData, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, EXPIRY);

    if (error) {
      console.error("Batch sign error:", error);
      throw new Error("Failed to sign URLs");
    }

    // Build map: original URL → signed URL
    const signedMap: Record<string, string> = {};
    for (let i = 0; i < data.urls.length; i++) {
      const signed = signedData?.[i];
      if (signed?.signedUrl) {
        signedMap[data.urls[i]] = signed.signedUrl;
      }
    }

    return { signedMap };
  });
