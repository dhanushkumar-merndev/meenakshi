import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogSelect } from "./catalog-select";

const fetchMock = vi.fn();
const option = (value: string, label: string) => ({ value, label, data: { id: value } });
const respond = (items: ReturnType<typeof option>[], nextOffset: number | null = null) => ({ ok: true, json: async () => ({ items, nextOffset }) });
async function tick(ms = 500) { await act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve(); }); }

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(onChange = vi.fn(), query = "ga") {
  render(<CatalogSelect endpoint="/api/search/inventory-items" value={null} onChange={onChange} placeholder="Select item" />);
  fireEvent.click(screen.getByRole("combobox", { name: "Select item" }));
  if (query) fireEvent.change(screen.getByRole("combobox", { name: "Search options" }), { target: { value: query } });
}

describe("CatalogSelect", () => {
  it("browses later pages and searches beyond the initial page without selecting typed text", async () => {
    fetchMock.mockResolvedValueOnce(respond([option("first", "Gauze")], 25));
    fetchMock.mockResolvedValueOnce(respond([option("later", "Suture")]));
    fetchMock.mockResolvedValueOnce(respond([option("last", "Zinc dressing")]));
    const onChange = vi.fn();
    setup(onChange, "");
    await tick(0);
    expect(screen.getByRole("option", { name: "Gauze" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show more items" }));
    await tick();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/search/inventory-items?q=&offset=25");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox", { name: "Search options" }), { target: { value: "zinc" } });
    expect(screen.queryByRole("option", { name: "Gauze" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await tick();
    expect(fetchMock.mock.calls[2][0]).toBe("/api/search/inventory-items?q=zinc&offset=0");
    fireEvent.click(screen.getByRole("option", { name: "Zinc dressing" }));
    expect(onChange).toHaveBeenCalledWith(option("last", "Zinc dressing"));
  });

  it("ignores a late stale response and cancels the previous request", async () => {
    let finishOld!: (value: ReturnType<typeof respond>) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    fetchMock.mockResolvedValueOnce(respond([option("new", "New result")]));
    setup();
    await tick();
    const previousSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    fireEvent.change(screen.getByRole("combobox", { name: "Search options" }), { target: { value: "new" } });
    expect(previousSignal.aborted).toBe(true);
    await tick();
    await act(async () => { finishOld(respond([option("old", "Stale result")])); });
    expect(screen.getByRole("option", { name: "New result" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Stale result" })).not.toBeInTheDocument();
  });

  it("offers retry after failure without silently showing an empty catalog", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    fetchMock.mockResolvedValueOnce(respond([option("retry", "Recovered item")]));
    setup();
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    await tick();
    expect(screen.getByRole("option", { name: "Recovered item" })).toBeInTheDocument();
  });
});

it("browses on open, debounces typed searches and restores browsing when cleared", async () => {
  fetchMock.mockResolvedValue(respond([option("one", "Gauze")]));
  setup(vi.fn(), "");
  await tick(0);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/search/inventory-items?q=&offset=0");
  const input = screen.getByRole("combobox", { name: "Search options" });
  fireEvent.change(input, { target: { value: "g " } });
  await tick();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("Type at least 2 characters to search.")).toHaveLength(1);
  fireEvent.change(input, { target: { value: "ga" } });
  await tick(499);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fireEvent.change(input, { target: { value: "g" } });
  expect(screen.queryByRole("option", { name: "Gauze" })).not.toBeInTheDocument();
  await tick();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fireEvent.change(input, { target: { value: "" } });
  await tick(0);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("option", { name: "Gauze" })).toBeInTheDocument();
});
