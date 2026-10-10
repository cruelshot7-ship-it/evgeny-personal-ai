/**
 * Telegram-бот: long polling через Bot API (без внешних библиотек).
 * Переменные окружения: BOT_TOKEN (обязательно), ALLOWED_IDS (Telegram ID через запятую),
 * DB_PATH (по умолчанию ./data/orders.db), DIRECTOR_ID (получает утреннюю сводку в 08:30 по Минску).
 * Токен в код не пишем.
 */
import { openDb } from "./db.js";
import { handle } from "./commands.js";
import { sendDueTasks } from "./reminders.js";
import { sendDailySummary } from "./summary.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Задайте BOT_TOKEN в переменных окружения.");
  process.exit(1);
}

// Пустой список — никому нет доступа (fail closed).
const allowed = new Set(
  (process.env.ALLOWED_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const db = openDb(process.env.DB_PATH ?? "./data/orders.db");
const api = `https://api.telegram.org/bot${token}`;
let offset = 0;

async function call(method, body) {
  const res = await fetch(`${api}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65_000),
  });
  return res.json();
}

async function loop() {
  for (;;) {
    try {
      const data = await call("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] });
      for (const update of data.result ?? []) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text || !msg.from) continue;
        const userId = String(msg.from.id);
        const text = allowed.has(userId)
          ? handle(db, msg.text, { userId, userName: msg.from.first_name ?? "", now: new Date() })
          : "Нет доступа. Попросите директора добавить ваш ID.";
        await call("sendMessage", { chat_id: msg.chat.id, text });
      }
    } catch (err) {
      console.error("[bot]", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const send = (chatId, text) => call("sendMessage", { chat_id: chatId, text });

// напоминания о сроках и утренняя сводка руководителю: проверка раз в минуту
setInterval(() => {
  const now = new Date();
  sendDueTasks(db, { now, send }).catch((err) => console.error("[reminders]", err.message));
  sendDailySummary(db, { now, send, directorId: process.env.DIRECTOR_ID }).catch((err) =>
    console.error("[summary]", err.message),
  );
}, 60_000);

loop();
