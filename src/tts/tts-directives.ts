import type { TtsProvider } from "../config/types.tts.js";
import type { ResolvedTtsConfig } from "./tts.js";

export type ResolvedTtsModelOverrides = {
  enabled: boolean;
  allowText: boolean;
  allowProvider: boolean;
  allowVoice: boolean;
  allowModelId: boolean;
  allowVoiceSettings: boolean;
  allowNormalization: boolean;
  allowSeed: boolean;
};

export type TtsDirectiveOverrides = {
  ttsText?: string;
  provider?: TtsProvider;
  openai?: {
    voice?: string;
    model?: string;
  };
  elevenlabs?: {
    voiceId?: string;
    modelId?: string;
    seed?: number;
    applyTextNormalization?: "auto" | "on" | "off";
    languageCode?: string;
    voiceSettings?: Partial<ResolvedTtsConfig["elevenlabs"]["voiceSettings"]>;
  };
};

export type TtsDirectiveParseResult = {
  cleanedText: string;
  ttsText?: string;
  hasDirective: boolean;
  overrides: TtsDirectiveOverrides;
  warnings: string[];
};

export function isValidVoiceId(voiceId: string): boolean {
  return /^[a-zA-Z0-9]{10,40}$/.test(voiceId);
}

export function requireInRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
}

export function normalizeLanguageCode(code?: string): string | undefined {
  const trimmed = code?.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) {
    throw new Error("languageCode must be a 2-letter ISO 639-1 code (e.g. en, de, fr)");
  }
  return normalized;
}

export function normalizeApplyTextNormalization(mode?: string): "auto" | "on" | "off" | undefined {
  const trimmed = mode?.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === "auto" || normalized === "on" || normalized === "off") {
    return normalized;
  }
  throw new Error("applyTextNormalization must be one of: auto, on, off");
}

export function normalizeSeed(seed?: number): number | undefined {
  if (seed == null) {
    return undefined;
  }
  const next = Math.floor(seed);
  if (!Number.isFinite(next) || next < 0 || next > 4_294_967_295) {
    throw new Error("seed must be between 0 and 4294967295");
  }
  return next;
}

function parseBooleanValue(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseNumberValue(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const OPENAI_TTS_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"] as const;

export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
] as const;

export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

/**
 * Custom OpenAI-compatible TTS endpoint.
 * When set, model/voice validation is relaxed to allow non-OpenAI models.
 * Example: OPENAI_TTS_BASE_URL=http://localhost:8880/v1
 *
 * Note: Read at runtime (not module load) to support config.env loading.
 */
export function getOpenAITtsBaseUrl(): string {
  return (process.env.OPENAI_TTS_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
    /\/+$/,
    "",
  );
}

export function isCustomOpenAIEndpoint(): boolean {
  return getOpenAITtsBaseUrl() !== "https://api.openai.com/v1";
}

export function isValidOpenAIModel(model: string): boolean {
  if (isCustomOpenAIEndpoint()) {
    return true;
  }
  return OPENAI_TTS_MODELS.includes(model as (typeof OPENAI_TTS_MODELS)[number]);
}

export function isValidOpenAIVoice(voice: string): voice is OpenAiTtsVoice {
  if (isCustomOpenAIEndpoint()) {
    return true;
  }
  return OPENAI_TTS_VOICES.includes(voice as OpenAiTtsVoice);
}

export function parseTtsDirectives(
  text: string,
  policy: ResolvedTtsModelOverrides,
): TtsDirectiveParseResult {
  if (!policy.enabled) {
    return { cleanedText: text, overrides: {}, warnings: [], hasDirective: false };
  }

  const overrides: TtsDirectiveOverrides = {};
  const warnings: string[] = [];
  let cleanedText = text;
  let hasDirective = false;

  const blockRegex = /\[\[tts:text\]\]([\s\S]*?)\[\[\/tts:text\]\]/gi;
  cleanedText = cleanedText.replace(blockRegex, (_match, inner: string) => {
    hasDirective = true;
    if (policy.allowText && overrides.ttsText == null) {
      overrides.ttsText = inner.trim();
    }
    return "";
  });

  const directiveRegex = /\[\[tts:([^\]]+)\]\]/gi;
  cleanedText = cleanedText.replace(directiveRegex, (_match, body: string) => {
    hasDirective = true;
    const tokens = body.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      const eqIndex = token.indexOf("=");
      if (eqIndex === -1) {
        continue;
      }
      const rawKey = token.slice(0, eqIndex).trim();
      const rawValue = token.slice(eqIndex + 1).trim();
      if (!rawKey || !rawValue) {
        continue;
      }
      const key = rawKey.toLowerCase();
      try {
        parseDirectiveKey(key, rawValue, policy, overrides, warnings);
      } catch (err) {
        warnings.push((err as Error).message);
      }
    }
    return "";
  });

  return {
    cleanedText,
    ttsText: overrides.ttsText,
    hasDirective,
    overrides,
    warnings,
  };
}

function parseDirectiveKey(
  key: string,
  rawValue: string,
  policy: ResolvedTtsModelOverrides,
  overrides: TtsDirectiveOverrides,
  warnings: string[],
): void {
  switch (key) {
    case "provider":
      if (!policy.allowProvider) {
        break;
      }
      if (rawValue === "openai" || rawValue === "elevenlabs" || rawValue === "edge") {
        overrides.provider = rawValue;
      } else {
        warnings.push(`unsupported provider "${rawValue}"`);
      }
      break;
    case "voice":
    case "openai_voice":
    case "openaivoice":
      if (!policy.allowVoice) {
        break;
      }
      if (isValidOpenAIVoice(rawValue)) {
        overrides.openai = { ...overrides.openai, voice: rawValue };
      } else {
        warnings.push(`invalid OpenAI voice "${rawValue}"`);
      }
      break;
    case "voiceid":
    case "voice_id":
    case "elevenlabs_voice":
    case "elevenlabsvoice":
      if (!policy.allowVoice) {
        break;
      }
      if (isValidVoiceId(rawValue)) {
        overrides.elevenlabs = { ...overrides.elevenlabs, voiceId: rawValue };
      } else {
        warnings.push(`invalid ElevenLabs voiceId "${rawValue}"`);
      }
      break;
    case "model":
    case "modelid":
    case "model_id":
    case "elevenlabs_model":
    case "elevenlabsmodel":
    case "openai_model":
    case "openaimodel":
      if (!policy.allowModelId) {
        break;
      }
      if (isValidOpenAIModel(rawValue)) {
        overrides.openai = { ...overrides.openai, model: rawValue };
      } else {
        overrides.elevenlabs = { ...overrides.elevenlabs, modelId: rawValue };
      }
      break;
    case "stability":
      parseVoiceSettingNumeric(policy, overrides, warnings, "stability", rawValue, 0, 1);
      break;
    case "similarity":
    case "similarityboost":
    case "similarity_boost":
      parseVoiceSettingNumeric(policy, overrides, warnings, "similarityBoost", rawValue, 0, 1);
      break;
    case "style":
      parseVoiceSettingNumeric(policy, overrides, warnings, "style", rawValue, 0, 1);
      break;
    case "speed":
      parseVoiceSettingNumeric(policy, overrides, warnings, "speed", rawValue, 0.5, 2);
      break;
    case "speakerboost":
    case "speaker_boost":
    case "usespeakerboost":
    case "use_speaker_boost":
      if (!policy.allowVoiceSettings) {
        break;
      }
      {
        const value = parseBooleanValue(rawValue);
        if (value == null) {
          warnings.push("invalid useSpeakerBoost value");
          break;
        }
        overrides.elevenlabs = {
          ...overrides.elevenlabs,
          voiceSettings: { ...overrides.elevenlabs?.voiceSettings, useSpeakerBoost: value },
        };
      }
      break;
    case "normalize":
    case "applytextnormalization":
    case "apply_text_normalization":
      if (!policy.allowNormalization) {
        break;
      }
      overrides.elevenlabs = {
        ...overrides.elevenlabs,
        applyTextNormalization: normalizeApplyTextNormalization(rawValue),
      };
      break;
    case "language":
    case "languagecode":
    case "language_code":
      if (!policy.allowNormalization) {
        break;
      }
      overrides.elevenlabs = {
        ...overrides.elevenlabs,
        languageCode: normalizeLanguageCode(rawValue),
      };
      break;
    case "seed":
      if (!policy.allowSeed) {
        break;
      }
      overrides.elevenlabs = {
        ...overrides.elevenlabs,
        seed: normalizeSeed(Number.parseInt(rawValue, 10)),
      };
      break;
    default:
      break;
  }
}

function parseVoiceSettingNumeric(
  policy: ResolvedTtsModelOverrides,
  overrides: TtsDirectiveOverrides,
  warnings: string[],
  field: keyof NonNullable<NonNullable<TtsDirectiveOverrides["elevenlabs"]>["voiceSettings"]>,
  rawValue: string,
  min: number,
  max: number,
): void {
  if (!policy.allowVoiceSettings) {
    return;
  }
  const value = parseNumberValue(rawValue);
  if (value == null) {
    warnings.push(`invalid ${field} value`);
    return;
  }
  requireInRange(value, min, max, field);
  overrides.elevenlabs = {
    ...overrides.elevenlabs,
    voiceSettings: { ...overrides.elevenlabs?.voiceSettings, [field]: value },
  };
}
