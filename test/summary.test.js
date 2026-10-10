import assert from "node:assert/strict";
import test from "node:test";
import { openDb } from "../src/db.js";
import { createOrder, completeCurrentStage } from "../src/orders.js";
import { createTask } from "../src/tasks.js";
import { buildSummary, minskParts, sendDailySummary } from "../src/summary.js";

// 10 октября 2026, 10:00 по Минску = 07:00 UTC
const NOW = new Date("2026-10-10T07:00:00Z");

function setup() {
  const db = openDb(":memory:");
  const a = createOrder(db, { clientName: "Иванов Пётр", now: NOW });
  createOrder(db, { clientName: "Петрова Анна", now: NOW });
  completeCurrentStage(db, a, { userId: "1", now: NOW });
  // просрочено: срок 09.10 10:00 Минск
  createTask(db, { orderId: a, title: "вчера звонить", dueAt: "2026-10-09T07:00:00.000Z", assigneeId: "42", assigneeName: "Ирина", now: new Date("2026-10-08T07:00:00Z") });
  // сегодня: срок 10.10 15:00 Минск
  createTask(db, { orderId: a, title: "согласовать размеры", dueAt: "2026-10-10T12:00:00.000Z", assigneeId: "42", assigneeName: "Ирина", now: NOW });
  return db;
}

test("минское время: 08:30 по Минску — это 05:30 UTC", () => {
  assert.deepEqual(minskParts(new Date("2026-10-10T05:30:00Z")), { dateKey: "2026-10-10", hour: 8, minute: 30 });
  assert.deepEqual(minskParts(new Date("2026-10-09T21:15:00Z")), { dateKey: "2026-10-10", hour: 0, minute: 15 });
});

test("сводка показывает просрочку, сегодняшние задачи и открытые заказы с этапом", () => {
  const text = buildSummary(setup(), NOW);
  assert.match(text, /Сводка на 10\.10 \(Минск\)/);
  assert.match(text, /Просрочено: 1\n• №1 · вчера звонить — Иванов Пётр, Ирина/);
  assert.match(text, /Сегодня: 1\n• №2 · согласовать размеры/);
  assert.match(text, /Открытых заказов: 2/);
  assert.match(text, /• №1 · Иванов Пётр — сейчас дизайн \(дизайнер\)/);
  assert.match(text, /• №2 · Петрова Анна — сейчас замер \(менеджер\)/);
});

test("пустые разделы пишутся как «нет», без падения", () => {
  const db = openDb(":memory:");
  const text = buildSummary(db, NOW);
  assert.match(text, /Просрочено: 0\nнет/);
  assert.match(text, /Открытых заказов: 0/);
});

test("сводка уходит директору один раз в день, после 08:30 по Минску", async () => {
  const db = setup();
  const sent = [];
  const send = async (chatId, text) => sent.push([chatId, text]);
  const at = (iso) => new Date(iso);
  assert.equal(await sendDailySummary(db, { now: at("2026-10-10T05:29:00Z"), send, directorId: "7" }), false, "до 08:30 ещё нельзя");
  assert.equal(await sendDailySummary(db, { now: at("2026-10-10T05:30:00Z"), send, directorId: "7" }), true);
  assert.equal(await sendDailySummary(db, { now: at("2026-10-10T06:00:00Z"), send, directorId: "7" }), false, "второй раз в тот же день не шлём");
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "7");
  // перезапуск бота в тот же день тоже ничего не шлёт: дата хранится в базе
  assert.equal(await sendDailySummary(db, { now: at("2026-10-10T06:30:00Z"), send, directorId: "7" }), false);
  assert.equal(await sendDailySummary(db, { now: at("2026-10-11T05:30:00Z"), send, directorId: "7" }), true, "на следующий день снова");
});

test("несколько получателей через запятую: каждый получает, сбой одного не мешает другому", async () => {
  const db = setup();
  const sent = [];
  const send = async (chatId, text) => {
    if (chatId === "7") throw new Error("Telegram 500");
    sent.push(chatId);
  };
  const silent = console.error;
  console.error = () => {};
  try {
    const ok = await sendDailySummary(db, { now: new Date("2026-10-10T06:00:00Z"), send, directorId: "7, 813824021" });
    assert.equal(ok, true, "хотя бы одному отправлено");
  } finally {
    console.error = silent;
  }
  assert.deepEqual(sent, ["813824021"]);
  assert.equal(await sendDailySummary(db, { now: new Date("2026-10-10T07:00:00Z"), send, directorId: "7, 813824021" }), false, "в тот же день повтора нет");
});

test("без DIRECTOR_ID сводка не отправляется", async () => {
  const db = setup();
  assert.equal(await sendDailySummary(db, { now: new Date("2026-10-10T06:00:00Z"), send: async () => {}, directorId: "" }), false);
});

test("если отправка упала, сегодня повтора не будет", async () => {
  const db = setup();
  const silent = console.error;
  console.error = () => {};
  try {
    const ok = await sendDailySummary(db, {
      now: new Date("2026-10-10T06:00:00Z"),
      send: async () => {
        throw new Error("Telegram 500");
      },
      directorId: "7",
    });
    assert.equal(ok, false);
  } finally {
    console.error = silent;
  }
  assert.equal(await sendDailySummary(db, { now: new Date("2026-10-10T07:00:00Z"), send: async () => {}, directorId: "7" }), false);
});
