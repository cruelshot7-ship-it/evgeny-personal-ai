import { handle } from "./commands.js";
import { getActiveUser } from "./staff.js";

/** Вызов метода Bot API. base нужен, чтобы в тестах указать локальную заглушку вместо api.telegram.org. */
export function makeApi(token, base = "https://api.telegram.org") {
  const root = `${base}/bot${token}`;
  return async function call(method, body) {
    const res = await fetch(`${root}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(65_000),
    });
    return res.json();
  };
}

/**
 * Один проход опроса: забирает новые сообщения, отвечает на каждое.
 * state.offset продвигается по update_id, чтобы сообщение не пришло дважды.
 * Доступ только у активных сотрудников из таблицы users. Остальным бот отвечает их собственным
 * Telegram ID, чтобы они могли передать его директору, и больше ничего не делает.
 */
export async function pollOnce({ call, db, state, now = () => new Date(), timeout = 50 }) {
  const data = await call("getUpdates", { offset: state.offset, timeout, allowed_updates: ["message"] });
  const updates = data.result ?? [];
  for (const update of updates) {
    state.offset = update.update_id + 1;
    const msg = update.message;
    if (!msg?.text || !msg.from) continue;
    const userId = String(msg.from.id);
    const user = getActiveUser(db, userId);
    const text = user
      ? handle(db, msg.text, { user: { ...user, name: user.name || msg.from.first_name || "" }, now: now() })
      : `Нет доступа. Ваш Telegram ID: ${userId}. Пришлите его директору, он добавит вас.`;
    await call("sendMessage", { chat_id: msg.chat.id, text });
  }
  return updates.length;
}
