import assert from "node:assert/strict";
import test from "node:test";
import { handle } from "../src/commands.js";
import { openDb } from "../src/db.js";

const now = new Date("2026-10-10T10:00:00Z");
const ctx = { userId: "42", now };

test("/new создаёт заказ и показывает карточку", () => {
  const db = openDb(":memory:");
  const reply = handle(db, "/new Иванов Пётр | кухня 3 м", ctx);
  assert.match(reply, /Заказ №1 создан/);
  assert.match(reply, /▶ замер — менеджер ← сейчас/);
  assert.match(reply, /Заметка: кухня 3 м/);
});

test("/new без имени клиента возвращает подсказку, а не падает", () => {
  const db = openDb(":memory:");
  assert.match(handle(db, "/new", ctx), /Имя клиента: от 2 до 120 символов/);
});

test("/list показывает открытые заказы и текущий этап", () => {
  const db = openDb(":memory:");
  assert.equal(handle(db, "/list", ctx), "Открытых заказов нет.");
  handle(db, "/new Иванов Пётр", ctx);
  handle(db, "/new Петрова Анна", ctx);
  handle(db, "/done 1", ctx);
  const reply = handle(db, "/list", ctx);
  assert.match(reply, /№1 · Иванов Пётр · сейчас: дизайн \(дизайнер\)/);
  assert.match(reply, /№2 · Петрова Анна · сейчас: замер \(менеджер\)/);
});

test("/done отмечает этап и пишет, кто это сделал", () => {
  const db = openDb(":memory:");
  handle(db, "/new Иванов Пётр", ctx);
  assert.match(handle(db, "/done 1", ctx), /Этап «замер» выполнен\. Смотрите \/order 1\./);
  assert.match(handle(db, "/order 1", ctx), /✅ замер — менеджер, сделано/);
});

test("/done и /order с неверным номером отвечают понятно", () => {
  const db = openDb(":memory:");
  assert.match(handle(db, "/done abc", ctx), /Номер заказа — число/);
  assert.match(handle(db, "/order", ctx), /Номер заказа — число/);
  assert.match(handle(db, "/order 7", ctx), /Заказа №7 нет/);
});

test("команда с именем бота и неизвестный текст", () => {
  const db = openDb(":memory:");
  handle(db, "/new Иванов Пётр", ctx);
  assert.match(handle(db, "/order@ruksha_mebel_bot 1", ctx), /Заказ №1/);
  assert.match(handle(db, "привет", ctx), /Команды:/);
});
