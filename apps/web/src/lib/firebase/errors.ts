import { FirebaseError } from 'firebase/app';

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou palavra-passe incorretos.',
  'auth/wrong-password': 'E-mail ou palavra-passe incorretos.',
  'auth/user-not-found': 'E-mail ou palavra-passe incorretos.',
  'auth/invalid-email': 'Esse e-mail não parece válido.',
  'auth/email-already-in-use': 'Esse e-mail já tem conta. Experimenta entrar.',
  'auth/weak-password': 'A palavra-passe precisa de pelo menos 8 caracteres.',
  'auth/too-many-requests': 'Demasiadas tentativas. Espera um pouco e tenta de novo.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/network-request-failed': 'Sem ligação. Verifica a internet e tenta de novo.',
  'auth/invalid-action-code': 'O link expirou ou já foi usado. Pede um novo.',
  'auth/expired-action-code': 'O link expirou. Pede um novo.',
  'auth/operation-not-allowed': 'Este método de entrada não está ativo no Firebase.',
  'auth/unauthorized-continue-uri': 'Domínio não autorizado no Firebase (Authentication → Settings).',
};

export function authErrorMessage(error: unknown, fallback = 'Algo correu mal. Tenta de novo.'): string {
  if (error instanceof FirebaseError) return MESSAGES[error.code] ?? fallback;
  return fallback;
}
