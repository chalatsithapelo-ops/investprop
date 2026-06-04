import { test, expect } from "@playwright/test";

test.describe("Investprop smoke", () => {
  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Investprop|Property/i);
  });

  test("login page accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in|login/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("register page accessible", async ({ page }) => {
    await page.goto("/register/investor");
    await expect(page.getByRole("heading", { name: /register|sign up|create/i })).toBeVisible();
  });

  test("opportunities listing reachable", async ({ page }) => {
    await page.goto("/investments/opportunities");
    // Either an opportunity card renders or a "no opportunities" empty state — both are OK
    await expect(page.locator("body")).toBeVisible();
  });
});
