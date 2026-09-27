import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="Cards — início">
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-6 items-center justify-center rounded-[5px] bg-ivory text-[15px] font-bold text-[#1a1a1a] shadow-md transition-transform duration-200 group-hover:-rotate-6"
      >
        ♠
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">Cards</span>
    </Link>
  );
}
