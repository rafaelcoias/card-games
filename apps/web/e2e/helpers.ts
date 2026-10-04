import { test as base, expect, type Browser, type Page } from '@playwright/test';

/**
 * `test` whose players leave when it ends: every browser context a test opens
 * is closed afterwards, so its accounts go offline before the next test.
 */
export const test = base.extend<{ closeContexts: void }>({
  closeContexts: [
    async ({ browser }, use) => {
      await use();
      await Promise.all(browser.contexts().map((context) => context.close()));
    },
    { auto: true },
  ],
});

/**
 * Registers a fresh account through the real sign-up form (Firebase Auth —
 * the emulator locally/CI) and completes onboarding.
 */
export async function signIn(
  browser: Browser,
  name: string,
  viewport = { width: 1280, height: 860 },
): Promise<Page> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto('/register');
  await page.getByLabel('E-mail').fill(`${name}@example.com`);
  await page.getByLabel('Palavra-passe').fill('segredo123');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByRole('heading', { name: /Como te chamam/ })).toBeVisible();
  await page.getByLabel('Nome de utilizador').fill(name);
  await page.getByRole('button', { name: 'Começar a jogar' }).click();
  await expect(page.getByRole('heading', { name: 'Salas', exact: true })).toBeVisible();
  return page;
}

export function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
}

/** Host creates a room for `gameName`; returns its code. */
export async function createRoom(host: Page, gameName: string): Promise<string> {
  await host.getByRole('button', { name: 'Criar sala' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText(gameName, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  return host.url().split('/').pop() as string;
}

export async function joinAndReady(page: Page, code: string): Promise<void> {
  await page.goto(`/room/${code}`);
  await page.getByRole('button', { name: 'Estou pronto' }).click();
  await expect(page.getByRole('button', { name: 'Afinal, não estou pronto' })).toBeVisible();
}

/**
 * Taps an element the way a finger would on a fanned card: overlapping cards
 * cover each other's centres, so the click is dispatched to the card itself.
 */
export async function tap(page: Page, selector: string, index = 0): Promise<void> {
  await page.locator(selector).nth(index).dispatchEvent('click');
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;

/**
 * Plays this player's move, if it is theirs: taps a card of the pond after
 * "Vai à pesca!", or picks a player and a rank at random and asks. Clicks are
 * dispatched to the element (like a tap): fanned cards cover each other.
 */
export async function takePeixinhoTurn(page: Page): Promise<boolean> {
  const pond = page.getByRole('button', { name: /^Pescar esta carta do lago/ });
  const spots = await pond.count();
  if (spots > 0) {
    await pond.nth(Math.floor(Math.random() * spots)).dispatchEvent('click');
    return true;
  }
  const ranks = page.locator('[data-hand-card] [role="button"]:has([data-card-state="playable"])');
  const targets = page.locator('button[data-ask-target]');
  const [rankCount, targetCount] = [await ranks.count(), await targets.count()];
  if (rankCount === 0 || targetCount === 0) return false;
  await ranks.nth(pick([...Array(rankCount).keys()])).dispatchEvent('click');
  if (targetCount > 1) await targets.nth(pick([...Array(targetCount).keys()])).dispatchEvent('click');
  const confirm = page.getByRole('button', { name: /^Pedir .+ a .+$/ });
  if (!(await confirm.isEnabled().catch(() => false))) return false;
  await confirm.dispatchEvent('click');
  return true;
}
