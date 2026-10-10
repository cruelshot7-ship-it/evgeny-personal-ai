import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "./telegram-auth";

const TOKEN = "123456:TEST_TOKEN_ONLY_FOR_TESTS";
const NOW = new Date("2026-10-11T06:00:00Z");

/** Собирает initData так же, как Telegram: поля, подпись по строке data_check_string. */
function makeInitData(fields: Record<string, string>, token = TOKEN): string {
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 8144320404, first_name: "Евгений" });
const fresh = String(Math.floor(NOW.getTime() / 1000) - 60);

describe("verifyInitData", () => {
  it("принимает подписанные данные и возвращает пользователя", () => {
    const init = makeInitData({ auth_date: fresh, user });
    expect(verifyInitData(init, TOKEN, NOW)).toEqual({ id: 8144320404, first_name: "Евгений" });
  });

  it("отклоняет подмену поля", () => {
    const init = makeInitData({ auth_date: fresh, user });
    const tampered = init.replace("8144320404", "999");
    expect(verifyInitData(tampered, TOKEN, NOW)).toBeNull();
  });

  it("отклоняет чужой токен бота", () => {
    const init = makeInitData({ auth_date: fresh, user });
    expect(verifyInitData(init, "999:OTHER", NOW)).toBeNull();
  });

  it("отклоняет устаревшие данные", () => {
    const old = String(Math.floor(NOW.getTime() / 1000) - 2 * 86_400);
    const init = makeInitData({ auth_date: old, user });
    expect(verifyInitData(init, TOKEN, NOW)).toBeNull();
  });

  it("отклоняет запрос без hash, пустой токен и пустые данные", () => {
    expect(verifyInitData(`auth_date=${fresh}&user=${encodeURIComponent(user)}`, TOKEN, NOW)).toBeNull();
    expect(verifyInitData(makeInitData({ auth_date: fresh, user }), "", NOW)).toBeNull();
    expect(verifyInitData("", TOKEN, NOW)).toBeNull();
  });
});
