import assert from "node:assert/strict";
import test from "node:test";
import { handle } from "../src/commands.js";
import { openDb } from "../src/db.js";
import { assembler, designer, director, manager } from "./helpers.js";

const now = new Date("2026-10-10T10:00:00Z");
const ctx = { user: director, now };
const as = (user) => ({ user, now });

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

test("создавать заказы могут менеджер и директор, остальные нет", () => {
  const db = openDb(":memory:");
  assert.match(handle(db, "/new Иванов Пётр", as(designer)), /Создавать заказы могут менеджер и директор/);
  assert.equal(handle(db, "/list", ctx), "Открытых заказов нет.", "заказ не создан");
  assert.match(handle(db, "/new Иванов Пётр", as(manager)), /Заказ №1 создан/);
});

test("/done: этап закрывает только его роль, директор — любой", () => {
  const db = openDb(":memory:");
  handle(db, "/new Иванов Пётр", as(manager));
  // замер — очередь менеджера, дизайнер заказ не видит вовсе
  assert.match(handle(db, "/done 1", as(designer)), /Заказа №1 нет в вашей очереди/);
  assert.match(handle(db, "/done 1", as(manager)), /Этап «замер» выполнен/);
  // теперь очередь дизайнера: менеджер видит заказ, но закрыть дизайн не может
  assert.match(handle(db, "/done 1", as(manager)), /Этап «дизайн» закрывает дизайнер\. Ваша роль: менеджер/);
  assert.match(handle(db, "/done 1", as(designer)), /Этап «дизайн» выполнен/);
  assert.match(handle(db, "/done 1", ctx), /Этап «раскрой» выполнен/);
});

test("рабочая очередь: исполнитель видит только заказы своего этапа, и не может угадать номер", () => {
  const db = openDb(":memory:");
  handle(db, "/new Иванов Пётр", as(manager));
  handle(db, "/new Петрова Анна", as(manager));
  handle(db, "/done 1", as(manager)); // №1 перешёл к дизайну, №2 на замере
  assert.equal(handle(db, "/list", as(designer)), "№1 · Иванов Пётр · сейчас: дизайн (дизайнер)");
  assert.match(handle(db, "/list", as(manager)), /№2 · Петрова Анна/);
  assert.equal(handle(db, "/list", as(assembler)), "Открытых заказов нет.");
  assert.match(handle(db, "/order 2", as(designer)), /Заказа №2 нет в вашей очереди/);
  assert.match(handle(db, "/order 99", as(designer)), /Заказа №99 нет в вашей очереди/, "несуществующий и чужой неразличимы");
  assert.match(handle(db, "/call 2 2026-10-12 10:00 позвонить", as(designer)), /Заказа №2 нет в вашей очереди/);
  assert.match(handle(db, "/call 1 2026-10-12 10:00 уточнить макет", as(designer)), /Задача №1 поставлена/);
});

test("справка зависит от роли: /new и /staff видны только тем, кому доступны", () => {
  const db = openDb(":memory:");
  assert.doesNotMatch(handle(db, "привет", as(designer)), /\/new|\/staff/);
  assert.match(handle(db, "привет", as(manager)), /\/new/);
  assert.doesNotMatch(handle(db, "привет", as(manager)), /\/staff/);
  assert.match(handle(db, "привет", ctx), /\/staff add/);
});

test("/staff: только директор; добавить, сменить роль, отключить, включить", () => {
  const db = openDb(":memory:");
  assert.match(handle(db, "/staff", as(manager)), /ведёт директор/);
  assert.match(handle(db, "/staff add 500 монтажник Иван Петров", ctx), /Добавлен: 500 · монтажник/);
  assert.match(handle(db, "/staff add 500 оператор-чпу Иван", ctx), /Обновлён: 500 · оператор_чпу/);
  assert.match(handle(db, "/staff", ctx), /• 500 · оператор_чпу · Иван/);
  assert.match(handle(db, "/staff off 500", ctx), /отключён/);
  assert.match(handle(db, "/staff", ctx), /× 500 · оператор_чпу · Иван \(отключён\)/);
  assert.match(handle(db, "/staff on 500", ctx), /включён/);
  assert.match(handle(db, "/staff add abc монтажник", ctx), /Telegram ID — число/);
  assert.match(handle(db, "/staff add 501 бухгалтер", ctx), /Роль не из списка/);
  assert.match(handle(db, "/staff off 999", ctx), /нет в списке/);
  assert.match(handle(db, "/staff удалить 500", ctx), /Формат:/);
});

test("директор не может изменить или отключить сам себя", () => {
  const db = openDb(":memory:");
  assert.match(handle(db, "/staff add 42 монтажник", ctx), /Свою роль менять нельзя/);
  assert.match(handle(db, "/staff off 42", ctx), /Себя отключить нельзя/);
});
