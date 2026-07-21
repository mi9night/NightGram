export type SavedItemType = "post" | "message" | "media";

export interface SavedItem {
  id: string;
  type: SavedItemType;
  title: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  source?: string;
  createdAt: string;
}

const KEY = "ng_saved_items";

export function getSavedItems(): SavedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as SavedItem[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveItem(item: SavedItem): SavedItem[] {
  const items = getSavedItems();
  const next = [item, ...items.filter((x) => x.id !== item.id)].slice(0, 300);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("nightgram:saved-items"));
  return next;
}

export function removeSavedItem(id: string): SavedItem[] {
  const next = getSavedItems().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("nightgram:saved-items"));
  return next;
}
