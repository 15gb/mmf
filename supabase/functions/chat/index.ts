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
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    const { messages, settings } = await req.json();

    // Build system prompt from settings
    const systemParts: string[] = [];

    if (settings?.charName) {
      systemParts.push(`너의 이름은 "${settings.charName}"이야.`);
    }
    if (settings?.charPersona) {
      systemParts.push(`너의 성격과 말투: ${settings.charPersona}`);
    }
    if (settings?.worldSetting) {
      systemParts.push(`대화의 배경(세계관): ${settings.worldSetting}`);
    }
    if (settings?.myName) {
      systemParts.push(`상대방(유저)의 이름은 "${settings.myName}"이야.`);
    }
    if (settings?.myIntro) {
      systemParts.push(`상대방 소개: ${settings.myIntro}`);
    }
    if (settings?.note) {
      systemParts.push(`[중요 노트 - 항상 기억하고 참고해야 할 내용]\n${settings.note}`);
    }

    const systemPrompt =
      systemParts.length > 0
        ? systemParts.join("\n\n")
        : "너는 친절하고 재미있는 AI 캐릭터야. 자연스러운 한국어로 대화해줘.";

    // Convert messages to Gemini format
    const geminiContents = [];

    // Add system instruction as first user/model pair
    geminiContents.push({
      role: "user",
      parts: [{ text: `[시스템 지시사항]\n${systemPrompt}\n\n위 지시사항에 따라 캐릭터로서 대화해줘.` }],
    });
    geminiContents.push({
      role: "model",
      parts: [{ text: "네, 알겠습니다. 지시사항에 따라 캐릭터로서 대화하겠습니다." }],
    });

    // Add conversation history
    for (const msg of messages) {
      geminiContents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI 응답 생성에 실패했습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream the response back
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
