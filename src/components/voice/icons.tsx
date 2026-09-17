/**
 * The small glyphs the voice surfaces share: the channel list, the connection
 * panel and the soundboard all draw the same mic and headphones.
 */

export function MicIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 9a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V23h2v-3.06A9 9 0 0 0 21 11h-2z"
      />
    </svg>
  );
}

/** Mic with a slash: the microphone is off. */
export function MicOffIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm7 9a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V23h2v-3.06A9 9 0 0 0 21 11h-2z"
      />
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function HeadphonesIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h2v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h2a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"
      />
    </svg>
  );
}

/** Headphones with a slash: the member hears nothing, so they hear nobody. */
export function DeafIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h2v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h2a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"
      />
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function VideoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M3 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm15 3.5 4-2.5v10l-4-2.5v-5z"
      />
    </svg>
  );
}

/** Phone hanging up: leave the voice channel. */
export function DisconnectIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M12 9c-1.6 0-3.15.25-4.6.7v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a.98.98 0 0 1-1.35 0L.29 13.08a.98.98 0 0 1 0-1.4C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a.98.98 0 0 1 0 1.4l-2.54 2.48a.98.98 0 0 1-1.35 0 11.6 11.6 0 0 0-2.66-1.85.99.99 0 0 1-.56-.9V9.7A15.6 15.6 0 0 0 12 9z"
      />
    </svg>
  );
}

/** A speaker with waves: the soundboard. */
export function SoundboardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path fill="currentColor" d="M11 4.5v15a1 1 0 0 1-1.65.76L5.2 16.5H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h2.2l4.15-3.76A1 1 0 0 1 11 4.5z" />
      <path
        d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
