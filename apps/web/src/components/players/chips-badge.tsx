import { Chip } from '@/games/blackjack/chips';

const chipsFormat = new Intl.NumberFormat('pt-PT');

/** The account's Blackjack chips, as everyone sees them on a profile. */
export function ChipsBadge({ chips }: { chips: number }) {
  return (
    <p
      className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 py-1 pl-1 pr-3 text-sm font-semibold text-gold"
      title="Fichas do Blackjack: virtuais, sem valor real"
    >
      <Chip value={100} size={22} />
      <span>
        <span className="tabular-nums">{chipsFormat.format(chips)}</span> fichas
      </span>
    </p>
  );
}
