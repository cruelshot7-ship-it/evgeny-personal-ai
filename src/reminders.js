import { dueTasks, markReminded } from "./tasks.js";

/**
 * Отправляет напоминания о наступивших сроках. Порядок: сначала отметка, потом сообщение.
 * Если отправка не удалась, напоминание не повторяется (лучше пропустить, чем дублировать).
 * send(chatId, text) — отправка в Telegram, передаётся снаружи, чтобы тестировать без сети.
 */
export async function sendDueTasks(db, { now = new Date(), send }) {
  const nowIso = now.toISOString();
  let sent = 0;
  for (const task of dueTasks(db, nowIso)) {
    if (!markReminded(db, task.id, nowIso)) continue;
    try {
      await send(
        task.assignee_id,
        `Напоминание: ${task.title}\nЗаказ №${task.order_id} · ${task.client_name}\nЗадача №${task.id}. Выполнили — /tdone ${task.id}`,
      );
      sent++;
    } catch (err) {
      console.error("[reminder] не отправлено", task.id, err.message);
    }
  }
  return sent;
}
