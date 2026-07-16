export function pathName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

export function formatRelativeTime(timestamp?: number) {
  if (!timestamp) return "";
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  const delta = Date.now() - milliseconds;
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function statusLabel(status: unknown) {
  if (typeof status === "string") return status;
  if (
    status &&
    typeof status === "object" &&
    "type" in status &&
    typeof status.type === "string"
  ) {
    return status.type;
  }
  return "idle";
}

export function extractText(
  content?: Array<{ type: string; text?: string; path?: string }>,
) {
  return (
    content
      ?.map((entry) => entry.text || entry.path || "")
      .filter(Boolean)
      .join("\n") || ""
  );
}
