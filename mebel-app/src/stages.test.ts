import { describe, expect, it } from "vitest";
import { STAGES, STAGE_ROLE } from "./stages";

describe("этапы заказа", () => {
  it("идут в порядке замер → монтаж", () => {
    expect([...STAGES]).toEqual(["замер", "дизайн", "раскрой", "сборка", "монтаж"]);
  });

  it("у каждого этапа есть роль", () => {
    for (const stage of STAGES) {
      expect(STAGE_ROLE[stage]).toBeTruthy();
    }
  });
});
