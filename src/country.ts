const MIN_NAME_QUERY = 3;
const ALIASES: Record<string, string> = { usa: "US", uk: "GB", uae: "AE" };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

const regions = [...LETTERS].flatMap((a) =>
  [...LETTERS].flatMap((b) => {
    const code = a + b;
    const name = names.of(code);
    return name ? [{ code, words: name.toLowerCase().split(/[\s-]+/), name: name.toLowerCase() }] : [];
  }),
);

// The airport data stores ISO codes, so country names are resolved here.
export const countryCodes = (query: string): string[] => {
  const text = query.trim().toLowerCase();
  if (ALIASES[text]) return [ALIASES[text]];
  if (text.length < MIN_NAME_QUERY) return [];
  return regions
    .filter((r) => r.name.startsWith(text) || r.words.some((word) => word.startsWith(text)))
    .map((r) => r.code);
};
