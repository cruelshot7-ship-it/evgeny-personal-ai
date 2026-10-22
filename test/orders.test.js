import assert from "node:assert/strict";
import test from "node:test";
import { openDb } from "../src/db.js";
import { completeCurrentStage, createOrder, currentStage, getOrder, listOpenOrders, OrderError } from "../src/orders.js";

const at = (iso) => new Date(iso);

test("новый заказ получает все этапы по порядку с ролями", () => {
  const db = openDb(":memory:");
  const id = createOrder(db, { clientName: "Иванов Пётр", now: at("2026-10-10T10:00:00Z") });
  const order = getOrder(db, id);
  assert.deepEqual(
    order.stages.map((s) => [s.position, s.stage, s.role]),
    [
      [1, "замер", "менеджер"],
      [2, "дизайн", "дизайнер"],
      [3, "раскрой", "оператор_чпу"],
      [4, "сборка", "сборщик"],
      [5, "монтаж", "монтажник"],
    ],
  );
  assert.equal(currentStage(order).stage, "замер");
  assert.equal(order.closed_at, null);
});

test("этапы идут строго по очереди: текущий всегда первый невыполненный", () => {
  const db = openDb(":memory:");
  const id = createOrder(db, { clientName: "Иванов Пётр" });
  assert.deepEqual(completeCurrentStage(db, id, { userId: "1", role: "директор" }), { stage: "замер", closed: false });
  assert.equal(currentStage(getOrder(db, id)).stage, "дизайн");
  assert.equal(getOrder(db, id).stages[0].done_by, "1");
});

test("повторная отметка того же этапа не проходит", () => {
  const db = openDb(":memory:");
  const id = createOrder(db, { clientName: "Иванов Пётр" });
  completeCurrentStage(db, id, { userId: "1", role: "директор" });
  // второй нажавший видит уже следующий этап, а не пропускает ещё один
  assert.deepEqual(completeCurrentStage(db, id, { userId: "2", role: "директор" }), { stage: "дизайн", closed: false });
  assert.equal(currentStage(getOrder(db, id)).stage, "раскрой");
});

test("после последнего этапа заказ закрывается и уходит из открытых", () => {
  const db = openDb(":memory:");
  const id = createOrder(db, { clientName: "Иванов Пётр" });
  let last;
  for (let i = 0; i < 5; i++) last = completeCurrentStage(db, id, { userId: "1", role: "директор" });
  assert.equal(last.closed, true);
  assert.ok(getOrder(db, id).closed_at);
  assert.deepEqual(listOpenOrders(db), []);
  assert.throws(() => completeCurrentStage(db, id, { userId: "1", role: "директор" }), (err) => err instanceof OrderError);
});

test("имя клиента обязательно и разумной длины", () => {
  const db = openDb(":memory:");
  assert.throws(() => createOrder(db, { clientName: " " }), OrderError);
  assert.throws(() => createOrder(db, { clientName: "А" }), OrderError);
  assert.throws(() => createOrder(db, { clientName: "x".repeat(121) }), OrderError);
  assert.equal(listOpenOrders(db).length, 0, "неудачная попытка не оставляет заказа");
});

test("несуществующий заказ — понятная ошибка", () => {
  const db = openDb(":memory:");
  assert.throws(() => completeCurrentStage(db, 999, { userId: "1", role: "директор" }), /Заказа №999 нет/);
});

test("этап закрывает только его роль или директор, без роли — отказ", () => {
  const db = openDb(":memory:");
  const id = createOrder(db, { clientName: "Иванов Пётр" });
  // текущий этап — замер, его роль менеджер
  assert.throws(() => completeCurrentStage(db, id, { userId: "5", role: "дизайнер" }), /закрывает менеджер\. Ваша роль: дизайнер/);
  assert.throws(() => completeCurrentStage(db, id, { userId: "5" }), /Ваша роль: не задана/);
  assert.equal(currentStage(getOrder(db, id)).stage, "замер", "отказ ничего не отметил");
  assert.deepEqual(completeCurrentStage(db, id, { userId: "6", role: "менеджер" }), { stage: "замер", closed: false });
  // теперь очередь дизайнера: менеджер уже не может
  assert.throws(() => completeCurrentStage(db, id, { userId: "6", role: "менеджер" }), /закрывает дизайнер/);
  assert.deepEqual(completeCurrentStage(db, id, { userId: "7", role: "дизайнер" }), { stage: "дизайн", closed: false });
});
