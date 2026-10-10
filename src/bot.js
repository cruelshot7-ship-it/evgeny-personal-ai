/**
 * Telegram-бот: long polling через Bot API (без внешних библиотек).
 * Переменные окружения: BOT_TOKEN (обязательно), ALLOWED_IDS (Telegram ID через запятую),
 * DB_PATH (по умолчанию ./data/orders.db), DIRECTOR_ID (получает утреннюю сводку в 08:30 по Минску).
 * Токен в код не пишем.
 */
import { openDb } from "./db.js";
import { makeApi, pollOnce } from "./telegram.js";
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
const call = makeApi(token);
const state = { offset: 0 };

async function loop() {
  for (;;) {
    try {
      await pollOnce({ call, db, allowed, state });
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
