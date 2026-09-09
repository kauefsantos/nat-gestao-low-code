import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseKey) throw new Error("No Supabase anon key found");

    const supabase = createClient(
      supabaseUrl,
      supabaseKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Retry auth check to handle transient TLS errors in edge runtime
    let user = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error: authError } = await supabase.auth.getUser();
      if (!authError && data?.user) {
        user = data.user;
        break;
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
    }
    if (!user) throw new Error("Unauthorized");

    const { prompt, boardId, referenceImageUrl } = await req.json();
    if (!prompt || !boardId) throw new Error("Missing prompt or boardId");

    // Build message content: text-only or text+image for editing
    const messageContent = referenceImageUrl
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: referenceImageUrl } },
        ]
      : prompt;

    console.log("Calling AI gateway with model google/gemini-3.1-flash-image-preview, hasRef:", !!referenceImageUrl);
    
    // Generate image via Lovable AI Gateway
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout
    
    let aiResponse;
    try {
      aiResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-image-preview",
            messages: [
              {
                role: "user",
                content: messageContent,
              },
            ],
            modalities: ["image", "text"],
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }
    
    console.log("AI gateway responded with status:", aiResponse.status);
    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error("AI image generation failed");
    }

    const aiData = await aiResponse.json();
    const imageDataUrl =
      aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageDataUrl) throw new Error("No image returned from AI");

    // Decode base64 and upload to storage
    const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const filePath = `${boardId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await adminClient.storage
      .from("board-images")
      .upload(filePath, imageBytes, { contentType: "image/png" });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Create a signed URL (bucket is private)
    const { data: signedData, error: signError } = await adminClient.storage
      .from("board-images")
      .createSignedUrl(filePath, 3600); // 1 hour

    if (signError || !signedData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signError?.message}`);
    }

    return new Response(
      JSON.stringify({ image_url: signedData.signedUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-image error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
