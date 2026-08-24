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
    ).toBe("/ip/all-tickets");
  });

  it("prefers an IP role destination over its detail-page fallback", () => {
    expect(
      getActiveNavigationHref(ROLE_NAVIGATION.ip, "/ip/pending-discharge"),
    ).toBe("/ip/pending-discharge");
  });

  it("gives IP staff a direct drug-stock destination", () => {
    expect(
      ROLE_NAVIGATION.ip.find((item) => item.href === "/drug-stock")?.title,
    ).toBe("Drug Stock");
  });

  it("puts the complete OP workflow in the reception workspace", () => {
    const destinations = ROLE_NAVIGATION.reception.map((item) => item.href);
    expect(destinations).toEqual(
      expect.arrayContaining(["/op", "/op/assist", "/reports", "/drug-stock"]),
    );
  });

  it("keeps legacy OP navigation available during account migration", () => {
    const destinations = ROLE_NAVIGATION.op.map((item) => item.href);
    expect(destinations).toEqual(
      expect.arrayContaining(["/op", "/op/assist", "/reports", "/drug-stock"]),
    );
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
