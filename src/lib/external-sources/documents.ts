export const normalizeDocumentId = (value: string) =>
  value.includes("#") ? (value.split("#").pop() ?? value) : value;

export const parseStoredDocumentIds = (value?: string | null) => {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry);
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { documents?: unknown[] }).documents)
    ) {
      return (parsed as { documents?: unknown[] }).documents
        ?.map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry) ?? [];
    }
  } catch {
    // fall back to treating the value as a single document id
  }
  return [trimmed];
};

export const serializeDocumentIds = (ids: string[]) => {
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];
  return JSON.stringify(ids);
};
