import type { ErrorPayload } from '@cardroom/shared';

/** Portuguese copy for error codes; falls back to the server message. */
const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'A tua sessão expirou. Entra novamente.',
  PROFILE_REQUIRED: 'Escolhe primeiro um nome de utilizador.',
  VALIDATION: 'Pedido inválido.',
  RATE_LIMITED: 'Calma! Estás a enviar pedidos demasiado depressa.',
  UNKNOWN_GAME: 'Jogo desconhecido.',
  ROOM_NOT_FOUND: 'Não existe nenhuma sala com esse código.',
  ROOM_FULL: 'A sala está cheia.',
  ROOM_IN_PROGRESS: 'Já há uma partida a decorrer nesta sala.',
  NOT_IN_ROOM: 'Não estás nesta sala.',
  NOT_HOST: 'Só o anfitrião pode fazer isso.',
  NOT_READY: 'Ainda há jogadores que não estão prontos (ou estão desligados).',
  ALREADY_IN_ROOM: 'Ainda estás numa partida a decorrer noutra sala.',
  PLAYER_COUNT: 'Número de jogadores inválido para este jogo.',
  CANNOT_KICK: 'Durante a partida só podes remover jogadores desligados.',
  GAME_NOT_RUNNING: 'A partida já terminou.',
  USERNAME_TAKEN: 'Esse nome de utilizador já está a ser usado.',
  BUSY: 'O servidor está ocupado, tenta de novo.',
  NETWORK: 'Sem ligação ao servidor.',
  INTERNAL: 'Algo correu mal. Tenta de novo.',
  // Mexicana engine
  NOT_YOUR_TURN: 'Não é a tua vez.',
  ILLEGAL_PLAY: 'Essa carta não pode ser jogada sobre a pilha.',
  MIXED_RANKS: 'Só podes jogar cartas do mesmo valor.',
  PICK_UP_NOT_ALLOWED: 'Tens uma jogada válida — não podes apanhar a pilha.',
  MUST_PLAY_FACE_DOWN: 'Só te restam cartas escondidas.',
  ALREADY_CHOSEN: 'Já escolheste as tuas cartas visíveis.',
  WRONG_PHASE: 'Ação indisponível neste momento.',
};

export function describeError(error: ErrorPayload): string {
  return MESSAGES[error.code] ?? error.message;
}
