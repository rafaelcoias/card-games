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
  FACE_UP_CARD_REQUIRED: 'Escolhe a carta visível que levas com a pilha.',
  ALREADY_CHOSEN: 'Já escolheste as tuas cartas visíveis.',
  WRONG_PHASE: 'Ação indisponível neste momento.',
  // Fodinha engine
  ALREADY_BID: 'A tua aposta já está fechada.',
  INVALID_BID: 'Essa aposta não é possível nesta ronda.',
  FORBIDDEN_BID: 'O último a apostar não pode fazer a soma das apostas igual ao número de vazas.',
  INVALID_CARD: 'Essa carta não está na tua mão.',
  BLIND_ROUND: 'Na ronda às cegas as cartas são jogadas automaticamente.',
  TOO_MANY_CARDS: 'Não há cartas que cheguem para tantos jogadores com essa mão máxima.',
  // Blackjack engine and session tables
  CANNOT_END: 'A sessão já vai terminar no fim desta ronda.',
  SESSION_ENDING: 'A sessão já vai terminar no fim desta ronda.',
  SESSION_OVER: 'A sessão já terminou.',
  NOT_SEATED: 'Não estás sentado a esta mesa.',
  SITTING_OUT: 'Estás de fora: volta à mesa para apostar.',
  ALREADY_BET: 'Já apostaste nesta ronda.',
  INVALID_BET: 'Aposta fora dos limites da mesa (múltiplos de 10).',
  NOT_ENOUGH_CHIPS: 'Não tens fichas suficientes.',
  NO_BET: 'Não tens aposta para limpar.',
  REBUY_DISABLED: 'Esta mesa não permite recompras.',
  REBUY_NOT_NEEDED: 'Ainda tens fichas para a aposta mínima.',
  NO_CHANGE: 'Já está assim.',
  NO_OFFER: 'Essa oferta já não está disponível.',
  ILLEGAL_DECISION: 'Essa jogada não é possível com esta mão.',
  SEAT_TAKEN: 'Esse lugar já está ocupado.',
  TABLE_LIMITS: 'Os limites da mesa não batem certo com as fichas iniciais.',
  HINTS_UNSUPPORTED: 'A dica só existe com 4 ou mais baralhos, banca a ficar no 17 mole e carta americana.',
};

export function describeError(error: ErrorPayload): string {
  return MESSAGES[error.code] ?? error.message;
}
