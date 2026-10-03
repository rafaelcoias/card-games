import type { Suit } from '@cardroom/game-core';
import type { HandSummary, Seat, Team } from '@cardroom/sueca';

export const SEAT_LABEL: Record<Seat, string> = { S: 'Sul', E: 'Este', N: 'Norte', W: 'Oeste' };
export const TEAM_NAME: Record<Team, string> = { A: 'Equipa A', B: 'Equipa B' };
/** Two sober colours (UI §1): dark blue and bordeaux. */
export const TEAM_COLOR: Record<Team, string> = { A: '#3b5f9e', B: '#9b3a4f' };

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = { S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' };
export const isRed = (suit: Suit) => suit === 'H' || suit === 'D';

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const games = (n: number) => plural(n, 'jogo', 'jogos');

/** "Ana e Carla" (no articles: a name says nothing about who wears it). */
export const pair = (names: readonly string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;

/** The result of a hand from the viewer's side (UI §8). */
export function handVerdict(summary: HandSummary, myTeam: Team | null): string {
  const us = myTeam ?? 'A';
  const them = us === 'A' ? 'B' : 'A';
  const mine = summary.gamesAwarded[us];
  const theirs = summary.gamesAwarded[them];
  if (mine === 0 && theirs === 0) return '60–60 · ninguém pontua';
  if (!myTeam) {
    const team = mine > 0 ? 'A' : 'B';
    return `${TEAM_NAME[team]} ganha ${games(Math.max(mine, theirs))}`;
  }
  const flag = summary.points[mine > 0 ? us : them] === 120 ? 'Bandeira! ' : '';
  return mine > 0 ? `${flag}Ganhámos ${games(mine)}` : `${flag}Eles ganham ${games(theirs)}`;
}

/** "Nós 79 · Eles 41". */
export function pointsLine(summary: HandSummary, myTeam: Team | null): string {
  const us = myTeam ?? 'A';
  const them = us === 'A' ? 'B' : 'A';
  return myTeam
    ? `Nós ${summary.points[us]} · Eles ${summary.points[them]}`
    : `A ${summary.points.A} · B ${summary.points.B}`;
}
