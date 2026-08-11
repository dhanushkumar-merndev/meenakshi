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
});
