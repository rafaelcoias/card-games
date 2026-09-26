'use client';

import { roomCodeSchema, ROOM_CODE_LENGTH } from '@cardroom/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';

export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = roomCodeSchema.safeParse(code);
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    router.push(`/room/${parsed.data}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2" aria-label="Entrar numa sala com código">
      <label htmlFor="room-code" className="sr-only">
        Código da sala
      </label>
      <input
        id="room-code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase().replace(/\s/g, ''));
          setInvalid(false);
        }}
        maxLength={ROOM_CODE_LENGTH}
        placeholder="CÓDIGO"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        className={`h-12 w-36 rounded-xl border bg-ink/60 px-3 text-center font-mono text-lg tracking-[0.3em] uppercase outline-none placeholder:tracking-[0.2em] placeholder:text-subtle focus:border-gold/70 ${
          invalid ? 'border-danger/70' : 'border-line-strong'
        }`}
      />
      <Button type="submit" variant="secondary" size="lg" disabled={code.length !== ROOM_CODE_LENGTH}>
        Entrar
      </Button>
    </form>
  );
}
