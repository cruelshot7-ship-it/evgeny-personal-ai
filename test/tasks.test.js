import assert from "node:assert/strict";
import test from "node:test";
import { handle } from "../src/commands.js";
import { openDb } from "../src/db.js";
import { sendDueTasks } from "../src/reminders.js";
import { completeTask, createTask, dueTasks, markReminded, parseMinskDateTime } from "../src/tasks.js";
import { createOrder, OrderError } from "../src/orders.js";
import { director } from "./helpers.js";

const NOW = new Date("2026-10-10T10:00:00Z");

function setup() {
  const db = openDb(":memory:");
  const orderId = createOrder(db, { clientName: "Иванов Пётр", now: NOW });
  return { db, orderId };
}

test("срок вводят по Минску: 10:00 Минск — это 07:00 UTC", () => {
  assert.equal(parseMinskDateTime("2026-10-12", "10:00"), "2026-10-12T07:00:00.000Z");
  assert.equal(parseMinskDateTime("2026-10-12", "2:05"), "2026-10-11T23:05:00.000Z");
});

test("несуществующая дата и кривое время отклоняются", () => {
  assert.throws(() => parseMinskDateTime("2026-02-31", "10:00"), OrderError);
  assert.throws(() => parseMinskDateTime("2026-13-01", "10:00"), OrderError);
  assert.throws(() => parseMinskDateTime("2026-10-12", "25:00"), OrderError);
  assert.throws(() => parseMinskDateTime("12.10.2026", "10:00"), OrderError);
});

test("задача с прошедшим сроком и задача к закрытому заказу не создаются", () => {
  const { db, orderId } = setup();
  assert.throws(
    () => createTask(db, { orderId, title: "позвонить", dueAt: "2026-10-09T07:00:00.000Z", assigneeId: "1", now: NOW }),
    /Срок уже прошёл/,
  );
  for (let i = 0; i < 5; i++) handle(db, `/done ${orderId}`, { user: director, now: NOW });
  assert.throws(
    () => createTask(db, { orderId, title: "позвонить", dueAt: "2026-10-12T07:00:00.000Z", assigneeId: "1", now: NOW }),
    /закрыт/,
  );
});

test("напоминание приходит в срок и один раз", async () => {
  const { db, orderId } = setup();
  createTask(db, { orderId, title: "позвонить клиенту", dueAt: "2026-10-10T10:30:00.000Z", assigneeId: "42", now: NOW });
  const sent = [];
  const send = async (chatId, text) => sent.push([chatId, text]);

  assert.equal(await sendDueTasks(db, { now: new Date("2026-10-10T10:00:00Z"), send }), 0, "срок ещё не наступил");
  assert.equal(await sendDueTasks(db, { now: new Date("2026-10-10T10:30:00Z"), send }), 1);
  assert.equal(await sendDueTasks(db, { now: new Date("2026-10-10T10:31:00Z"), send }), 0, "второго раза не будет");
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "42");
  assert.match(sent[0][1], /позвонить клиенту/);
  assert.match(sent[0][1], /Иванов Пётр/);
});

test("если отправка упала, напоминание не повторяется (лучше пропустить, чем дублировать)", async () => {
  const { db, orderId } = setup();
  createTask(db, { orderId, title: "позвонить клиенту", dueAt: "2026-10-10T10:30:00.000Z", assigneeId: "42", now: NOW });
  const failing = async () => {
    throw new Error("Telegram 500");
  };
  const silent = console.error;
  console.error = () => {};
  try {
    assert.equal(await sendDueTasks(db, { now: new Date("2026-10-10T10:30:00Z"), send: failing }), 0);
  } finally {
    console.error = silent;
  }
  assert.equal(dueTasks(db, "2026-10-10T12:00:00.000Z").length, 0);
});

test("два процесса не отправят одно напоминание дважды", () => {
  const { db, orderId } = setup();
  const id = createTask(db, { orderId, title: "позвонить клиенту", dueAt: "2026-10-10T10:30:00.000Z", assigneeId: "42", now: NOW });
  assert.equal(markReminded(db, id, "2026-10-10T10:30:00.000Z"), true);
  assert.equal(markReminded(db, id, "2026-10-10T10:30:01.000Z"), false);
});

test("выполнить задачу может только исполнитель, и один раз", () => {
  const { db, orderId } = setup();
  const id = createTask(db, { orderId, title: "позвонить клиенту", dueAt: "2026-10-12T07:00:00.000Z", assigneeId: "42", now: NOW });
  assert.throws(() => completeTask(db, id, { userId: "7", now: NOW }), /не на вас/);
  completeTask(db, id, { userId: "42", now: NOW });
  assert.throws(() => completeTask(db, id, { userId: "42", now: NOW }), /уже выполнена/);
});

test("команды /call и /tdone в боте", () => {
  const { db, orderId } = setup();
  const ctx = { user: director, now: NOW };
  const reply = handle(db, `/call ${orderId} 2026-10-12 10:00 позвонить уточнить размеры`, ctx);
  assert.match(reply, /Задача №1 поставлена на 2026-10-12 10:00 \(Минск\)/);
  assert.match(handle(db, "/call 1 2026-10-12", ctx), /Срок|Текст задачи/);
  assert.equal(handle(db, "/tdone 1", ctx), "Задача №1 выполнена.");
  assert.match(handle(db, "/tdone 1", ctx), /уже выполнена/);
});
