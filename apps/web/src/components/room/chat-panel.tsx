'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useProfile } from '@/components/app/profile-context';
import { describeError } from '@/lib/errors';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { toast } from '@/lib/toast';

export function ChatPanel({ className }: { className?: string }) {
  const profile = useProfile();
  const chat = useRealtime((s) => s.chat);
  const markRead = useRealtime((s) => s.markChatRead);
  const { sendChat } = useRoomCommands();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    markRead();
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, markRead]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText('');
    const ack = await sendChat(message);
    if (!ack.ok) {
      setText(message);
      toast.error(describeError(ack.error));
    }
  }

  return (
    <section className={clsx('panel flex flex-col overflow-hidden', className)} aria-label="Chat da sala">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Chat</h2>
      <ol ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {chat.length === 0 && <li className="text-sm text-subtle">Diz olá à mesa 👋</li>}
        {chat.map((message) => {
          const mine = message.playerId === profile.id;
          return (
            <li key={message.id} className={clsx('flex flex-col', mine ? 'items-end' : 'items-start')}>
              {!mine && <span className="mb-0.5 text-xs font-semibold text-gold/90">{message.username}</span>}
              <span
                className={clsx(
                  'max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm',
                  mine ? 'rounded-br-md bg-gold/20 text-ivory' : 'rounded-bl-md bg-surface-3',
                )}
              >
                {message.text}
              </span>
            </li>
          );
        })}
      </ol>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-3">
        <label htmlFor="chat-input" className="sr-only">
          Mensagem
        </label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="Escreve uma mensagem…"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-ink/60 px-3 text-sm outline-none focus:border-gold/70"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="h-10 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-ink disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
