import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
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

test("принимает подписанные данные и возвращает пользователя", () => {
  const init = makeInitData({ auth_date: fresh, user });
  assert.deepEqual(verifyInitData(init, TOKEN, NOW), { id: 8144320404, first_name: "Евгений" });
});

test("отклоняет подмену поля", () => {
  const init = makeInitData({ auth_date: fresh, user });
  assert.equal(verifyInitData(init.replace("8144320404", "999"), TOKEN, NOW), null);
});

test("отклоняет чужой токен бота", () => {
  const init = makeInitData({ auth_date: fresh, user });
  assert.equal(verifyInitData(init, "999:OTHER", NOW), null);
});

test("отклоняет устаревшие данные", () => {
  const old = String(Math.floor(NOW.getTime() / 1000) - 2 * 86_400);
  assert.equal(verifyInitData(makeInitData({ auth_date: old, user }), TOKEN, NOW), null);
});

test("отклоняет запрос без hash, пустой токен и пустые данные", () => {
  assert.equal(verifyInitData(`auth_date=${fresh}&user=${encodeURIComponent(user)}`, TOKEN, NOW), null);
  assert.equal(verifyInitData(makeInitData({ auth_date: fresh, user }), "", NOW), null);
  assert.equal(verifyInitData("", TOKEN, NOW), null);
});
