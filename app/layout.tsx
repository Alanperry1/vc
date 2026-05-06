import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FounderLens — VC sourcing, supercharged',
  description:
    'AI-powered VC deal sourcing — discover, score, and track founders from live signals across GitHub, Hacker News, and tech press.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-white/5 sticky top-0 z-30 bg-ink-950/80 backdrop-blur-md">
            <div className="mx-auto flex min-h-14 max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-0">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-soft grid place-items-center text-white text-xs font-bold">
                  FL
                </div>
                <span className="font-semibold tracking-tight text-white group-hover:text-accent-soft transition">
                  FounderLens
                </span>
              </Link>
              <div className="w-full overflow-x-auto sm:w-auto">
                <nav className="flex min-w-max items-center gap-1 pb-1 text-sm sm:pb-0">
                  <NavLink href="/">Dashboard</NavLink>
                  <NavLink href="/discover">Discover</NavLink>
                  <NavLink href="/founders">Founders</NavLink>
                  <NavLink href="/pipeline">Pipeline</NavLink>
                  <NavLink href="/network">Network</NavLink>
                </nav>
              </div>
              <div className="text-xs text-ink-500 hidden sm:block">
                powered by <span className="text-accent-soft">Claude Sonnet 4.5</span>
              </div>
            </div>
          </header>
          <main className="mx-auto flex-1 max-w-7xl w-full px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <footer className="border-t border-white/5 px-4 py-6 text-center text-xs text-ink-500 sm:px-6">
            FounderLens — sourcing, founder success prediction, and community connections, in one app.
          </footer>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-ink-500 hover:text-white hover:bg-white/5 transition"
    >
      {children}
    </Link>
  );
}
