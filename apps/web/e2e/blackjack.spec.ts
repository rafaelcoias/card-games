import { expect, type Locator, type Page } from '@playwright/test';
import { joinAndReady, signIn, test, uniqueName } from './helpers';

/** Host opens a Blackjack table for up to 7 (default rules). */
async function createBlackjackRoom(host: Page): Promise<string> {
  await host.getByRole('button', { name: 'Criar sala' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText('Blackjack', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  await expect(host.getByText('Sapato: 6 baralhos')).toBeVisible();
  return host.url().split('/').pop() as string;
}

/**
 * A tap on an enabled control that may vanish at any moment (the table moves on by
 * itself): `false` instead of waiting for it forever.
 */
async function tap(target: Locator): Promise<boolean> {
  if (!(await target.isVisible().catch(() => false))) return false;
  if (!(await target.isEnabled({ timeout: 500 }).catch(() => false))) return false;
  return target
    .dispatchEvent('click', undefined, { timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Whatever the table asks of this player right now: bet 10 with the chip rack,
 * refuse insurance, and stand. Clicks are dispatched like taps.
 */
async function act(page: Page): Promise<boolean> {
  const betting = page.getByRole('group', { name: 'Aposta' });
  if (await tap(betting.getByRole('button', { name: 'Juntar 10', exact: true }))) {
    // Confirms whatever pile is built (the button may lag a render behind the chip).
    return tap(betting.getByRole('button', { name: /^Apostar \d+$/ }));
  }
  const insurance = page.getByRole('group', { name: /Seguro|Even money/ });
  if (await tap(insurance.getByRole('button', { name: 'Não', exact: true }))) return true;
  const stand = page.getByRole('group', { name: 'Decisão' }).getByRole('button', { name: /^Ficar/ });
  return tap(stand);
}

/** Plays every page until `done` holds. */
async function playUntil(pages: Page[], done: () => Promise<boolean>, label: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    expect(Date.now(), label).toBeLessThan(deadline);
    let acted = false;
    for (const page of pages) acted = (await act(page)) || acted;
    await pages[0]!.waitForTimeout(acted ? 250 : 150);
  }
}

const roundNumber = async (page: Page) =>
  Number(
    (
      await page
        .getByText(/^Ronda \d+/)
        .first()
        .textContent()
    )?.match(/\d+/)?.[0] ?? 0,
  );

test('a blackjack session: players come and go, the host ends it, everyone keeps their balance', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const names = ['ana', 'rui', 'eva'].map(uniqueName);
  const host = await signIn(browser, names[0] as string);
  const guest = await signIn(browser, names[1] as string, { width: 390, height: 844 });
  const latecomer = await signIn(browser, names[2] as string, { width: 820, height: 1180 });

  const code = await createBlackjackRoom(host);
  await joinAndReady(guest, code);
  await host.getByRole('button', { name: 'Abrir a mesa' }).click();

  // The table opens on the bets (hidden information is audited by the protocol suite).
  await expect(host.getByRole('group', { name: 'Aposta' })).toBeVisible();
  await playUntil([host, guest], async () => (await roundNumber(host)) >= 2, 'two rounds');

  // A third player sits down at the running table from the room link and plays from the next round.
  await latecomer.goto(`/room/${code}`);
  await expect(latecomer.getByText(/^Ronda \d+/)).toBeVisible();
  const joinedAt = await roundNumber(host);
  await playUntil(
    [host, guest, latecomer],
    async () => (await roundNumber(host)) >= joinedAt + 2,
    'latecomer plays',
  );

  // The guest gets up: back to the lobby, and the seat is freed for the next round.
  await guest.getByRole('button', { name: 'Sair da mesa' }).click();
  await guest.getByRole('dialog').getByRole('button', { name: 'Sair da mesa' }).click();
  await guest.waitForURL(/\/lobby$/);

  // The host ends the session; the round in play finishes first.
  await host.getByRole('button', { name: /Terminar/ }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Terminar sessão' }).click();
  const results = { name: 'Voltar à sala' } as const;
  await playUntil(
    [host, latecomer],
    async () => host.getByRole('button', results).isVisible(),
    'session end',
  );
  await expect(latecomer.getByRole('button', results)).toBeVisible();
  const dialog = host.getByRole('dialog', { name: /Ficaste|Sessão terminada/ });
  await expect(dialog.getByText(/fichas$/).first()).toBeVisible();
  await expect(dialog.getByText(names[1] as string)).toBeVisible(); // the guest who left still has a result

  await host.getByRole('button', results).click();
  await expect(host.getByText('Última partida')).toBeVisible();
  await expect(host.getByText(/[+−]?\d+ fichas/).first()).toBeVisible();
  await host.goto('/profile');
  await expect(host.getByText('Blackjack').first()).toBeVisible();
});
