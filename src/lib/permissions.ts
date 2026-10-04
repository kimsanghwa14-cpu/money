// Only current, server-read membership grants access. Display names and Auth user metadata do not.
export function modificationDateAccess(member: { role?: string; can_view_modification_dates?: boolean }): boolean {
  return member.role === "owner" && member.can_view_modification_dates === true;
}
export function redactModificationDates<T>(value: T, allowed: boolean): T {
  if (allowed) return value;
  function redact(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(redact);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).filter(([key]) => key !== "updated_at").map(([key, child]) => [key, redact(child)]));
    return item;
  }
  return redact(value) as T;
}
