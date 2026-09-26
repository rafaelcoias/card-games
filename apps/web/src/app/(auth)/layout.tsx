import { Logo } from '@/components/ui/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-backdrop flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="panel w-full max-w-[420px] p-6 sm:p-8">{children}</div>
    </main>
  );
}
