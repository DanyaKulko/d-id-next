export const normalizeDidChatText = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let value = trimmed;
  if (value.startsWith("chat/answer")) {
    const separatorIndex = value.indexOf(":");
    if (separatorIndex === -1) return "";
    value = value.slice(separatorIndex + 1).trim();
  }

  if (!/%[0-9A-Fa-f]{2}/.test(value)) {
    return value;
  }

  let decoded = value;
  for (let pass = 0; pass < 5; pass += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(decoded)) break;
    try {
      const next = decodeURIComponent(decoded.replace(/\+/g, "%20"));
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded.trim();
};
