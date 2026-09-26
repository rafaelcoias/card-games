import { expect, type Browser, type Page } from '@playwright/test';

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
