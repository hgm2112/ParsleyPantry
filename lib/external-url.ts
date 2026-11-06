/**
 * Recipes keep their `source` as free text (a person's name, a cookbook, a
 * URL…). Only values that parse as an absolute http(s) URL are linkable.
 */
export function externalHttpUrl(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
