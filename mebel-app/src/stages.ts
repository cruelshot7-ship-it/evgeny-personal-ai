/** Этапы заказа по порядку. Совпадают с ботом (src/stages.js в ветке feat/ruksha-mebel-bot). */
export const STAGES = ["замер", "дизайн", "раскрой", "сборка", "монтаж"] as const;

export type Stage = (typeof STAGES)[number];

/** Роль, которая отвечает за этап. */
export const STAGE_ROLE: Record<Stage, string> = {
  замер: "менеджер",
  дизайн: "дизайнер",
  раскрой: "оператор_чпу",
  сборка: "сборщик",
  монтаж: "монтажник",
};
