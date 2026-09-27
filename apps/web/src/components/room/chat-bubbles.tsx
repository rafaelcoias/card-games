'use client';

import type { ChatMessage } from '@cardroom/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { playSound } from '@/games/shared/sounds';
import { useRealtime } from '@/lib/realtime/store';

const MAX_BUBBLES = 3;
const VISIBLE_MS = 5_000;

export interface ChatBubblesProps {
  selfId: string;
  /** While the chat drawer is open messages are read there, so no bubbles. */
  chatOpen: boolean;
  onOpenChat: () => void;
}

/**
 * During a match, other players' chat messages pop up briefly over the table
 * so they can be read without opening the chat. Tapping one opens the chat.
 */
export function ChatBubbles({ selfId, chatOpen, onOpenChat }: ChatBubblesProps) {
  const [bubbles, setBubbles] = useState<ChatMessage[]>([]);
  const chatOpenRef = useRef(chatOpen);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  // Subscribe to the store directly: only *new* messages matter, not re-renders.
  useEffect(
    () =>
      useRealtime.subscribe((state, previous) => {
        if (state.chat === previous.chat || chatOpenRef.current) return;
        const known = new Set(previous.chat.map((m) => m.id));
        const fresh = state.chat.filter((m) => !known.has(m.id) && m.playerId !== selfId);
        if (fresh.length === 0) return;
        playSound('chat');
        setBubbles((current) => [...current, ...fresh].slice(-MAX_BUBBLES));
      }),
    [selfId],
  );

  const dismiss = (id: string) => setBubbles((current) => current.filter((m) => m.id !== id));
  const shown = chatOpen ? [] : bubbles;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute right-2 top-2 z-40 flex w-[min(20rem,calc(100%-1rem))] flex-col items-end gap-2"
    >
      <AnimatePresence initial={false}>
        {shown.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            onDismiss={() => dismiss(message.id)}
            onOpen={() => {
              setBubbles([]);
              onOpenChat();
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Bubble({
  message,
  onDismiss,
  onOpen,
}: {
  message: ChatMessage;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per bubble, from when it appears
  }, []);

  return (
    <motion.button
      type="button"
      layout
      onClick={onOpen}
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className="pointer-events-auto flex max-w-full items-start gap-2.5 rounded-2xl rounded-tr-md border border-line-strong bg-surface-2/95 px-3 py-2 text-left shadow-2xl backdrop-blur-md"
      aria-label={`Mensagem de ${message.username}: ${message.text}. Abrir chat`}
    >
      <Avatar name={message.username} size={28} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-gold">{message.username}</span>
        <span className="line-clamp-3 break-words text-sm text-ivory">{message.text}</span>
      </span>
    </motion.button>
  );
}
