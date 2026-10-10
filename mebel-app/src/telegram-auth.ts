import { createHmac, timingSafeEqual } from "node:crypto";

export type TgUser = { id: number; first_name: string; username?: string };

/**
 * Проверка initData из Telegram WebApp (серверная сторона).
 * Подпись: HMAC-SHA256 от строки всех полей (без hash), ключ = HMAC("WebAppData", botToken).
 * Возвращает пользователя или null. Токен бота передаётся извне, в коде его нет.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  now: Date = new Date(),
  maxAgeSec = 86_400,
): TgUser | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now.getTime() / 1000 - authDate > maxAgeSec) return null;

  const raw = params.get("user");
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    return typeof user?.id === "number" ? (user as TgUser) : null;
  } catch {
    return null;
  }
}
