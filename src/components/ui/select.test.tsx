import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Example({ onChange = vi.fn(), disabled = false } = {}) {
  return <form aria-label="Example"><Select name="medicine" defaultValue="pcm" onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label="Medicine"><SelectValue placeholder="Select medicine" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="pcm">Paracetamol 500 mg</SelectItem>
      <SelectItem value="amox" label="Amoxicillin 250 mg">Amoxicillin 250 mg · 15 left</SelectItem>
      <SelectItem value="disabled" disabled>Unavailable medicine</SelectItem>
      <SelectItem value="">None</SelectItem>
    </SelectContent>
  </Select></form>;
}

describe("searchable Select", () => {
  it("filters labels, commits the selected ID and preserves form values", async () => {
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    expect(screen.getByRole("combobox", { name: "Medicine" })).toHaveTextContent("Paracetamol 500 mg");
    fireEvent.click(screen.getByRole("combobox", { name: "Medicine" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Search options" }), { target: { value: "amoxi" } });
    await waitFor(() => expect(screen.queryByRole("option", { name: "Paracetamol 500 mg" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: /Amoxicillin/ }));
    expect(onChange).toHaveBeenCalledWith("amox", expect.anything());
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("medicine")).toBe("amox");
    fireEvent.click(screen.getByRole("combobox", { name: "Medicine" }));
    expect(await screen.findByRole("option", { name: "Paracetamol 500 mg" })).toBeInTheDocument();
  });

  it("shows no results without committing typed text and supports keyboard selection", async () => {
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Medicine" }));
    const input = await screen.findByRole("combobox", { name: "Search options" });
    fireEvent.change(input, { target: { value: "not present" } });
    expect(await screen.findByText("No matching options.")).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "amoxi" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("amox", expect.anything()));
  });

  it("does not open a disabled field", () => {
    render(<Example disabled />);
    expect(screen.getByRole("combobox", { name: "Medicine" })).toBeDisabled();
  });
});
