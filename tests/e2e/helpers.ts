import { expect, type Page } from '@playwright/test';

export const GRADES = ['F', 'D minus', 'D', 'D plus', 'C minus', 'C', 'C plus', 'B minus', 'B', 'B plus', 'A minus', 'A', 'A plus'];

/** Waits until a card is on screen with its image decoded. */
export async function cardReady(page: Page): Promise<void> {
  await expect(page.locator('.card-box.is-loaded .card-box__img')).toBeVisible({ timeout: 30_000 });
}

/** Grades the current card and waits for the reveal. */
export async function grade(page: Page, label = 'C'): Promise<void> {
  await page.locator(`.pad button[aria-label="${label}"]`).click();
  await expect(page.locator('button.next')).toBeVisible();
}

export async function next(page: Page): Promise<void> {
  await page.locator('button.next').click();
}

/** Plays n cards; returns after the last reveal's Next is pressed. */
export async function play(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await cardReady(page);
    await grade(page, GRADES[(i * 5 + 3) % GRADES.length]);
    await next(page);
  }
}

export async function feedbackCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __loupeFeedbackCount?: number }).__loupeFeedbackCount ?? 0);
}
