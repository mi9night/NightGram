export type CallQualityLevel = "excellent" | "good" | "poor" | "bad" | "unknown";

export type CallQualitySample = {
  level: CallQualityLevel;
  roundTripMs: number | null;
  packetLossPercent: number | null;
  jitterMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  updatedAt: number;
};

export const UNKNOWN_CALL_QUALITY: CallQualitySample = {
  level: "unknown",
  roundTripMs: null,
  packetLossPercent: null,
  jitterMs: null,
  availableOutgoingBitrateKbps: null,
  updatedAt: 0,
};

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function classifyCallQuality({
  roundTripMs,
  packetLossPercent,
  jitterMs,
  availableOutgoingBitrateKbps,
}: Omit<CallQualitySample, "level" | "updatedAt">): CallQualityLevel {
  const rtt = finite(roundTripMs);
  const loss = finite(packetLossPercent);
  const jitter = finite(jitterMs);
  const bitrate = finite(availableOutgoingBitrateKbps);
  if (rtt === null && loss === null && jitter === null && bitrate === null) return "unknown";
  if ((loss !== null && loss >= 12) || (rtt !== null && rtt >= 650) || (jitter !== null && jitter >= 90) || (bitrate !== null && bitrate < 180)) return "bad";
  if ((loss !== null && loss >= 5) || (rtt !== null && rtt >= 350) || (jitter !== null && jitter >= 55) || (bitrate !== null && bitrate < 450)) return "poor";
  if ((loss !== null && loss >= 2) || (rtt !== null && rtt >= 180) || (jitter !== null && jitter >= 30) || (bitrate !== null && bitrate < 900)) return "good";
  return "excellent";
}

export function qualityLabel(level: CallQualityLevel) {
  if (level === "excellent") return "Отличная связь";
  if (level === "good") return "Хорошая связь";
  if (level === "poor") return "Слабая связь";
  if (level === "bad") return "Плохая связь";
  return "Проверяем связь";
}

export function videoEncodingForQuality(level: CallQualityLevel): RTCRtpEncodingParameters {
  if (level === "bad") return { maxBitrate: 280_000, maxFramerate: 15, scaleResolutionDownBy: 2.5 };
  if (level === "poor") return { maxBitrate: 650_000, maxFramerate: 20, scaleResolutionDownBy: 1.6 };
  if (level === "good") return { maxBitrate: 1_100_000, maxFramerate: 25, scaleResolutionDownBy: 1.2 };
  return { maxBitrate: 1_800_000, maxFramerate: 30, scaleResolutionDownBy: 1 };
}

export function worstCallQuality(samples: CallQualitySample[]): CallQualitySample {
  const rank: Record<CallQualityLevel, number> = { unknown: 0, excellent: 1, good: 2, poor: 3, bad: 4 };
  return samples.reduce((worst, sample) => rank[sample.level] > rank[worst.level] ? sample : worst, UNKNOWN_CALL_QUALITY);
}
