import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const { query } = await req.json();

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are a character database expert for anime, manga, games, and comics. When given a character name, return a JSON object with:
- "name": the character's canonical Korean name (or original name if no Korean name exists)
- "persona": a detailed Korean description of their personality, speech style, and behavior (2-3 sentences). Write it as instructions for an AI to roleplay as this character.
- "speech_style": a detailed Korean description of this character's unique speech patterns, verbal habits, catchphrases, signature expressions, and notable dialogue lines (2-4 sentences). Include specific examples of how they talk, any speech quirks (e.g., ending particles, accent, slang), and 1-2 iconic quotes if available.
- "greeting": a characteristic greeting message in Korean that this character would say, matching their personality and speech style (1-2 sentences). Use the character's actual speech style.
- "avatar": a publicly accessible URL of the character's official or well-known image if available, otherwise empty string.

Respond ONLY with valid JSON. No markdown, no explanation.`,
            },
            {
              role: "user",
              content: query,
            },
          ],
          temperature: 0.3,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    
    // Parse the JSON from AI response
    let parsed;
    try {
      // Remove potential markdown code fences
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { name: query, persona: "", greeting: "", avatar: "" };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("character-search error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
