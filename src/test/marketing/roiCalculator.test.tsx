import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoiCalculator } from "@/app/(marketing)/_components/RoiCalculator";

/**
 * Tests for the ROI Calculator client component.
 *
 * Defaults: staff = 10, minutes = 15
 * Formula:
 *   weeklyHours = (staff * minutes * 5) / 60
 *   savings     = weeklyHours * 0.7
 *
 * Default:
 *   weeklyHours = (10 * 15 * 5) / 60 = 12.5
 *   savings     = 12.5 * 0.7         = 8.75 → "8.8" (toFixed(1))
 */

describe("RoiCalculator", () => {
  it("renders with correct default output (staff=10, minutes=15)", () => {
    render(<RoiCalculator />);

    // weeklyHours = 12.5 → displayed as "12.5 hours/week"
    expect(screen.getByText(/12\.5 hours\/week/i)).toBeInTheDocument();

    // savings = 8.75 → toFixed(1) → "8.8 hours/week"
    expect(screen.getByText(/8\.8 hours\/week/i)).toBeInTheDocument();
  });

  it("updates the output when staff slider changes", () => {
    render(<RoiCalculator />);

    const staffSlider = screen.getByLabelText(/staff submitting reports daily/i);
    fireEvent.change(staffSlider, { target: { value: "20" } });

    // weeklyHours = (20 * 15 * 5) / 60 = 25.0
    expect(screen.getByText(/25\.0 hours\/week/i)).toBeInTheDocument();

    // savings = 25.0 * 0.7 = 17.5
    expect(screen.getByText(/17\.5 hours\/week/i)).toBeInTheDocument();
  });

  it("updates the output when minutes slider changes", () => {
    render(<RoiCalculator />);

    const minutesSlider = screen.getByLabelText(
      /minutes per report on paper/i,
    );
    fireEvent.change(minutesSlider, { target: { value: "30" } });

    // staff=10, minutes=30
    // weeklyHours = (10 * 30 * 5) / 60 = 25.0
    expect(screen.getByText(/25\.0 hours\/week/i)).toBeInTheDocument();

    // savings = 25.0 * 0.7 = 17.5
    expect(screen.getByText(/17\.5 hours\/week/i)).toBeInTheDocument();
  });

  it("both sliders work together", () => {
    render(<RoiCalculator />);

    const staffSlider = screen.getByLabelText(/staff submitting reports daily/i);
    const minutesSlider = screen.getByLabelText(
      /minutes per report on paper/i,
    );

    fireEvent.change(staffSlider, { target: { value: "5" } });
    fireEvent.change(minutesSlider, { target: { value: "60" } });

    // weeklyHours = (5 * 60 * 5) / 60 = 25.0
    expect(screen.getByText(/25\.0 hours\/week/i)).toBeInTheDocument();

    // savings = 25.0 * 0.7 = 17.5
    expect(screen.getByText(/17\.5 hours\/week/i)).toBeInTheDocument();
  });

  it("renders slider labels and range hints", () => {
    render(<RoiCalculator />);
    expect(
      screen.getByLabelText(/staff submitting reports daily/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/minutes per report on paper/i),
    ).toBeInTheDocument();
  });
});
