import { currentStage, listOpenOrders } from "./orders.js";

/** Беларусь: UTC+3 без перехода на летнее время. */
const MINSK_OFFSET_MS = 3 * 3600_000;
const TZ = "Europe/Minsk";

export function minskParts(now) {
  const m = new Date(now.getTime() + MINSK_OFFSET_MS);
  return { dateKey: m.toISOString().slice(0, 10), hour: m.getUTCHours(), minute: m.getUTCMinutes() };
}

function fmt(iso) {
  return new Date(iso).toLocaleString("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function taskLine(t) {
  return `• №${t.id} · ${t.title} — ${t.client_name}, ${t.assignee_name || "без имени"}, срок ${fmt(t.due_at)}`;
}

/** Утренняя сводка: что просрочено, что сегодня, какие заказы открыты и на каком этапе. */
export function buildSummary(db, now = new Date()) {
  const { dateKey } = minskParts(now);
  const nowIso = now.toISOString();
  const dayStart = Date.parse(`${dateKey}T00:00:00+03:00`);
  const dayEnd = new Date(dayStart + 24 * 3600_000).toISOString();
  const overdue = db
    .prepare(
      `select t.*, o.client_name from tasks t join orders o on o.id = t.order_id
       where t.done_at is null and t.due_at < ? order by t.due_at`,
    )
    .all(nowIso);
  const today = db
    .prepare(
      `select t.*, o.client_name from tasks t join orders o on o.id = t.order_id
       where t.done_at is null and t.due_at >= ? and t.due_at < ? order by t.due_at`,
    )
    .all(nowIso, dayEnd);
  const open = listOpenOrders(db);
  const [, mm, dd] = dateKey.split("-");
  const lines = [`Сводка на ${dd}.${mm} (Минск)`, ""];
  lines.push(`Просрочено: ${overdue.length}`, ...(overdue.length ? overdue.map(taskLine) : ["нет"]), "");
  lines.push(`Сегодня: ${today.length}`, ...(today.length ? today.map(taskLine) : ["нет"]), "");
  lines.push(`Открытых заказов: ${open.length}`);
  for (const o of open) {
    const cur = currentStage(o);
    lines.push(`• №${o.id} · ${o.client_name} — сейчас ${cur ? `${cur.stage} (${cur.role})` : "—"}`);
  }
  return lines.join("\n");
}

export function getKv(db, key) {
  return db.prepare("select value from kv where key = ?").get(key)?.value ?? null;
}

/**
 * Шлёт сводку руководителям один раз в день, после atHour:atMinute по Минску.
 * directorId — один ID или несколько через запятую.
 * Дата отмечается до отправки: перезапуск бота не пришлёт сводку второй раз,
 * и если одному получателю отправка не удалась, повтора не будет.
 */
export async function sendDailySummary(db, { now = new Date(), send, directorId, atHour = 8, atMinute = 30 }) {
  const ids = String(directorId ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return false;
  const { dateKey, hour, minute } = minskParts(now);
  if (hour * 60 + minute < atHour * 60 + atMinute) return false;
  const claimed = db
    .prepare(
      "insert into kv (key, value) values ('summary_sent_on', ?) on conflict(key) do update set value = excluded.value where kv.value <> excluded.value",
    )
    .run(dateKey);
  if (claimed.changes !== 1) return false;
  const text = buildSummary(db, now);
  let sent = 0;
  for (const id of ids) {
    try {
      await send(id, text);
      sent += 1;
    } catch (err) {
      console.error("[summary] не отправлено", id, err.message);
    }
  }
  return sent > 0;
}
