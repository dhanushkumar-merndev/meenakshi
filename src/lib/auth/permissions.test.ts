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

  it("lets IP staff view drug availability without pharmacy access", () => {
    expect(canAccessRoute("ip", "/drug-stock")).toBe(true);
    expect(canAccessRoute("ip", "/pharmacy/stock")).toBe(false);
  });

  it("gives reception the complete OP workflow", () => {
    expect(canAccessRoute("reception", "/op")).toBe(true);
    expect(canAccessRoute("reception", "/op/assist")).toBe(true);
    expect(canAccessRoute("reception", "/drug-stock")).toBe(true);
    expect(hasPermission("reception", "recordVitals")).toBe(true);
  });

  it("lets reception request IP items without pharmacy fulfilment rights", () => {
    expect(canAccessRoute("reception", "/ip/current")).toBe(true);
    expect(hasPermission("reception", "requestIpInventory")).toBe(true);
    expect(hasPermission("reception", "dispense")).toBe(false);
  });
});
