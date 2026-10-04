import { test, expect } from "@playwright/test";

test("built Pages app renders setup guidance instead of a blank screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "가족 DB 연결이 필요합니다." })).toBeVisible();
    await expect(page.getByText("Cloudflare의 사이트 설정에서", { exact: false })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("deployed Pages Functions return JSON and disable caching", async ({ request }) => {
  const response = await request.get("/api/session");
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect((await response.json()).error).toContain("DB 미연결");
  const unknown = await request.get("/api/not-a-route");
  expect(unknown.status()).toBe(404);
  const wrongMethod = await request.get("/api/transactions");
  expect(wrongMethod.status()).toBe(405);
  expect(wrongMethod.headers().allow).toBe("POST");
});
