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

    // Add response length instruction
    systemParts.push(`[응답 규칙 - 반드시 지켜야 함] 답변은 반드시 5줄 이내로 짧게 해줘. 절대 5줄을 넘기지 마. 내용이 길어질 경우 "[[SPLIT]]" 구분자를 넣어서 메시지를 나눠서 보내줘. [[SPLIT]] 앞뒤로 각각 5줄 이내여야 해. 예시: "첫 번째 메시지 내용(5줄 이내)[[SPLIT]]두 번째 메시지 내용(5줄 이내)". 3개 이상으로 나눌 수도 있어.`);
    systemParts.push(`[자동 진행 규칙] 만약 상대방(유저)이 아무 말도 하지 않고 대화가 이어질 경우, 상황에 맞게 상대방(유저)의 행동이나 반응을 *이탤릭 나레이션*으로 자연스럽게 묘사한 뒤 그에 맞춰 대화를 이어가줘. 유저의 행동 묘사는 반드시 *별표*로 감싸서 나레이션임을 표시해줘. 예시: *${settings?.myName || "상대방"}은(는) 고개를 끄덕였다.* 그런 다음 캐릭터의 대사나 행동을 이어가줘.`);

    const systemPrompt =
      systemParts.length > 0
        ? systemParts.join("\n\n")
        : "너는 친절하고 재미있는 AI 캐릭터야. 자연스러운 한국어로 대화해줘. 답변은 5줄 이내로 짧게 해줘.";

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
            ...messages,
          ],
          stream: true,
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
          JSON.stringify({ error: "크레딧이 부족합니다. Lovable 설정에서 크레딧을 추가해주세요." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI 응답 생성에 실패했습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
