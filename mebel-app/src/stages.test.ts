import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGES, STAGE_ROLE } from "./stages";

test("этапы идут в порядке замер → монтаж", () => {
  assert.deepEqual([...STAGES], ["замер", "дизайн", "раскрой", "сборка", "монтаж"]);
});

test("у каждого этапа есть роль", () => {
  for (const stage of STAGES) {
    assert.ok(STAGE_ROLE[stage], `нет роли у ${stage}`);
  }
});
