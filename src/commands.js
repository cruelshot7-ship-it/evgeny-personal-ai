import { completeCurrentStage, createOrder, currentStage, getOrder, listOpenOrders, OrderError } from "./orders.js";
import { completeTask, createTask, parseMinskDateTime } from "./tasks.js";

const TZ = "Europe/Minsk";

export const HELP = [
  "Команды:",
  "/new Имя клиента | заметка — новый заказ",
  "/list — открытые заказы",
  "/order 3 — карточка заказа №3",
  "/done 3 — отметить текущий этап заказа №3 выполненным",
  "/call 3 2026-10-12 10:00 позвонить, уточнить размеры — задача с напоминанием (время по Минску)",
  "/tdone 5 — отметить задачу №5 выполненной (только исполнителю)",
].join("\n");

function fmt(iso) {
  return new Date(iso).toLocaleString("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function parseId(text) {
  if (!/^\d+$/.test(text ?? "")) throw new OrderError("Номер заказа — число. Пример: /order 3");
  return Number(text);
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

/**
 * Разбор одного сообщения и ответ. Ничего не пишет в Telegram: только возвращает текст.
 * userId — Telegram ID отправителя (нужен, чтобы записать, кто отметил этап).
 */
export function handle(db, text, { userId, userName = "", now = new Date() }) {
  const raw = String(text ?? "").trim();
  const [first = ""] = raw.split(/\s+/);
  const cmd = first.toLowerCase().split("@")[0];
  const rest = raw.slice(first.length).trim();
  try {
    if (cmd === "/new") {
      const [name, ...note] = rest.split("|");
      const id = createOrder(db, { clientName: name, note: note.join("|"), now });
      const card = getOrder(db, id);
      return `Заказ №${id} создан.\n\n${formatCard(card)}`;
    }
    if (cmd === "/list") {
      const open = listOpenOrders(db);
      if (open.length === 0) return "Открытых заказов нет.";
      return open
        .map((o) => {
          const cur = currentStage(o);
          return `№${o.id} · ${o.client_name} · сейчас: ${cur ? `${cur.stage} (${cur.role})` : "—"}`;
        })
        .join("\n");
    }
    if (cmd === "/order") {
      const id = parseId(rest);
      const order = getOrder(db, id);
      if (!order) throw new OrderError(`Заказа №${id} нет.`);
      return formatCard(order);
    }
    if (cmd === "/done") {
      const id = parseId(rest);
      const { stage, closed } = completeCurrentStage(db, id, { userId, now });
      return closed ? `Этап «${stage}» выполнен. Заказ №${id} закрыт.` : `Этап «${stage}» выполнен. Смотрите /order ${id}.`;
    }
    if (cmd === "/call") {
      const [idText, date, time, ...title] = rest.split(/\s+/);
      const orderId = parseId(idText);
      const dueAt = parseMinskDateTime(date, time);
      const id = createTask(db, { orderId, title: title.join(" "), dueAt, assigneeId: userId, assigneeName: userName, now });
      return `Задача №${id} поставлена на ${date} ${time} (Минск). Напомню вам в срок.`;
    }
    if (cmd === "/tdone") {
      const id = parseId(rest);
      completeTask(db, id, { userId, now });
      return `Задача №${id} выполнена.`;
    }
    return HELP;
  } catch (err) {
    if (err instanceof OrderError) return err.message;
    throw err;
  }
}
