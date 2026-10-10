import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");

function token(name: string): string | undefined {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m?.[1].trim();
}

// Эталон — шалфей из fraktsiya 67d4d7f. Изменение палитры должно быть осознанным.
const SAGE: Record<string, string> = {
  "color-background": "#131211",
  "color-foreground": "#f2eee6",
  "color-primary": "#dd332a",
  "color-ok": "#8bcfa3",
  "color-ring": "#8bcfa3",
  "color-muted-foreground": "#9a958a",
};

describe("палитра шалфея", () => {
  for (const [name, value] of Object.entries(SAGE)) {
    it(`--${name} = ${value}`, () => {
      expect(token(name)).toBe(value);
    });
  }

  it("циан фракции сюда не попал", () => {
    expect(css).not.toMatch(/#45d4e4|#15171b|#e8382f/i);
  });
});
