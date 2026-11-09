import { expect, test } from "@playwright/test";

test("homepage renders its hero, supplied imagery, and working collection links", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "PLAY LIKE A LEGEND." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LIVE THE TECHNOLOGY." })).toBeVisible();
  await expect(page.getByRole("link", { name: /EXPLORE COLLECTION/i }).first()).toHaveAttribute("href", "/category");

  const hero = page.getByRole("region", { name: "PLAY LIKE A LEGEND." });
  await expect(hero.getByRole("img", { name: /collection of headphones/i })).toBeVisible();
  await hero.getByRole("button", { name: "Show Audio and mobile image" }).click();
  await expect(hero.getByRole("img", { name: /Headphones, smartphone/i })).toBeVisible();
  await hero.getByRole("button", { name: "Show next hero image" }).click();
  await expect(hero.getByRole("img", { name: /Smartphone, tablet, laptop/i })).toBeVisible();

  const gamingLink = page.getByRole("link", { name: /Explore gaming collection/i });
  const technologyLink = page.getByRole("link", { name: /Explore technology collection/i });
  await expect(gamingLink).toHaveAttribute("href", "/category?search=gaming");
  await expect(gamingLink.getByRole("img")).toHaveAttribute("src", /gaming-arena-user/);
  await expect(technologyLink).toHaveAttribute("href", "/category?search=technology");
});
