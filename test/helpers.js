/** Сотрудники для тестов. Telegram ID и роли выдуманные. */
export const director = { id: "42", name: "Ирина", role: "директор" };
export const manager = { id: "11", name: "Мария", role: "менеджер" };
export const designer = { id: "12", name: "Денис", role: "дизайнер" };
export const assembler = { id: "14", name: "Андрей", role: "сборщик" };

/** Заводит сотрудника в таблицу users напрямую (без команд), чтобы тест не зависел от /staff. */
export function seedUser(db, { id, name = "", role }) {
  db.prepare("insert into users (telegram_id, name, role, active, created_at) values (?, ?, ?, 1, ?)").run(
    id,
    name,
    role,
    "2026-10-10T00:00:00.000Z",
  );
}
