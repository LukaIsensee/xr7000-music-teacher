/**
 * On-device language model via WebLLM (WebGPU).
 *
 * The model runs entirely in the browser — no server, no API key, works offline
 * once the weights are cached. iOS 26+ ships WebGPU enabled by default; older
 * iOS needs it turned on under Settings > Safari > Advanced > Feature Flags.
 */

const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

// Conservative sizes: Safari on iOS enforces tighter per-tab memory than
// desktop Chrome, so the default is the smallest usable model.
export const SUGGESTED_MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B — safest on iPhone (~0.9 GB)" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 1.5B — better answers (~1.1 GB)" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B — best, may fail on iPhone (~2.3 GB)" },
];

export const DEFAULT_MODEL = SUGGESTED_MODELS[0].id;

let enginePromise = null;
let loadedModelId = null;

export function isWebGPUAvailable() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Human-readable reason the on-device model can't run, or null if it can. */
export function unsupportedReason() {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "This page must be served over HTTPS (or localhost) for on-device AI to work.";
  }
  if (!isWebGPUAvailable()) {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua)) {
      return (
        "WebGPU isn't available in this browser. On iOS 26+ it's on by default in Safari — " +
        "on older iOS, enable Settings > Safari > Advanced > Feature Flags > WebGPU. " +
        "Note that Chrome/Firefox on iOS cannot support it."
      );
    }
    return "WebGPU isn't available in this browser, so the on-device model can't run.";
  }
  return null;
}

/** Filter WebLLM's catalogue to models small enough to be plausible on a phone. */
export async function listSmallModels() {
  const webllm = await import(WEBLLM_URL);
  const list = webllm.prebuiltAppConfig?.model_list || [];
  const available = new Set(list.map((m) => m.model_id));
  // Keep only suggestions the installed WebLLM build actually knows about, so a
  // version bump can't leave us requesting a model id that no longer exists.
  return SUGGESTED_MODELS.filter((m) => available.has(m.id));
}

/**
 * Load a model, reporting progress. The first load downloads ~1 GB; afterwards
 * WebLLM serves it from browser cache.
 */
export async function getEngine(modelId = DEFAULT_MODEL, onProgress = () => {}) {
  const blocker = unsupportedReason();
  if (blocker) throw new Error(blocker);

  if (enginePromise && loadedModelId === modelId) return enginePromise;

  loadedModelId = modelId;
  enginePromise = (async () => {
    const webllm = await import(WEBLLM_URL);
    return webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => onProgress(report.text, report.progress ?? 0),
    });
  })();

  try {
    return await enginePromise;
  } catch (err) {
    enginePromise = null;
    loadedModelId = null;
    throw err;
  }
}

export async function generate(messages, { modelId = DEFAULT_MODEL, onProgress, onToken } = {}) {
  const engine = await getEngine(modelId, onProgress);

  const stream = await engine.chat.completions.create({
    messages,
    temperature: 0.7,
    stream: true,
  });

  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (delta) {
      full += delta;
      if (onToken) onToken(full);
    }
  }
  return full;
}

export function currentModel() {
  return loadedModelId;
}
