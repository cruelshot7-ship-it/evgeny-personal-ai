import { DatabaseSync } from "node:sqlite";

/**
 * Миграции только вперёд: новая версия — новый элемент в конце массива.
 * Уже применённые версии в schema_migrations пропускаются.
 */
const MIGRATIONS = [
  `
  create table orders (
    id integer primary key autoincrement,
    client_name text not null,
    note text not null default '',
    created_at text not null,
    closed_at text
  );
  create table order_stages (
    id integer primary key autoincrement,
    order_id integer not null references orders(id),
    position integer not null,
    stage text not null,
    role text not null,
    done_at text,
    done_by text,
    unique (order_id, position)
  );
  `,
  `
  create table tasks (
    id integer primary key autoincrement,
    order_id integer not null references orders(id),
    title text not null,
    due_at text not null,
    assignee_id text not null,
    created_at text not null,
    reminded_at text,
    done_at text
  );
  create index tasks_due on tasks (done_at, reminded_at, due_at);
  `,
  `
  alter table tasks add column assignee_name text not null default '';
  create table kv (
    key text primary key,
    value text not null
  );
  `,
];

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec("pragma foreign_keys = on");
  db.exec("create table if not exists schema_migrations (version integer primary key)");
  const applied = new Set(db.prepare("select version from schema_migrations").all().map((r) => r.version));
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1;
    if (applied.has(version)) return;
    db.exec("begin");
    try {
      db.exec(sql);
      db.prepare("insert into schema_migrations (version) values (?)").run(version);
      db.exec("commit");
    } catch (err) {
      db.exec("rollback");
      throw err;
    }
  });
  return db;
}
