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
      <body className="overflow-x-clip">
        <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip">
          <header className="border-b border-white/5 sticky top-0 z-30 bg-ink-950/80 backdrop-blur-md">
            <div className="mx-auto flex min-h-14 max-w-7xl min-w-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-0">
              <Link href="/" className="group flex min-w-0 items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-soft grid place-items-center text-white text-xs font-bold">
                  FL
                </div>
                <span className="truncate font-semibold tracking-tight text-white transition group-hover:text-accent-soft">
                  FounderLens
                </span>
              </Link>
              <div className="w-full min-w-0 sm:w-auto">
                <nav className="flex flex-wrap items-center gap-1 pb-1 text-sm sm:justify-end sm:pb-0">
                  <NavLink href="/">Dashboard</NavLink>
                  <NavLink href="/discover">Discover</NavLink>
                  <NavLink href="/founders">Founders</NavLink>
                  <NavLink href="/pipeline">Pipeline</NavLink>
                  <NavLink href="/network">Network</NavLink>
                </nav>
              </div>
              <div className="hidden text-xs text-ink-500 sm:block sm:text-right">
                powered by <span className="text-accent-soft">Claude Sonnet 4.5</span>
              </div>
            </div>
          </header>
          <main className="mx-auto flex-1 w-full max-w-7xl min-w-0 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <footer className="border-t border-white/5 px-4 py-6 text-center text-xs text-ink-500 break-words sm:px-6">
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
