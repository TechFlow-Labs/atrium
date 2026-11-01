export const WORKSPACE_ICONS = [
  "🏠",
  "🏢",
  "🚀",
  "🧭",
  "🗂️",
  "🧪",
  "🛠️",
  "📦",
  "🌿",
  "⚓",
  "🎯",
  "💡",
  "📚",
  "🎨",
  "🔒",
  "🌐",
  "💼",
  "🖥️",
  "📱",
  "🧠",
  "🧩",
  "⚙️",
  "📊",
  "📈",
  "📝",
  "🗓️",
  "🤝",
  "💬",
  "📣",
  "🏆",
  "⭐",
  "🔥",
  "🌈",
  "☕",
  "🎧",
  "🎬",
  "🏛️",
  "🏪",
  "🏭",
  "🔬",
  "🛰️",
  "🗺️",
  "🧳",
  "🪙",
  "💎",
  "🪄",
  "🛡️",
  "🔑",
] as const;

export type WorkspaceIcon = (typeof WORKSPACE_ICONS)[number];

export function normalizeWorkspaceIcon(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(WORKSPACE_ICONS as readonly string[]).includes(trimmed)) {
    throw new Error("Choose an icon from the workspace icon set");
  }
  return trimmed;
}

export function workspaceIconOrFallback(
  icon: string | null | undefined,
  kind: string,
  contextIcon?: string | null,
): string {
  if (icon && (WORKSPACE_ICONS as readonly string[]).includes(icon)) return icon;
  if (contextIcon && (WORKSPACE_ICONS as readonly string[]).includes(contextIcon)) return contextIcon;
  if (kind === "personal") return "🏠";
  if (kind === "work") return "🏢";
  return "🗂️";
}
