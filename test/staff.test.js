import assert from "node:assert/strict";
import test from "node:test";
import { openDb } from "../src/db.js";
import { createOrder, getOrder, OrderError } from "../src/orders.js";
import { addStaff, canViewOrder, directorIds, ensureDirectors, getActiveUser, normalizeRole, parseIds, setStaffActive } from "../src/staff.js";

test("parseIds: запятые, пробелы, мусор", () => {
  assert.deepEqual(parseIds("7, 813824021"), ["7", "813824021"]);
  assert.deepEqual(parseIds(" ,abc, 12 ,@user,"), ["12"]);
  assert.deepEqual(parseIds(undefined), []);
  assert.deepEqual(parseIds(""), []);
});

test("normalizeRole понимает регистр, дефис и пробел, чужую роль не пропускает", () => {
  assert.equal(normalizeRole("Оператор-ЧПУ"), "оператор_чпу");
  assert.equal(normalizeRole(" монтажник "), "монтажник");
  assert.equal(normalizeRole("бухгалтер"), null);
  assert.equal(normalizeRole(""), null);
});

test("ensureDirectors создаёт директоров, повторный запуск ничего не дублирует и возвращает доступ", () => {
  const db = openDb(":memory:");
  assert.equal(ensureDirectors(db, "7, 813824021"), 2);
  assert.deepEqual(directorIds(db), ["7", "813824021"]);
  db.prepare("update users set active = 0 where telegram_id = '7'").run();
  assert.equal(getActiveUser(db, "7"), null);
  ensureDirectors(db, "7, 813824021");
  assert.equal(getActiveUser(db, "7").role, "директор", "владелец не теряет доступ при перезапуске");
  assert.equal(db.prepare("select count(*) as n from users").get().n, 2);
});

test("без DIRECTOR_ID директоров нет и доступа нет", () => {
  const db = openDb(":memory:");
  assert.equal(ensureDirectors(db, ""), 0);
  assert.deepEqual(directorIds(db), []);
  assert.equal(getActiveUser(db, "42"), null);
});

test("ensureDirectors возвращает сотруднику роль директора и не стирает имя", () => {
  const db = openDb(":memory:");
  addStaff(db, { actorId: "1", telegramId: "5", role: "сборщик", name: "Пётр" });
  ensureDirectors(db, "5");
  assert.deepEqual({ ...getActiveUser(db, "5") }, { id: "5", name: "Пётр", role: "директор" });
});

test("отключённый сотрудник не получает доступ, история остаётся", () => {
  const db = openDb(":memory:");
  addStaff(db, { actorId: "1", telegramId: "5", role: "монтажник", name: "Пётр" });
  assert.equal(getActiveUser(db, "5").role, "монтажник");
  setStaffActive(db, { actorId: "1", telegramId: "5", active: false });
  assert.equal(getActiveUser(db, "5"), null);
  assert.equal(db.prepare("select count(*) as n from users where telegram_id = '5'").get().n, 1);
  setStaffActive(db, { actorId: "1", telegramId: "5", active: true });
  assert.equal(getActiveUser(db, "5").role, "монтажник");
});

test("addStaff проверяет ID, роль и самого себя", () => {
  const db = openDb(":memory:");
  assert.throws(() => addStaff(db, { actorId: "1", telegramId: "@ivan", role: "сборщик" }), OrderError);
  assert.throws(() => addStaff(db, { actorId: "1", telegramId: "5", role: "кладовщик" }), /Роль не из списка/);
  assert.throws(() => addStaff(db, { actorId: "5", telegramId: "5", role: "сборщик" }), /Свою роль/);
  assert.throws(() => setStaffActive(db, { actorId: "5", telegramId: "5", active: false }), /Себя отключить/);
  assert.equal(db.prepare("select count(*) as n from users").get().n, 0, "неудачные попытки ничего не записали");
});

test("имя сотрудника обрезается до 80 символов", () => {
  const db = openDb(":memory:");
  addStaff(db, { actorId: "1", telegramId: "5", role: "сборщик", name: "я".repeat(200) });
  assert.equal(getActiveUser(db, "5").name.length, 80);
});

test("canViewOrder: директор и менеджер видят всё, остальные — только свой текущий этап", () => {
  const db = openDb(":memory:");
  const id = createOrder(db, { clientName: "Иванов Пётр" });
  const order = getOrder(db, id); // текущий этап — замер (менеджер)
  assert.equal(canViewOrder("директор", order), true);
  assert.equal(canViewOrder("менеджер", order), true);
  assert.equal(canViewOrder("дизайнер", order), false);
  assert.equal(canViewOrder("сборщик", order), false);
  assert.equal(canViewOrder(undefined, order), false, "без роли — нет");
  const closed = { ...order, stages: order.stages.map((s) => ({ ...s, done_at: "x" })) };
  assert.equal(canViewOrder("монтажник", closed), false, "у закрытого заказа нет текущего этапа");
});
