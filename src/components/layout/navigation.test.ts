import { describe, expect, it } from "vitest";
import { getActiveNavigationHref, ROLE_NAVIGATION } from "./navigation";

describe("getActiveNavigationHref", () => {
  it("chooses the most specific matching reception link", () => {
    expect(
      getActiveNavigationHref(
        ROLE_NAVIGATION.reception,
        "/reception/follow-ups",
      ),
    ).toBe("/reception/follow-ups");
  });

  it("keeps a module root active for an unlisted detail page", () => {
    expect(
      getActiveNavigationHref(ROLE_NAVIGATION.ip, "/ip/ticket-id"),
    ).toBe("/ip");
  });

  it("does not treat dashboard as a parent route", () => {
    expect(
      getActiveNavigationHref(
        ROLE_NAVIGATION.reception,
        "/dashboard/example",
      ),
    ).toBeUndefined();
  });
});
