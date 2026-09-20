import { describe, expect, it } from "vitest";
import { canAccessRoute, hasPermission } from "./permissions";
import { APP_ROLES } from "@/types/hospital";

describe("role authorization matrix", () => {
  it("allows only admins to manage users", () => {
    for (const role of APP_ROLES) expect(hasPermission(role, "manageUsers")).toBe(role === "admin");
  });
  it("allows only pharmacy and admin to dispense", () => {
    for (const role of APP_ROLES) expect(hasPermission(role, "dispense")).toBe(role === "admin" || role === "pharmacy");
  });
  it("isolates role routes", () => {
    expect(canAccessRoute("doctor", "/doctor")).toBe(true);
    expect(canAccessRoute("doctor", "/pharmacy")).toBe(false);
    expect(canAccessRoute("reception", "/admin/users")).toBe(false);
    expect(canAccessRoute("pharmacy", "/patients")).toBe(false);
  });

  it("keeps audit logs exclusive to administrators", () => {
    for (const role of APP_ROLES) {
      expect(canAccessRoute(role, "/audit"), `${role} audit access`).toBe(role === "admin");
    }
  });

  it("lets IP staff view drug availability without pharmacy access", () => {
    expect(canAccessRoute("ip", "/drug-stock")).toBe(true);
    expect(canAccessRoute("ip", "/pharmacy/stock")).toBe(false);
  });

  it("gives reception the complete OP workflow", () => {
    expect(canAccessRoute("reception", "/op")).toBe(true);
    expect(canAccessRoute("reception", "/op/assist")).toBe(true);
    expect(canAccessRoute("reception", "/reports")).toBe(true);
    expect(canAccessRoute("reception", "/visits/example-visit")).toBe(true);
    expect(canAccessRoute("reception", "/drug-stock")).toBe(true);
    expect(hasPermission("reception", "recordVitals")).toBe(true);
    expect(hasPermission("reception", "uploadReport")).toBe(true);
  });

  it("keeps legacy OP accounts compatible during migration", () => {
    expect(canAccessRoute("op", "/op")).toBe(true);
    expect(canAccessRoute("op", "/op/assist")).toBe(true);
    expect(canAccessRoute("op", "/reports")).toBe(true);
    expect(canAccessRoute("op", "/drug-stock")).toBe(true);
    expect(hasPermission("op", "recordVitals")).toBe(true);
    expect(hasPermission("op", "uploadReport")).toBe(true);
  });

  it("lets reception request IP items without pharmacy fulfilment rights", () => {
    expect(canAccessRoute("reception", "/ip/current")).toBe(true);
    expect(hasPermission("reception", "requestIpInventory")).toBe(true);
    expect(hasPermission("reception", "dispense")).toBe(false);
  });
});
