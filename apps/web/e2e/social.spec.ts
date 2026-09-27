import { expect } from '@playwright/test';
import { createRoom, joinAndReady, signIn, test, uniqueName } from './helpers';

const SHOTS = process.env.E2E_SCREENSHOTS;
const shot = (name: string) => (SHOTS ? { path: `${SHOTS}/${name}.png` } : undefined);

test('who is online, player search and public profiles', async ({ browser }) => {
  const anaName = uniqueName('ana');
  const ruiName = uniqueName('rui');
  const ana = await signIn(browser, anaName);
  const rui = await signIn(browser, ruiName, { width: 390, height: 844 });

  // Lobby: both appear in "Online agora" (refreshes on connect and every 10 s).
  const panel = ana.getByRole('region', { name: 'Online agora' });
  await expect(panel.getByText(ruiName)).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(`${anaName} (tu)`)).toBeVisible();
  await expect(panel.getByText('No lobby').first()).toBeVisible();
  await ana.screenshot(shot('lobby-online-desktop'));
  await expect(rui.getByRole('region', { name: 'Online agora' }).getByText(anaName)).toBeVisible({
    timeout: 15_000,
  });
  await rui.screenshot(shot('lobby-online-phone'));

  // Search by prefix, any case, then open the public profile.
  await ana
    .getByRole('navigation', { name: 'Principal' })
    .first()
    .getByRole('link', { name: 'Jogadores' })
    .click();
  await ana.getByLabel('Procurar por nome de utilizador').fill(ruiName.slice(0, 7).toUpperCase());
  await expect(ana).toHaveURL(new RegExp(`q=${ruiName.slice(0, 7).toUpperCase()}`));
  await ana.getByRole('link', { name: new RegExp(ruiName) }).click();
  await expect(ana.getByRole('heading', { name: ruiName })).toBeVisible();
  await expect(ana.getByText('Online · No lobby')).toBeVisible();
  await expect(ana.getByText('% vitórias')).toBeVisible();
  await ana.screenshot(shot('player-profile'));

  // Unknown players get a friendly page.
  await ana.goto('/players/nobody_like_this_xyz');
  await expect(ana.getByText('Jogador não encontrado')).toBeVisible();
});

test('chat pop-ups, low-time warning and leaving a match', async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = await signIn(browser, uniqueName('ana'));
  const rui = await signIn(browser, uniqueName('rui'), { width: 390, height: 844 });

  const code = await createRoom(ana, 'Mexicana');
  await joinAndReady(rui, code);
  await ana.getByRole('button', { name: 'Começar partida' }).click();
  await expect(ana.getByRole('button', { name: /Confirmar \(0\/3\)/ })).toBeVisible();

  // Rui writes in the chat; Ana (chat closed) sees it pop up over the table.
  await rui.getByRole('button', { name: 'Chat' }).click();
  await rui.getByLabel('Mensagem').fill('Boa sorte a todos!');
  await rui.getByRole('button', { name: 'Enviar' }).click();
  const bubble = ana.getByRole('button', { name: /Mensagem de .*Boa sorte a todos!/ });
  await expect(bubble).toBeVisible();
  await ana.screenshot(shot('chat-bubble'));
  await bubble.click();
  await expect(
    ana.getByRole('region', { name: 'Chat da sala' }).getByText('Boa sorte a todos!'),
  ).toBeVisible();
  await ana.getByRole('button', { name: 'Fechar chat' }).click();

  // Neither player chooses: the edge glow appears in the last seconds of the 30 s timer.
  await expect(ana.locator('.time-warning')).toBeVisible({ timeout: 32_000 });
  await ana.screenshot(shot('time-warning-desktop'));
  await rui.screenshot(shot('time-warning-phone'));
  // Once the server auto-chooses, the warning goes away.
  await expect(ana.locator('.time-warning')).toBeHidden({ timeout: 10_000 });

  // Leaving asks for confirmation; "Continuar a jogar" keeps you at the table.
  await ana.getByRole('button', { name: 'Sair da partida' }).click();
  const dialog = ana.getByRole('dialog', { name: 'Sair da partida?' });
  await expect(dialog).toContainText('último lugar');
  await ana.screenshot(shot('leave-dialog'));
  await dialog.getByRole('button', { name: 'Continuar a jogar' }).click();
  await expect(dialog).toBeHidden();

  await ana.getByRole('button', { name: 'Sair da partida' }).click();
  await dialog.getByRole('button', { name: 'Sair da partida' }).click();
  await expect(ana.getByRole('heading', { name: 'Salas', exact: true })).toBeVisible();

  // Rui is still in the match, now against the server's automatic moves.
  await expect(rui.locator('.felt').first()).toBeVisible();
  await rui.screenshot(shot('phone-table'));
});
