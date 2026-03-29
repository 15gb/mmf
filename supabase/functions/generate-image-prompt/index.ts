import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { messages, settings } = await req.json();

    const systemPrompt = `You are an expert at generating high-quality image prompts for Pollinations.ai (Flux model).
Based on the conversation context and character settings, generate a detailed English image prompt that captures the current scene, mood, and character appearance.

Character info:
- Name: ${settings?.charName || "Unknown"}
- Persona: ${settings?.charPersona || "N/A"}
- World setting: ${settings?.worldSetting || "N/A"}

Rules:
1. Output ONLY the prompt text on a SINGLE LINE. No newlines, no quotes, no markdown.
2. Include character appearance details (hair, eyes, clothing, pose, expression).
3. Include scene/background details based on conversation context.
4. Include mood/atmosphere tags and cinematic lighting descriptions.
5. Use comma-separated tags in danbooru/booru style.
6. Keep it under 150 words.
7. Do NOT include negative prompts.
8. Focus on the CURRENT moment in the conversation.
9. Add quality boosters: masterpiece, best quality, highly detailed, cinematic lighting, sparkling background.
10. End the prompt with: (Art style of Project Moon, Library of Ruina, dark fantasy, washed out colors:1.2)`;

    // Get last few messages for context
    const recentMessages = (messages || []).slice(-10);

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Based on this conversation, generate an image prompt:\n\n${recentMessages
                .map((m: any) => `${m.role}: ${m.content}`)
                .join("\n")}`,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "크레딧이 부족합니다." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "프롬프트 생성에 실패했습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const prompt = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ prompt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-image-prompt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
