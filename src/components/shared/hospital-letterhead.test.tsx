import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HospitalLetterhead } from "./hospital-letterhead";
import { HOSPITAL_IDENTITY_FALLBACK } from "@/lib/print/hospital-identity";

describe("HospitalLetterhead", () => {
  it("prints the motto and every contact detail", () => {
    render(<HospitalLetterhead identity={HOSPITAL_IDENTITY_FALLBACK} />);
    expect(screen.getByText("Care • Healing • Hope.")).toBeInTheDocument();
    expect(screen.getByText(HOSPITAL_IDENTITY_FALLBACK.address!)).toBeInTheDocument();
    expect(screen.getByText(HOSPITAL_IDENTITY_FALLBACK.phone!)).toBeInTheDocument();
    expect(screen.getByText(HOSPITAL_IDENTITY_FALLBACK.email!)).toBeInTheDocument();
  });

  it("splits the name into a two-line lockup", () => {
    render(<HospitalLetterhead identity={HOSPITAL_IDENTITY_FALLBACK} />);
    expect(screen.getByText("Meenakshi")).toBeInTheDocument();
    expect(screen.getByText("Hospital")).toBeInTheDocument();
  });

  it("keeps a renamed hospital on one line and drops missing contact lines", () => {
    render(
      <HospitalLetterhead
        identity={{ name: "Meenakshi Care Centre", tagline: null, address: null, phone: "+91 78128 33761", email: null }}
      />,
    );
    expect(screen.getByText("Meenakshi Care Centre")).toBeInTheDocument();
    expect(screen.queryByText("Care • Healing • Hope.")).not.toBeInTheDocument();
    expect(screen.getByText("+91 78128 33761")).toBeInTheDocument();
  });
});
