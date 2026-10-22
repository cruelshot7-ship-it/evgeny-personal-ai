/**
 * Telegram-бот: long polling через Bot API (без внешних библиотек).
 * Переменные окружения: BOT_TOKEN (обязательно), DIRECTOR_ID (Telegram ID директоров через запятую:
 * получают роль «директор» при каждом запуске и утреннюю сводку в 08:30 по Минску),
 * DB_PATH (по умолчанию ./data/orders.db). Остальных сотрудников директор добавляет командой /staff.
 * Токен в код не пишем.
 */
import { openDb } from "./db.js";
import { makeApi, pollOnce } from "./telegram.js";
import { sendDueTasks } from "./reminders.js";
import { directorIds, ensureDirectors } from "./staff.js";
import { sendDailySummary } from "./summary.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Задайте BOT_TOKEN в переменных окружения.");
  process.exit(1);
}

const db = openDb(process.env.DB_PATH ?? "./data/orders.db");
// Без директоров доступа нет никому (fail closed): добавлять сотрудников некому.
if (ensureDirectors(db, process.env.DIRECTOR_ID) === 0 && directorIds(db).length === 0) {
  console.error("DIRECTOR_ID не задан и директоров в базе нет: доступа не будет ни у кого.");
}
const call = makeApi(token);
const state = { offset: 0 };

async function loop() {
  for (;;) {
    try {
      await pollOnce({ call, db, state });
    } catch (err) {
      console.error("[bot]", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const send = (chatId, text) => call("sendMessage", { chat_id: chatId, text });

// напоминания о сроках и утренняя сводка директорам: проверка раз в минуту
setInterval(() => {
  const now = new Date();
  sendDueTasks(db, { now, send }).catch((err) => console.error("[reminders]", err.message));
  sendDailySummary(db, { now, send, directorId: directorIds(db).join(",") }).catch((err) =>
    console.error("[summary]", err.message),
  );
}, 60_000);

loop();
