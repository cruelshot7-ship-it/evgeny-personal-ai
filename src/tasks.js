import { getOrder, OrderError } from "./orders.js";

/** Беларусь живёт по UTC+3 без перехода на летнее время. Срок вводят по времени Минска. */
const MINSK_OFFSET_MS = 3 * 3600_000;

/** «2026-10-12» и «10:00» (Минск) → ISO в UTC. Отсекает несуществующие даты вроде 31 февраля. */
export function parseMinskDateTime(dateStr, timeStr) {
  const d = String(dateStr ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = String(timeStr ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) throw new OrderError("Срок: дата 2026-10-12 и время 10:00 (по Минску).");
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  if (month < 1 || month > 12 || hour > 23 || minute > 59) throw new OrderError("Срок: дата или время не существует.");
  const ms = Date.UTC(year, month - 1, day, hour, minute) - MINSK_OFFSET_MS;
  const back = new Date(ms + MINSK_OFFSET_MS);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    throw new OrderError("Срок: такой даты не существует.");
  }
  return new Date(ms).toISOString();
}

/** Задача к заказу: исполнитель, срок, текст. Напоминание придёт исполнителю в срок. */
export function createTask(db, { orderId, title, dueAt, assigneeId, assigneeName = "", now = new Date() }) {
  const order = getOrder(db, orderId);
  if (!order) throw new OrderError(`Заказа №${orderId} нет.`);
  if (order.closed_at) throw new OrderError(`Заказ №${orderId} закрыт, задачи к нему не ставим.`);
  const text = String(title ?? "").trim();
  if (text.length < 3 || text.length > 200) throw new OrderError("Текст задачи: от 3 до 200 символов.");
  if (new Date(dueAt).getTime() < now.getTime()) throw new OrderError("Срок уже прошёл. Укажите время в будущем.");
  const res = db
    .prepare("insert into tasks (order_id, title, due_at, assignee_id, assignee_name, created_at) values (?, ?, ?, ?, ?, ?)")
    .run(orderId, text, dueAt, String(assigneeId), String(assigneeName).slice(0, 80), now.toISOString());
  return Number(res.lastInsertRowid);
}

/** Задачи, срок которых наступил, по которым ещё не было напоминания и которые не выполнены. */
export function dueTasks(db, nowIso) {
  return db
    .prepare(
      `select t.*, o.client_name from tasks t join orders o on o.id = t.order_id
       where t.done_at is null and t.reminded_at is null and t.due_at <= ? order by t.due_at`,
    )
    .all(nowIso);
}

/** Помечает напоминание отправленным. true — отметка наша, можно слать. Второй процесс получит false. */
export function markReminded(db, id, nowIso) {
  const res = db
    .prepare("update tasks set reminded_at = ? where id = ? and reminded_at is null and done_at is null")
    .run(nowIso, id);
  return res.changes === 1;
}

/** Выполнить задачу может только её исполнитель. */
export function completeTask(db, id, { userId, now = new Date() }) {
  const task = db.prepare("select * from tasks where id = ?").get(id);
  if (!task) throw new OrderError(`Задачи №${id} нет.`);
  if (task.done_at) throw new OrderError(`Задача №${id} уже выполнена.`);
  if (task.assignee_id !== String(userId)) throw new OrderError("Эта задача не на вас.");
  db.prepare("update tasks set done_at = ? where id = ? and done_at is null").run(now.toISOString(), id);
  return task;
}
