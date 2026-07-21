import type { Message } from "@/types";

export type MessageSearchIndex = {
  messages: Message[];
  normalizedTexts: string[];
  trigramToIndexes: Map<string, number[]>;
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(value: string): string[] {
  if (value.length < 3) return value ? [value] : [];
  const result = new Set<string>();
  for (let index = 0; index <= value.length - 3; index += 1) {
    result.add(value.slice(index, index + 3));
  }
  return [...result];
}

export function buildMessageSearchIndex(messages: Message[]): MessageSearchIndex {
  const normalizedTexts = messages.map((message) => normalizeSearchText(message.text ?? ""));
  const trigramToIndexes = new Map<string, number[]>();

  normalizedTexts.forEach((text, messageIndex) => {
    for (const trigram of trigrams(text)) {
      const bucket = trigramToIndexes.get(trigram);
      if (bucket) bucket.push(messageIndex);
      else trigramToIndexes.set(trigram, [messageIndex]);
    }
  });

  return { messages, normalizedTexts, trigramToIndexes };
}

export function searchMessageIndex(index: MessageSearchIndex, query: string): Message[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  if (normalizedQuery.length < 3) {
    return index.messages.filter((_, messageIndex) => index.normalizedTexts[messageIndex]?.includes(normalizedQuery));
  }

  const queryTrigrams = trigrams(normalizedQuery);
  const buckets = queryTrigrams
    .map((trigram) => index.trigramToIndexes.get(trigram) ?? [])
    .sort((left, right) => left.length - right.length);

  if (buckets.length === 0 || buckets[0].length === 0) return [];

  // Start with the rarest trigram and verify the complete substring. This avoids
  // scanning every loaded message on each keypress while keeping exact results.
  return buckets[0]
    .filter((messageIndex) => index.normalizedTexts[messageIndex]?.includes(normalizedQuery))
    .map((messageIndex) => index.messages[messageIndex]);
}
