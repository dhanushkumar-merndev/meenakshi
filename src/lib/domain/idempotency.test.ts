import { describe, expect, it } from "vitest";
import { isIdempotentReplay } from "./idempotency";

describe("isIdempotentReplay", () => {
  it("treats a repeat of the same idempotency key as already saved", () => {
    expect(
      isIdempotentReplay({
        code: "23505",
        message: 'duplicate key value violates unique constraint "ip_charges_idempotency_key_key"',
      }),
    ).toBe(true);
  });

  it("does not swallow a different unique violation", () => {
    // This is the shape that silently discarded manual IP charges.
    expect(
      isIdempotentReplay({
        code: "23505",
        message: 'duplicate key value violates unique constraint "ip_charges_source_type_source_id_key"',
      }),
    ).toBe(false);
  });

  it("ignores non-unique errors and no error at all", () => {
    expect(isIdempotentReplay({ code: "23514", message: "check constraint" })).toBe(false);
    expect(isIdempotentReplay(null)).toBe(false);
  });
});
