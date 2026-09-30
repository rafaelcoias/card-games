import { expect } from '@playwright/test';
import { createRoom, joinAndReady, signIn, test, uniqueName } from './helpers';

/** Chromium runs with a fake microphone (see playwright.config.ts). */
test('a player turns the microphone on and the other one hears them', async ({ browser }) => {
  const ana = await signIn(browser, uniqueName('ana'));
  const rui = await signIn(browser, uniqueName('rui'));

  const code = await createRoom(ana, 'Peixinho');
  await joinAndReady(rui, code);

  const micOn = rui.getByTitle('Microfone ligado');
  const ruiVoice = rui.getByTestId('voice-chat');
  await expect(micOn).toHaveCount(0);
  await expect(ruiVoice).toHaveAttribute('data-peers', '');

  await ana.getByRole('button', { name: 'Ligar microfone' }).click();
  await expect(ana.getByRole('button', { name: 'Desligar microfone' })).toBeVisible();
  await expect(micOn).toHaveCount(1);
  // Rui has his microphone off but is connected to Ana, to hear her.
  await expect(ruiVoice).toHaveAttribute('data-peers', /.+/, { timeout: 30_000 });

  // The voice chat carries over from the waiting room to the table.
  await ana.getByRole('button', { name: 'Começar partida' }).click();
  await expect(ana.getByRole('button', { name: 'Desligar microfone' })).toBeVisible();
  await expect(ruiVoice).toHaveAttribute('data-peers', /.+/);

  await ana.getByRole('button', { name: 'Desligar microfone' }).click();
  await expect(ruiVoice).toHaveAttribute('data-peers', '');
});
