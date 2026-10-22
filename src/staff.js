import { currentStage, OrderError } from "./orders.js";
import { DIRECTOR, ROLES } from "./stages.js";

const ID_RE = /^\d{1,20}$/;

/** «7, 813824021» → ["7", "813824021"]. Пустое и мусорное отбрасывается. */
export function parseIds(csv) {
  return String(csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ID_RE.test(s));
}

/** «Оператор-ЧПУ» → «оператор_чпу». Возвращает роль из списка или null. */
export function normalizeRole(text) {
  const role = String(text ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  return ROLES.includes(role) ? role : null;
}

/** Активный сотрудник по Telegram ID. Нет записи или отключён — null, то есть доступа нет. */
export function getActiveUser(db, telegramId) {
  return (
    db
      .prepare("select telegram_id as id, name, role from users where telegram_id = ? and active = 1")
      .get(String(telegramId)) ?? null
  );
}

/**
 * Директора из DIRECTOR_ID: запись создаётся или обновляется при каждом запуске.
 * Так владелец не может потерять доступ, даже если базу пересоздали или его отключили.
 */
export function ensureDirectors(db, csv, now = new Date()) {
  const ids = parseIds(csv);
  const upsert = db.prepare(
    `insert into users (telegram_id, name, role, active, created_at) values (?, '', ?, 1, ?)
     on conflict(telegram_id) do update set role = excluded.role, active = 1`,
  );
  for (const id of ids) upsert.run(id, DIRECTOR, now.toISOString());
  return ids.length;
}

/** Получатели сводки: все активные директора. */
export function directorIds(db) {
  return db
    .prepare("select telegram_id from users where role = ? and active = 1 order by telegram_id")
    .all(DIRECTOR)
    .map((r) => r.telegram_id);
}

export function listStaff(db) {
  return db.prepare("select telegram_id as id, name, role, active from users order by active desc, role, telegram_id").all();
}

/**
 * Добавляет сотрудника или меняет роль и имя существующего (и включает его снова).
 * Себя менять нельзя: так директор случайно не лишит себя прав.
 */
export function addStaff(db, { actorId, telegramId, role, name = "", now = new Date() }) {
  const id = String(telegramId ?? "").trim();
  if (!ID_RE.test(id)) throw new OrderError("Telegram ID — число. Пример: /staff add 123456789 монтажник Иван");
  const normalized = normalizeRole(role);
  if (!normalized) throw new OrderError(`Роль не из списка. Допустимо: ${ROLES.join(", ")}.`);
  if (id === String(actorId)) throw new OrderError("Свою роль менять нельзя.");
  const label = String(name).trim().slice(0, 80);
  const existed = db.prepare("select 1 from users where telegram_id = ?").get(id) != null;
  db.prepare(
    `insert into users (telegram_id, name, role, active, created_at) values (?, ?, ?, 1, ?)
     on conflict(telegram_id) do update set role = excluded.role, name = excluded.name, active = 1`,
  ).run(id, label, normalized, now.toISOString());
  return { created: !existed, role: normalized };
}

/** Отключает или включает сотрудника. История (кто закрыл этап) сохраняется. Себя отключить нельзя. */
export function setStaffActive(db, { actorId, telegramId, active }) {
  const id = String(telegramId ?? "").trim();
  if (!ID_RE.test(id)) throw new OrderError("Telegram ID — число. Пример: /staff off 123456789");
  if (id === String(actorId)) throw new OrderError("Себя отключить нельзя.");
  const res = db.prepare("update users set active = ? where telegram_id = ?").run(active ? 1 : 0, id);
  if (res.changes !== 1) throw new OrderError(`Сотрудника с ID ${id} нет в списке.`);
}

/** Создавать заказы могут менеджер и директор. */
export const canCreateOrders = (role) => role === "менеджер" || role === DIRECTOR;

/**
 * Видимость заказа: директор и менеджер видят все, остальные роли — только заказы,
 * у которых текущий этап на их роли (рабочая очередь).
 */
export function canViewOrder(role, order) {
  if (role === DIRECTOR || role === "менеджер") return true;
  const cur = currentStage(order);
  return cur != null && cur.role === role;
}

/** Активные сотрудники роли. */
export function usersWithRole(db, role) {
  return db.prepare("select telegram_id from users where role = ? and active = 1 order by telegram_id").all(role).map((r) => r.telegram_id);
}

/**
 * Кому сообщить после закрытия этапа: исполнителям следующего этапа, а если заказ закрыт, директорам.
 * Сам закрывший не получает сообщение. Возвращает список { to, text }.
 */
export function handoffMessages(db, order, { actorId, closed }) {
  const head = `Заказ №${order.id} · ${order.client_name}`;
  let recipients;
  let text;
  if (closed) {
    recipients = directorIds(db);
    text = `${head}: все этапы выполнены, заказ закрыт.`;
  } else {
    const next = currentStage(order);
    recipients = usersWithRole(db, next.role);
    text = `${head}: теперь ваш этап — «${next.stage}». Карточка: /order ${order.id}`;
  }
  return [...new Set(recipients)].filter((id) => id !== String(actorId)).map((to) => ({ to, text }));
}
