'use client';

import { useEffect, useState } from 'react';

function founderImageUrl(avatarUrl: string): string {
  return `/api/founder-image?url=${encodeURIComponent(avatarUrl)}`;
}

export function FounderAvatar({
  name,
  avatarUrl,
  className = 'h-10 w-10',
}: {
  name: string;
  avatarUrl: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  if (!avatarUrl || failed) {
    return (
      <div
        className={`${className} grid shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-bold text-ink-500`}
        aria-hidden="true"
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    // The proxy avoids third-party hotlink protection and keeps remote host rules in one place.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={founderImageUrl(avatarUrl)}
      alt={`${name} profile photo`}
      className={`${className} shrink-0 rounded-full bg-ink-800 object-cover`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
