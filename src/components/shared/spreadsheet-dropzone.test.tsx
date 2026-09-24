import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SpreadsheetDropzone } from "./spreadsheet-dropzone";

afterEach(cleanup);
it("exposes readiness only on the client and still delivers selected files", () => {
  const onFile = vi.fn();
  expect(renderToString(<SpreadsheetDropzone onFile={onFile} />)).not.toContain("data-file-upload-ready");
  const { container } = render(<SpreadsheetDropzone onFile={onFile} />);
  expect(container.querySelector("label")).toHaveAttribute("data-file-upload-ready", "true");
  const file = new File(["medicine_name\nTest"], "sample.csv", { type: "text/csv" });
  fireEvent.change(container.querySelector("input")!, { target: { files: [file] } });
  expect(onFile).toHaveBeenCalledWith(file);
});
it("accepts dropped files and respects disabled state", () => {
  const onFile = vi.fn();
  const { rerender } = render(<SpreadsheetDropzone onFile={onFile} />);
  const target = screen.getByText("Drag and drop or choose a file").closest("label")!;
  const file = new File(["test"], "sample.csv");
  fireEvent.drop(target, { dataTransfer: { files: [file] } });
  expect(onFile).toHaveBeenCalledTimes(1);
  rerender(<SpreadsheetDropzone onFile={onFile} disabled />);
  fireEvent.drop(target, { dataTransfer: { files: [file] } });
  expect(onFile).toHaveBeenCalledTimes(1);
});
