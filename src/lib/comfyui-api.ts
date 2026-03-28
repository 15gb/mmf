import type { AppSettings } from "./store";

const COMFYUI_URL = "http://localhost:8188";
const PROMPT_GEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-prompt`;

// ComfyUI API format workflow - converted from user's workflow
const BASE_WORKFLOW: Record<string, any> = {"187":{"class_type":"SimpleToggleNode","inputs":{"value":true},"_meta":{"title":"자동프롬프트 사용여부"}},"124":{"class_type":"easy showAnything","inputs":{"anything":["318",0]},"_meta":{"title":"자동프롬프트"}},"154":{"class_type":"PrimitiveStringMultiline","inputs":{"value":""},"_meta":{"title":"수동 프롬프트"}},"318":{"class_type":"easy ifElse","inputs":{"on_true":["317",0],"on_false":["154",0],"boolean":["187",0]},"_meta":{"title":"자동/수동"}},"145":{"class_type":"DeepTranslatorTextNode","inputs":{"text":["124",0],"from_translate":"auto","to_translate":"korean","add_proxies":false,"proxies":"","auth_data":"","service":"GoogleTranslator"},"_meta":{"title":""}},"189":{"class_type":"Text Concatenate","inputs":{"text_b":["188",0],"text_c":["124",0],"delimiter":", ","clean_whitespace":"true"},"_meta":{"title":""}},"148":{"class_type":"easy showAnything","inputs":{"anything":["145",0]},"_meta":{"title":"번역"}},"97":{"class_type":"CLIPTextEncode","inputs":{"text":["218",0]},"_meta":{"title":"Negative"}},"98":{"class_type":"CLIPTextEncode","inputs":{"text":["189",0]},"_meta":{"title":"Positive encode"}},"218":{"class_type":"PrimitiveStringMultiline","inputs":{"value":"色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走, censored, mosaic censoring, bar censor, pixelated, glowing, bloom, blurry, out of focus, low detail, bad anatomy, ugly, overexposed, underexposed, distorted face, extra limbs, cartoonish, 3d render artifacts, duplicate people, unnatural lighting, bad composition, missing shadows, low resolution, poorly textured, glitch, noise, grain, static, motionless, still frame, overall grayish, worst quality, low quality, JPEG compression artifacts, subtitles, stylized, artwork, painting, illustration, cluttered background, many people in background, three legs, walking backward, zoom out, zoom in, mouth speaking, moving mouth, talking, speaking, mute speaking, unnatural skin tone, discolored eyelid, red eyelids, red upper eyelids, no red eyeshadow, closed eyes, no wide-open innocent eyes, poorly drawn hands, extra fingers, fused fingers, poorly drawn face, deformed, disfigured, malformed limbs, thighs, fog, mist, voluminous eyelashes, blush,\n\ncold breath, mouth steam, condensation, exhaling steam, visible breath, foggy breath, vapor"},"_meta":{"title":"부정"}},"100":{"class_type":"EmptySD3LatentImage","inputs":{"width":["292",0],"height":["292",1],"batch_size":1},"_meta":{"title":""}},"265":{"class_type":"Anything Everywhere","inputs":{"anything13":["6",2]},"_meta":{"title":""}},"185":{"class_type":"Anything Everywhere","inputs":{"anything14":["278",1]},"_meta":{"title":""}},"184":{"class_type":"Anything Everywhere","inputs":{"anything13":["278",0]},"_meta":{"title":""}},"169":{"class_type":"Seed (rgthree)","inputs":{},"_meta":{"title":""}},"102":{"class_type":"VAEDecode","inputs":{"samples":["96",0]},"_meta":{"title":""}},"144":{"class_type":"easy showAnything","inputs":{"anything":["278",2]},"_meta":{"title":"현재 불러온 로라에 있는 트리거들"}},"99":{"class_type":"KSamplerAdvanced","inputs":{"positive":["98",0],"negative":["97",0],"latent_image":["100",0],"noise_seed":["169",0],"add_noise":"enable","steps":30,"cfg":5,"sampler_name":"euler_ancestral","scheduler":"simple","start_at_step":0,"end_at_step":20,"return_with_leftover_noise":"enable"},"_meta":{"title":""}},"96":{"class_type":"KSamplerAdvanced","inputs":{"positive":["98",0],"negative":["97",0],"latent_image":["99",0],"noise_seed":["169",0],"add_noise":"disable","steps":30,"cfg":1.3,"sampler_name":"uni_pc","scheduler":"simple","start_at_step":20,"end_at_step":10000,"return_with_leftover_noise":"disable"},"_meta":{"title":""}},"294":{"class_type":"SaveImage","inputs":{"images":["102",0],"filename_prefix":"AutoC_"},"_meta":{"title":""}},"317":{"class_type":"b0e6ebef-cc21-42b8-aa4c-980a45876517","inputs":{},"_meta":{"title":""}},"292":{"class_type":"mxSlider2D","inputs":{"Xi":1024,"Xf":1024,"Yi":1024,"Yf":1024,"isfloatX":0,"isfloatY":0},"_meta":{"title":"Image Width x Height"}},"6":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"waiSHUFFLENOOB_vPred04.safetensors"},"_meta":{"title":""}},"188":{"class_type":"PrimitiveStringMultiline","inputs":{"value":""},"_meta":{"title":"자동수동 상관없이 강제추가"}},"278":{"class_type":"Lora Loader (LoraManager)","inputs":{"model":["6",0],"clip":["6",1],"text":"<lora:cunny-000024:1.00>"},"_meta":{"title":""}}};

function buildWorkflow(prompt: string): Record<string, any> {
  const workflow = JSON.parse(JSON.stringify(BASE_WORKFLOW));
  // Inject prompt into manual prompt node (154)
  workflow["154"].inputs.value = prompt;
  // Set toggle to manual mode (false = use manual prompt)
  workflow["187"].inputs.value = false;
  return workflow;
}

/** Step 1: Generate an English prompt from conversation context */
export async function generateImagePrompt(
  messages: { role: string; content: string }[],
  settings: AppSettings
): Promise<string> {
  const resp = await fetch(PROMPT_GEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, settings }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "프롬프트 생성 실패" }));
    throw new Error(err.error || "프롬프트 생성 실패");
  }

  const data = await resp.json();
  return data.prompt;
}

/** Step 2: Send workflow to ComfyUI and get prompt_id */
export async function queueComfyUIPrompt(prompt: string): Promise<string> {
  const workflow = buildWorkflow(prompt);
  
  const resp = await fetch(`${COMFYUI_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ComfyUI 오류: ${text}`);
  }

  const data = await resp.json();
  return data.prompt_id;
}

/** Step 3: Poll ComfyUI for completion and get the image */
export async function pollComfyUIResult(
  promptId: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const maxAttempts = 120; // 2 minutes max
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    
    try {
      const resp = await fetch(`${COMFYUI_URL}/history/${promptId}`);
      if (!resp.ok) continue;
      
      const history = await resp.json();
      const result = history[promptId];
      
      if (!result) {
        // Check queue status for progress
        if (onProgress) {
          const queueResp = await fetch(`${COMFYUI_URL}/queue`);
          if (queueResp.ok) {
            const queue = await queueResp.json();
            const running = queue.queue_running?.length || 0;
            const pending = queue.queue_pending?.length || 0;
            if (running > 0) onProgress(50);
            else if (pending > 0) onProgress(10);
          }
        }
        continue;
      }
      
      if (result.status?.status_str === "error") {
        throw new Error("ComfyUI 이미지 생성 실패");
      }
      
      // Find the output image from SaveImage node (294)
      const outputs = result.outputs;
      for (const nodeId of Object.keys(outputs)) {
        const nodeOutput = outputs[nodeId];
        if (nodeOutput.images && nodeOutput.images.length > 0) {
          const img = nodeOutput.images[0];
          const imageUrl = `${COMFYUI_URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;
          return imageUrl;
        }
      }
      
      throw new Error("이미지 출력을 찾을 수 없습니다");
    } catch (e) {
      if (i === maxAttempts - 1) throw e;
      if ((e as Error).message.includes("찾을 수 없습니다") || 
          (e as Error).message.includes("실패")) throw e;
    }
  }
  
  throw new Error("이미지 생성 시간 초과");
}

/** Full pipeline: generate prompt -> queue ComfyUI -> get image */
export async function generateImage(
  messages: { role: string; content: string }[],
  settings: AppSettings,
  onStatus?: (status: string) => void,
  onProgress?: (progress: number) => void
): Promise<{ imageUrl: string; prompt: string }> {
  onStatus?.("프롬프트 생성 중...");
  onProgress?.(5);
  
  const prompt = await generateImagePrompt(messages, settings);
  
  onStatus?.("ComfyUI에 전송 중...");
  onProgress?.(20);
  
  const promptId = await queueComfyUIPrompt(prompt);
  
  onStatus?.("이미지 생성 중...");
  onProgress?.(30);
  
  const imageUrl = await pollComfyUIResult(promptId, onProgress);
  
  onProgress?.(100);
  onStatus?.("완료!");
  
  return { imageUrl, prompt };
}
