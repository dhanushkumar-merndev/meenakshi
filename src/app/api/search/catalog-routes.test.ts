import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { profile, rpc } = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getCurrentProfile: profile }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
import { GET as inventory } from "./inventory-items/route";
import { GET as medicines } from "./medicine-directory/route";
import { GET as stock } from "./ip-stock/route";

const request = (query = "") => new NextRequest(`http://localhost/api/search/catalog${query}`);
beforeEach(() => { profile.mockReset().mockResolvedValue({ role: "pharmacy" }); rpc.mockReset().mockResolvedValue({ data: [], error: null }); });

describe("catalog search routes", () => {
  for (const [name, handler] of [["inventory", inventory], ["medicines", medicines], ["IP stock", stock]] as const) {
    it.each(["reception", "doctor", "op", "ip"])(`${name} denies %s without reading stock prices`, async (role) => {
      profile.mockResolvedValue({ role });
      expect((await handler(request())).status).toBe(403);
      expect(rpc).not.toHaveBeenCalled();
    });
    it(`${name} bounds queries and returns failures explicitly`, async () => {
      expect((await handler(request(`?q=${"x".repeat(121)}`))).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
      rpc.mockResolvedValue({ data: null, error: { message: "internal details" } });
      const response = await handler(request("?q=test"));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Search unavailable" });
    });
  }

  it("queries inventory independently of table pagination and returns the next page", async () => {
    rpc.mockResolvedValue({ data: [{ id: "late", name: "Zinc dressing", active: true, quantity: 8, selling_price_paise: 200, total_count: 100 }], error: null });
    const response = await inventory(request("?q=zinc&offset=25"));
    expect(rpc).toHaveBeenCalledWith("search_inventory_items", { p_query: "zinc", p_limit: 25, p_offset: 25 });
    expect(await response.json()).toMatchObject({ items: [{ value: "late", label: "Zinc dressing", disabled: false }], nextOffset: 26 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("never includes archived medicines and disables inactive choices", async () => {
    rpc.mockResolvedValue({ data: [{ id: "inactive", brand_name: "Test medicine", dosage_form: "Tablet", active: false, total_count: 1 }], error: null });
    const response = await medicines(request("?q=test"));
    expect(rpc).toHaveBeenCalledWith("list_medicine_directory", expect.objectContaining({ p_include_archived: false, p_limit: 25, p_offset: 0 }));
    expect(await response.json()).toMatchObject({ items: [{ disabled: true }] });
  });

  it.each(["-1", "1.5", "NaN"])("rejects invalid offset %s", async (offset) => {
    expect((await inventory(request(`?offset=${offset}`))).status).toBe(400);
    expect((await medicines(request(`?offset=${offset}`))).status).toBe(400);
    expect((await stock(request(`?offset=${offset}`))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

it("paginates IP stock beyond the old 500-row cap with one lookahead row", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => ({ stock_type: "medicine", stock_id: `medicine-${500 + index}`, name: "Same medicine name", quantity: 10, selling_price_paise: 200 }));
  rpc.mockResolvedValue({ data: rows, error: null });
  const response = await stock(request("?q=same&offset=500"));
  expect(rpc).toHaveBeenCalledWith("search_ip_stock_catalog_page", { p_query: "same", p_limit: 26, p_offset: 500 });
  const body = await response.json();
  expect(body.items).toHaveLength(25);
  expect(body.items[0].value).toBe("medicine:medicine-500");
  expect(body.nextOffset).toBe(525);
});

it.each([0, 1, 25])("ends IP pagination when only %i rows remain", async (count) => {
  rpc.mockResolvedValue({ data: Array.from({ length: count }, (_, index) => ({ stock_type: "inventory", stock_id: `item-${index}`, name: "Dressing", quantity: 1, selling_price_paise: 10 })), error: null });
  const body = await (await stock(request("?q=test&offset=525"))).json();
  expect(body.items).toHaveLength(count);
  expect(body.nextOffset).toBeNull();
});

it.each([inventory, medicines, stock])("does not query the database below two characters", async (handler) => {
  for (const q of ["a", "a%20"]) {
    const response = await handler(request(`?q=${q}`));
    expect(await response.json()).toEqual({ items: [], nextOffset: null });
  }
  expect(rpc).not.toHaveBeenCalled();
});

it.each([inventory, medicines, stock])("allows the initial browse page without typed text", async (handler) => {
  const response = await handler(request("?offset=0"));
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_query: "", p_offset: 0 });
});
