import { expect, type Browser, type Page } from '@playwright/test';
import { createRoom, signIn, tap, test, uniqueName } from './helpers';

/** A visitor with no account opens the room link: sign in as a guest from the login page. */
async function joinAsGuest(browser: Browser, code: string, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`/room/${code}`);
  await page.waitForURL(/\/login\?next=/);
  await page.getByRole('link', { name: 'Jogar como convidado' }).click();
  await page.waitForURL(/\/guest\?next=/);
  await page.getByLabel('Nome para esta sessão').fill(name);
  await page.getByRole('button', { name: 'Jogar como convidado' }).click();
  await page.waitForURL(new RegExp(`/room/${code}$`));
  return page;
}

test('a guest joins from a room link, plays, then creates an account and keeps the history', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const host = await signIn(browser, uniqueName('ana'));
  const code = await createRoom(host, 'Carta Mais Alta');

  const guestName = uniqueName('visita');
  const guest = await joinAsGuest(browser, code, guestName);
  await expect(host.getByText('convidado').first()).toBeVisible(); // the host sees who is a guest
  await guest.getByRole('button', { name: 'Estou pronto' }).click();
  await host.getByRole('button', { name: 'Começar partida' }).click();

  const hand = '.cr-card-hit';
  for (let round = 0; round < 5; round++) {
    for (const page of [host, guest]) {
      await expect(page.getByText('Escolhe a tua carta')).toBeVisible();
      const cards = page.locator(hand);
      const before = await cards.count();
      await tap(page, hand);
      await expect(cards).not.toHaveCount(before);
    }
  }
  await expect(guest.getByRole('button', { name: 'Voltar à sala' })).toBeVisible();
  await guest.getByRole('button', { name: 'Voltar ao lobby' }).click();
  await guest.waitForURL(/\/lobby$/);

  // The guest's profile: their match is there, and an account can be created from it.
  await guest.goto('/profile');
  await expect(guest.getByRole('heading', { name: 'Convidado' })).toBeVisible();
  await expect(guest.getByText('Carta Mais Alta').first()).toBeVisible();
  await guest.getByRole('link', { name: 'Criar conta e guardar o histórico' }).click();
  await guest.waitForURL(/\/register$/);
  await guest.getByLabel('E-mail').fill(`${guestName}@example.com`);
  await guest.getByLabel('Palavra-passe').fill('segredo123');
  await guest.getByRole('button', { name: 'Criar conta' }).click();

  // Same identity: they now claim a username for good, and the history stayed with them.
  await expect(guest.getByRole('heading', { name: 'Conta criada!' })).toBeVisible();
  await expect(guest.getByLabel('Nome de utilizador')).toHaveValue(guestName);
  await guest.getByRole('button', { name: 'Guardar o meu nome' }).click();
  await guest.waitForURL(/\/lobby$/);
  await guest.goto('/profile');
  await expect(guest.getByRole('heading', { name: 'Perfil' })).toBeVisible();
  await expect(guest.getByText('Carta Mais Alta').first()).toBeVisible();
  await guest.goto(`/players/${guestName}`);
  await expect(guest.getByRole('heading', { name: guestName })).toBeVisible();
});
