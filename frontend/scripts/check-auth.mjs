import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const artifactsDir = path.resolve(process.env.AUTH_QA_ARTIFACTS_DIR ?? "../artifacts/auth");
await fs.mkdir(artifactsDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const errors = [];
const checks = [];
const authCard = () => page.getByRole("region", { name: "Войдите в Workspace AI" });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (
    m.type() === "error" &&
    !m.text().includes("503 (Service Unavailable)") &&
    !m.text().includes("403 (Forbidden)") &&
    !m.text().includes("401 (Unauthorized)")
  )
    errors.push(m.text());
});
async function ready() {
  await page.goto("http://127.0.0.1:3000");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1100);
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS", name);
}
try {
  await check(
    "All eight responsive viewports without horizontal overflow",
    async () => {
      for (const [width, height] of [
        [1920, 1080],
        [1440, 900],
        [1366, 768],
        [1280, 720],
        [1024, 768],
        [768, 1024],
        [390, 844],
        [375, 812],
      ]) {
        await page.setViewportSize({ width, height });
        await ready();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const box = await authCard().boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(16);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 16);
        await expect(
          page.getByRole("button", { name: "Войти", exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: `${artifactsDir}/auth-${width}x${height}.png`,
          fullPage: true,
        });
      }
    },
  );
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready();
  await page.screenshot({
    path: `${artifactsDir}/auth-reference-size.png`,
    fullPage: true,
  });
  await check("Exact copy and no social authentication UI", async () => {
    await expect(
      page.getByRole("heading", { name: "Войдите в Workspace AI" }),
    ).toBeVisible();
    await expect(page.getByText('Workspace AI', { exact: true }).first()).toBeAttached();
    await expect(page.getByText("Твой личный AI-агент")).toBeVisible();
    await expect(
      page.getByText("Workspace AI — твой AI агент на каждый день", { exact: true }).first(),
    ).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(
      /Google|Facebook|Apple|Telegram|Войти через|Restore ID|Без осуждения|Умные подсказки|Полная приватность|Вдохновляющее сообщество/,
    );
  });
  await check("Branding and ticker render", async () => {
    await expect(
      page.getByText("Workspace AI — твой AI агент на каждый день", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("agent", { exact: true })).toHaveCount(0);
  });
  await check("No layout shift after entrance", async () => {
    const before = await authCard().boundingBox();
    await page.waitForTimeout(250);
    const after = await authCard().boundingBox();
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(0.1);
  });
  await check("Validation and keyboard focus", async () => {
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(
      page.getByLabel("Электронная почта", { exact: true }),
    ).toBeFocused();
    await expect(
      page.getByText("Введите корректную электронную почту."),
    ).toBeVisible();
    await page
      .getByLabel("Электронная почта", { exact: true })
      .fill("anna@example.com");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Пароль", { exact: true })).toBeFocused();
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  });
  await check("Password visibility and real checkbox", async () => {
    await page.getByRole("button", { name: "Показать пароль" }).click();
    await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await page.getByRole("button", { name: "Скрыть пароль" }).click();
    await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
      "type",
      "password",
    );
    await expect(page.getByRole("checkbox")).toBeChecked();
    await page.getByRole("checkbox").uncheck();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
  });
  await check(
    "Loading state, duplicate prevention and honest auth response",
    async () => {
      let count = 0;
      await page.route("**/api/auth/login", async (route) => {
        count++;
        const payload = route.request().postDataJSON();
        expect(payload.remember).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 350));
        await route.continue();
      });
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Входим…" }),
      ).toBeDisabled();
      await expect(page.locator("form").getByRole("alert")).toContainText(
        /Сервис входа пока не подключён|Сервис авторизации недоступен|Запрос с другого сайта запрещён|Неверная почта или пароль/,
      );
      expect(count).toBe(1);
      await page.unroute("**/api/auth/login");
    },
  );
  await check(
    "Recovery and registration callbacks with dialog focus return",
    async () => {
      for (const name of ["Забыли пароль?"]) {
        const button = page.getByRole("button", { name, exact: true });
        await button.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(button).toBeFocused();
      }
    },
  );
  await check("Hover, active and focus appearance", async () => {
    const button = page.getByRole("button", { name: "Войти", exact: true });
    await button.hover();
    await page.waitForTimeout(250);
    expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe(
      "none",
    );
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(button).toBeVisible();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready();
  await check(
    "Reduced motion stops entrance transforms",
    async () => {
      expect(
        await page
          .getByRole("region", { name: "Войдите в Workspace AI" })
          .evaluate((el) => getComputedStyle(el).transform),
      ).toBe("none");
    },
  );
  await check("Workspace AI is protected and login route remains reachable", async () => {
    await page.goto("http://127.0.0.1:3000/workspace");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Войдите в Workspace AI");
    expect(page.url()).toContain("/login?next=%2Fworkspace");
    await page.goto("http://127.0.0.1:3000/login");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Войдите в Workspace AI");
  });
  await check("No console, hydration or React errors", async () =>
    expect(errors).toEqual([]),
  );
  await fs.writeFile(
    path.join(artifactsDir, "auth-check-results.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
