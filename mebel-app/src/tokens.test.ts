import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

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

for (const [name, value] of Object.entries(SAGE)) {
  test(`--${name} = ${value}`, () => {
    assert.equal(token(name), value);
  });
}

test("циан фракции сюда не попал", () => {
  assert.doesNotMatch(css, /#45d4e4|#15171b|#e8382f/i);
});
