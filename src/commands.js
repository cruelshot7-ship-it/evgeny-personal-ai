import { completeCurrentStage, createOrder, currentStage, getOrder, listOpenOrders, OrderError } from "./orders.js";
import { addStaff, canCreateOrders, canViewOrder, listStaff, setStaffActive } from "./staff.js";
import { DIRECTOR } from "./stages.js";
import { completeTask, createTask, parseMinskDateTime } from "./tasks.js";

const TZ = "Europe/Minsk";

const HELP_BASE = [
  "Команды:",
  "/list — заказы (директору и менеджеру все, остальным — те, где сейчас их этап)",
  "/order 3 — карточка заказа №3",
  "/done 3 — отметить текущий этап заказа №3 выполненным (этап закрывает его роль или директор)",
  "/call 3 2026-10-12 10:00 позвонить, уточнить размеры — задача с напоминанием (время по Минску)",
  "/tdone 5 — отметить задачу №5 выполненной (только исполнителю)",
];
const HELP_NEW = "/new Имя клиента | заметка — новый заказ (менеджер, директор)";
const HELP_STAFF = [
  "/staff — список сотрудников",
  "/staff add 123456789 монтажник Иван — добавить или сменить роль",
  "/staff off 123456789 — отключить, /staff on 123456789 — включить",
];

export function helpFor(role) {
  const lines = [...HELP_BASE];
  if (canCreateOrders(role)) lines.splice(1, 0, HELP_NEW);
  if (role === DIRECTOR) lines.push(...HELP_STAFF);
  return lines.join("\n");
}

function fmt(iso) {
  return new Date(iso).toLocaleString("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function parseId(text) {
  if (!/^\d+$/.test(text ?? "")) throw new OrderError("Номер заказа — число. Пример: /order 3");
  return Number(text);
}

/**
 * Заказ, который пользователь вправе видеть. Чужой заказ и несуществующий неразличимы:
 * ответ не подтверждает, что заказ есть.
 */
function visibleOrder(db, id, role) {
  const order = getOrder(db, id);
  if (!order || !canViewOrder(role, order)) {
    throw new OrderError(`Заказа №${id} нет в вашей очереди.`);
  }
  return order;
}

/** Карточка заказа простым текстом (без разметки, чтобы не ломать экранирование). */
export function formatCard(order) {
  const head = `Заказ №${order.id} · ${order.client_name}`;
  const status = order.closed_at ? `закрыт ${fmt(order.closed_at)}` : "открыт";
  const cur = currentStage(order);
  const lines = order.stages.map((s) => {
    if (s.done_at) return `✅ ${s.stage} — ${s.role}, сделано ${fmt(s.done_at)}`;
    if (cur && cur.id === s.id) return `▶ ${s.stage} — ${s.role} ← сейчас`;
    return `· ${s.stage} — ${s.role}`;
  });
  const note = order.note ? [`Заметка: ${order.note}`] : [];
  return [head, `Создан ${fmt(order.created_at)} · ${status}`, ...note, "", "Этапы:", ...lines].join("\n");
}

function handleStaff(db, rest, user) {
  if (user.role !== DIRECTOR) throw new OrderError("Список сотрудников ведёт директор.");
  const [sub = "", idText, ...more] = rest.split(/\s+/).filter(Boolean);
  const action = sub.toLowerCase();
  if (action === "") {
    const rows = listStaff(db);
    if (rows.length === 0) return "Сотрудников нет.";
    return rows
      .map((r) => `${r.active ? "•" : "×"} ${r.id} · ${r.role}${r.name ? ` · ${r.name}` : ""}${r.active ? "" : " (отключён)"}`)
      .join("\n");
  }
  if (action === "add") {
    const [role, ...name] = more;
    const res = addStaff(db, { actorId: user.id, telegramId: idText, role, name: name.join(" ") });
    return `${res.created ? "Добавлен" : "Обновлён"}: ${idText} · ${res.role}.`;
  }
  if (action === "off" || action === "on") {
    setStaffActive(db, { actorId: user.id, telegramId: idText, active: action === "on" });
    return action === "on" ? `Сотрудник ${idText} включён.` : `Сотрудник ${idText} отключён.`;
  }
  throw new OrderError("Формат: /staff, /staff add ID роль имя, /staff off ID, /staff on ID");
}

/**
 * Разбор одного сообщения и ответ. Ничего не пишет в Telegram: только возвращает текст.
 * user — активный сотрудник { id, name, role }; проверка доступа выполняется до вызова.
 */
export function handle(db, text, { user, now = new Date() }) {
  const raw = String(text ?? "").trim();
  const [first = ""] = raw.split(/\s+/);
  const cmd = first.toLowerCase().split("@")[0];
  const rest = raw.slice(first.length).trim();
  try {
    if (cmd === "/new") {
      if (!canCreateOrders(user.role)) throw new OrderError("Создавать заказы могут менеджер и директор.");
      const [name, ...note] = rest.split("|");
      const id = createOrder(db, { clientName: name, note: note.join("|"), now });
      const card = getOrder(db, id);
      return `Заказ №${id} создан.\n\n${formatCard(card)}`;
    }
    if (cmd === "/list") {
      const open = listOpenOrders(db).filter((o) => canViewOrder(user.role, o));
      if (open.length === 0) return "Открытых заказов нет.";
      return open
        .map((o) => {
          const cur = currentStage(o);
          return `№${o.id} · ${o.client_name} · сейчас: ${cur ? `${cur.stage} (${cur.role})` : "—"}`;
        })
        .join("\n");
    }
    if (cmd === "/order") {
      return formatCard(visibleOrder(db, parseId(rest), user.role));
    }
    if (cmd === "/done") {
      const id = parseId(rest);
      visibleOrder(db, id, user.role);
      const { stage, closed } = completeCurrentStage(db, id, { userId: user.id, role: user.role, now });
      return closed ? `Этап «${stage}» выполнен. Заказ №${id} закрыт.` : `Этап «${stage}» выполнен. Смотрите /order ${id}.`;
    }
    if (cmd === "/call") {
      const [idText, date, time, ...title] = rest.split(/\s+/);
      const orderId = parseId(idText);
      visibleOrder(db, orderId, user.role);
      const dueAt = parseMinskDateTime(date, time);
      const id = createTask(db, { orderId, title: title.join(" "), dueAt, assigneeId: user.id, assigneeName: user.name, now });
      return `Задача №${id} поставлена на ${date} ${time} (Минск). Напомню вам в срок.`;
    }
    if (cmd === "/tdone") {
      const id = parseId(rest);
      completeTask(db, id, { userId: user.id, now });
      return `Задача №${id} выполнена.`;
    }
    if (cmd === "/staff") {
      return handleStaff(db, rest, user);
    }
    return helpFor(user.role);
  } catch (err) {
    if (err instanceof OrderError) return err.message;
    throw err;
  }
}
