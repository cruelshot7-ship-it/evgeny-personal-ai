import { DIRECTOR, STAGES, STAGE_ROLE } from "./stages.js";

export class OrderError extends Error {}

/** Создаёт заказ и все его этапы в одной транзакции. Возвращает номер заказа. */
export function createOrder(db, { clientName, note = "", now = new Date() }) {
  const name = String(clientName ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    throw new OrderError("Имя клиента: от 2 до 120 символов. Пример: /new Иванов Пётр | кухня 3 м");
  }
  db.exec("begin");
  try {
    const res = db
      .prepare("insert into orders (client_name, note, created_at) values (?, ?, ?)")
      .run(name, String(note).trim().slice(0, 500), now.toISOString());
    const orderId = Number(res.lastInsertRowid);
    const insert = db.prepare("insert into order_stages (order_id, position, stage, role) values (?, ?, ?, ?)");
    STAGES.forEach((stage, i) => insert.run(orderId, i + 1, stage, STAGE_ROLE[stage]));
    db.exec("commit");
    return orderId;
  } catch (err) {
    db.exec("rollback");
    throw err;
  }
}

export function getOrder(db, id) {
  const order = db.prepare("select * from orders where id = ?").get(id);
  if (!order) return null;
  const stages = db.prepare("select * from order_stages where order_id = ? order by position").all(id);
  return { ...order, stages };
}

/** Текущий этап — первый незавершённый. У закрытого заказа его нет. */
export function currentStage(order) {
  return order.stages.find((s) => s.done_at == null) ?? null;
}

/**
 * Отмечает текущий этап выполненным. Закрыть этап может только роль этапа или директор:
 * без роли (role не передан) отказ. Условие в UPDATE не даёт отметить один этап дважды,
 * даже если два человека нажали одновременно.
 */
export function completeCurrentStage(db, id, { userId, role, now = new Date() }) {
  const order = getOrder(db, id);
  if (!order) throw new OrderError(`Заказа №${id} нет.`);
  if (order.closed_at) throw new OrderError(`Заказ №${id} уже закрыт.`);
  const stage = currentStage(order);
  if (role !== DIRECTOR && role !== stage.role) {
    throw new OrderError(`Этап «${stage.stage}» закрывает ${stage.role}. Ваша роль: ${role ?? "не задана"}.`);
  }
  db.exec("begin");
  try {
    const res = db
      .prepare("update order_stages set done_at = ?, done_by = ? where id = ? and done_at is null")
      .run(now.toISOString(), String(userId), stage.id);
    if (res.changes !== 1) throw new OrderError("Этот этап уже отмечен. Откройте заказ, посмотрите текущий.");
    const left = db
      .prepare("select count(*) as n from order_stages where order_id = ? and done_at is null")
      .get(id).n;
    if (left === 0) db.prepare("update orders set closed_at = ? where id = ?").run(now.toISOString(), id);
    db.exec("commit");
    return { stage: stage.stage, closed: left === 0 };
  } catch (err) {
    db.exec("rollback");
    throw err;
  }
}

/** Открытые заказы по номеру. */
export function listOpenOrders(db) {
  return db
    .prepare("select id from orders where closed_at is null order by id")
    .all()
    .map((row) => getOrder(db, row.id));
}
