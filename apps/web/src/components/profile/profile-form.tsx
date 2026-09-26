'use client';

import { usernameSchema, type ProfileDto } from '@cardroom/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { browserApi } from '@/lib/auth/client-token';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';

export interface ProfileFormProps {
  initial?: ProfileDto;
  submitLabel: string;
  redirectTo?: string;
}

export function ProfileForm({ initial, submitLabel, redirectTo }: ProfileFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState(initial?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? '');
  const [errors, setErrors] = useState<{ username?: string; avatarUrl?: string }>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      setErrors({ username: 'Usa 3 a 20 letras, números ou _ (sem espaços).' });
      return;
    }
    const avatar = avatarUrl.trim();
    if (avatar && !/^https:\/\/\S+$/i.test(avatar)) {
      setErrors({ avatarUrl: 'Usa um endereço https:// de uma imagem.' });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await browserApi.updateProfile({ username: parsed.data, avatarUrl: avatar || null });
      toast.success('Perfil guardado');
      if (redirectTo) router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
        setErrors({ username: describeError({ code: error.code, message: error.message }) });
      } else {
        toast.error('Não foi possível guardar o perfil.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={username || '?'} src={avatarUrl.trim() || null} size={56} />
        <p className="text-sm text-muted">Sem imagem, usamos as tuas iniciais.</p>
      </div>
      <Field
        label="Nome de utilizador"
        autoComplete="nickname"
        autoFocus={!initial}
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={errors.username}
        hint="3 a 20 caracteres: letras, números ou _"
      />
      <Field
        label="Avatar (opcional)"
        type="url"
        inputMode="url"
        placeholder="https://…"
        value={avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
        error={errors.avatarUrl}
      />
      <Button type="submit" size="lg" loading={saving}>
        {submitLabel}
      </Button>
    </form>
  );
}
