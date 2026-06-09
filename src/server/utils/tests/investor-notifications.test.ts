import { describe, it, expect } from "vitest";
import { propertyMatchesPreferences } from "~/server/utils/investor-notifications";

const baseProperty = {
  propertyId: 1,
  title: "Sunninghill Flip",
  propertyType: "flip",
  price: 1_500_000,
  address: "12 Main Road",
  city: "Johannesburg",
  state: "Gauteng",
  investmentStatus: "RAISING_FUNDS",
};

describe("propertyMatchesPreferences", () => {
  it("notifies investors with no preferences object (default opt-in)", () => {
    expect(propertyMatchesPreferences(null, baseProperty)).toBe(true);
  });

  it("never notifies investors who explicitly disabled notifications", () => {
    expect(
      propertyMatchesPreferences({ notificationsEnabled: false }, baseProperty)
    ).toBe(false);
  });

  it("matches when no preference categories are set (empty prefs object)", () => {
    expect(propertyMatchesPreferences({}, baseProperty)).toBe(true);
  });

  it("matches a property type via loose substring matching", () => {
    expect(
      propertyMatchesPreferences(
        { preferredPropertyTypes: ["Flip"] },
        baseProperty
      )
    ).toBe(true);
  });

  it("excludes when the property type preference does not match", () => {
    expect(
      propertyMatchesPreferences(
        { preferredPropertyTypes: ["Rental"] },
        baseProperty
      )
    ).toBe(false);
  });

  it("matches a development type for development properties", () => {
    expect(
      propertyMatchesPreferences(
        { developmentTypes: ["AFFORDABLE_RESALE"] },
        {
          ...baseProperty,
          propertyType: "development",
          developmentType: "AFFORDABLE_RESALE",
        }
      )
    ).toBe(true);
  });

  it("matches on preferred location (city)", () => {
    expect(
      propertyMatchesPreferences(
        { preferredLocations: ["Johannesburg"] },
        baseProperty
      )
    ).toBe(true);
  });

  it("excludes when location preference does not overlap", () => {
    expect(
      propertyMatchesPreferences(
        { preferredLocations: ["Cape Town"] },
        baseProperty
      )
    ).toBe(false);
  });

  it("requires BOTH type and location to match when both are set", () => {
    expect(
      propertyMatchesPreferences(
        { preferredPropertyTypes: ["flip"], preferredLocations: ["Cape Town"] },
        baseProperty
      )
    ).toBe(false);

    expect(
      propertyMatchesPreferences(
        {
          preferredPropertyTypes: ["flip"],
          preferredLocations: ["Johannesburg"],
        },
        baseProperty
      )
    ).toBe(true);
  });

  it("matches province via state token", () => {
    expect(
      propertyMatchesPreferences(
        { preferredStates: ["Gauteng"] },
        baseProperty
      )
    ).toBe(true);
  });
});
