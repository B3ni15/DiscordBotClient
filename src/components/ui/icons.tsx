/**
 * The line glyphs the chrome shares: channel types, the composer's buttons and
 * the header actions. Drawn as SVG so they take the text colour and stay crisp,
 * instead of the emoji they replace, which rendered differently per platform.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={`shrink-0 ${className ?? ""}`}
    >
      {children}
    </svg>
  );
}

export function HashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M10.99 3.16A1 1 0 1 0 9 2.84L8.15 8H4a1 1 0 0 0 0 2h3.82l-.67 4H3a1 1 0 1 0 0 2h3.82l-.8 4.84a1 1 0 0 0 1.97.32L8.85 16h4.97l-.8 4.84a1 1 0 0 0 1.97.32l.86-5.16H20a1 1 0 1 0 0-2h-3.82l.67-4H21a1 1 0 1 0 0-2h-3.82l.8-4.84a1 1 0 1 0-1.97-.32L15.15 8h-4.97l.8-4.84ZM14.15 14l.67-4H9.85l-.67 4h4.97Z"
      />
    </Svg>
  );
}

export function AnnouncementIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M19.56 2a3 3 0 0 0-2.46 1.28 3.85 3.85 0 0 1-1.86 1.42l-8.9 3.18a.5.5 0 0 0-.34.47v10.09a3 3 0 0 0 2.27 2.9l.62.16c1.57.4 3.15-.56 3.55-2.12a.92.92 0 0 1 1.23-.63l2.36.94c.42.27.79.62 1.07 1.03A3 3 0 0 0 19.56 22h.94c.83 0 1.5-.67 1.5-1.5v-17c0-.83-.67-1.5-1.5-1.5h-.94Zm-8.53 15.8L8 16.7v1.73a1 1 0 0 0 .76.97l.62.15c.5.13 1-.17 1.12-.67.1-.41.29-.78.53-1.1ZM4.44 8a.5.5 0 0 1 .56.5v7a.5.5 0 0 1-.56.5A3 3 0 0 1 2 13v-2a3 3 0 0 1 2.44-3Z"
      />
    </Svg>
  );
}

export function ThreadIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ""}`}
    >
      <path d="M8 3 6.5 13M14 3l-.6 4M3 6h13M2.5 10.5H9" />
      <path d="M13 11h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1v2.5L16 19h-3a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export function SpeakerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5ZM15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z"
      />
    </Svg>
  );
}

export function StageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M19.61 18.25a1.08 1.08 0 0 1-.07-1.33 9 9 0 1 0-15.07 0c.26.42.25.97-.08 1.33l-.02.02c-.41.44-1.12.43-1.46-.07a11 11 0 1 1 18.17 0c-.33.5-1.04.51-1.45.07l-.02-.02Z"
      />
      <path
        fill="currentColor"
        d="M16.2 15.53c.38.46 1.1.47 1.39-.04a7 7 0 1 0-11.18 0c.3.51 1.01.5 1.39.04l.03-.03c.27-.34.28-.81.08-1.19a5 5 0 1 1 8.58 0c-.2.38-.2.85.08 1.19l.03.03ZM12 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.03 20.85c-.32-1.13.57-2.18 1.74-2.18h2.46c1.17 0 2.06 1.05 1.74 2.18-.25.9-.97 1.15-1.97 1.15h-2c-1 0-1.72-.25-1.97-1.15Z"
      />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m6 9 6 6 6-6"
      />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        d="M6 6l12 12M18 6 6 18"
      />
    </Svg>
  );
}

export function PlusCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M12 23a11 11 0 1 0 0-22 11 11 0 0 0 0 22Zm0-17a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H7a1 1 0 1 1 0-2h4V7a1 1 0 0 1 1-1Z"
      />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        d="M12 5v14M5 12h14"
      />
    </Svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M13 16V5.41l3.3 3.3a1 1 0 1 0 1.4-1.42l-5-5a1 1 0 0 0-1.4 0l-5 5a1 1 0 0 0 1.4 1.42L11 5.4V16a1 1 0 1 0 2 0Z"
      />
      <path
        fill="currentColor"
        d="M4 15a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3a1 1 0 1 1 2 0v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3a1 1 0 0 1 1-1Z"
      />
    </Svg>
  );
}

export function PollIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M4 4a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 6a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm1 5a1 1 0 1 0 0 2h9a1 1 0 1 0 0-2H5Z"
      />
      <rect x="4" y="19" width="5" height="2" rx="1" fill="currentColor" />
    </Svg>
  );
}

export function EmbedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M5 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H5Zm0 2h1v14H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 3a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2h-8a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-6Zm-1 5a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1Z"
      />
    </Svg>
  );
}

export function SmileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M12 23a11 11 0 1 0 0-22 11 11 0 0 0 0 22ZM6.5 13a5.5 5.5 0 0 0 11 0h-11ZM9 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7.5-1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
      />
    </Svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M1.3 21.3a1 1 0 1 0 1.4 1.4l20-20a1 1 0 0 0-1.4-1.4l-20 20ZM3.16 16.05c.18.24.53.26.74.05l.72-.72c.18-.18.2-.45.05-.66a15.7 15.7 0 0 1-1.43-2.52.48.48 0 0 1 0-.4c.4-.9 1.18-2.37 2.37-3.72C7.13 6.38 9.2 5 12 5c.82 0 1.58.12 2.28.33.18.05.38 0 .52-.13l.8-.8c.25-.25.18-.67-.15-.8A9.79 9.79 0 0 0 12 3C4.89 3 1.73 10.11 1.11 11.7a.83.83 0 0 0 0 .6c.25.64.9 2.15 2.05 3.75ZM8.18 10.9c-.06.36.33.58.6.32l2.44-2.45c.26-.26.04-.65-.32-.6a3 3 0 0 0-2.72 2.73ZM15.82 13.1c.06-.36-.33-.58-.6-.32l-2.44 2.45c-.26.26-.04.65.32.6a3 3 0 0 0 2.72-2.73ZM9.72 18.67a.52.52 0 0 0-.52.13l-.8.8c-.25.25-.18.67.15.8 1.03.38 2.18.6 3.45.6 7.11 0 10.27-7.11 10.89-8.7a.83.83 0 0 0 0-.6c-.25-.64-.9-2.15-2.05-3.75a.49.49 0 0 0-.74-.05l-.72.72a.51.51 0 0 0-.05.66 15.7 15.7 0 0 1 1.43 2.52.48.48 0 0 1 0 .4c-.4.9-1.18 2.37-2.37 3.72C16.87 17.62 14.8 19 12 19c-.82 0-1.58-.12-2.28-.33Z"
      />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M14.25 1c.41 0 .75.34.75.75V3h5.25c.41 0 .75.34.75.75v.5c0 .41-.34.75-.75.75H3.75A.75.75 0 0 1 3 4.25v-.5c0-.41.34-.75.75-.75H9V1.75c0-.41.34-.75.75-.75h4.5ZM5.06 7a1 1 0 0 0-1 1.06l.76 12.13a3 3 0 0 0 3 2.81h8.36a3 3 0 0 0 3-2.81l.75-12.13a1 1 0 0 0-1-1.06H5.07ZM11 12a1 1 0 1 0-2 0v6a1 1 0 1 0 2 0v-6Zm3-1a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z"
      />
    </Svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M6 2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V9.41a2 2 0 0 0-.59-1.41l-5.41-5.41A2 2 0 0 0 13.59 2H6Zm8 1.91L19.09 9H15a1 1 0 0 1-1-1V3.91Z"
      />
    </Svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M19.38 11.38a3 3 0 0 0 4.24 0l.03-.03a.5.5 0 0 0 0-.7L13.35.35a.5.5 0 0 0-.7 0l-.03.03a3 3 0 0 0 0 4.24L13 5l-2.92 2.92-3.65-.34a2 2 0 0 0-1.6.58l-.62.63a1 1 0 0 0 0 1.42l9.58 9.58a1 1 0 0 0 1.42 0l.63-.63a2 2 0 0 0 .58-1.6l-.34-3.64L19 11l.38.38ZM9.07 17.07a.5.5 0 0 1-.08.77l-5.15 3.43a.5.5 0 0 1-.63-.06l-.42-.42a.5.5 0 0 1-.06-.63L6.16 15a.5.5 0 0 1 .77-.08l2.14 2.14Z"
      />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M15.62 17.03a9 9 0 1 1 1.41-1.41l4.68 4.67a1 1 0 0 1-1.42 1.42l-4.67-4.68ZM17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
      />
    </Svg>
  );
}

export function MembersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M14.5 8a3 3 0 1 0-2.7-4.3c-.2.4.06.86.44 1.12a5 5 0 0 1 2.14 3.08c.01.06.06.1.12.1ZM18.44 17.27c.15.43.54.73 1 .73h1.06c.83 0 1.5-.67 1.5-1.5a7.5 7.5 0 0 0-6.5-7.43c-.55-.08-.99.38-1.1.92-.06.3-.15.6-.26.87-.23.58-.05 1.3.47 1.63a9.53 9.53 0 0 1 3.83 4.78ZM12.5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 20.5a7.5 7.5 0 0 1 15 0c0 .83-.67 1.5-1.5 1.5a.2.2 0 0 1-.2-.16c-.2-.96-.56-1.87-.88-2.54-.1-.23-.42-.15-.42.1v2.1a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-2.1c0-.25-.31-.33-.42-.1-.32.67-.67 1.58-.88 2.54a.2.2 0 0 1-.2.16A1.5 1.5 0 0 1 2 20.5Z"
      />
    </Svg>
  );
}

export function DoorExitIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fill="currentColor"
        d="M9 3a1 1 0 0 1 1-1h8a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3h-8a1 1 0 1 1 0-2h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-8a1 1 0 0 1-1-1Z"
      />
      <path
        fill="currentColor"
        d="M8.7 7.3a1 1 0 0 0-1.4 0l-4 4a1 1 0 0 0 0 1.4l4 4a1 1 0 0 0 1.4-1.4L6.42 13H15a1 1 0 1 0 0-2H6.41l2.3-2.3a1 1 0 0 0 0-1.4Z"
      />
    </Svg>
  );
}

/** An outlined glyph: the menus' icons, drawn at a 2px stroke like Discord's. */
function Stroke({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ""}`}
    >
      {children}
    </svg>
  );
}

export function ReplyIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Stroke>
  );
}

export function ForwardIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Stroke>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </Stroke>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Stroke>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Stroke>
  );
}

export function IdIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M7 9v6M11 9v6h2a3 3 0 0 0 0-6Z" />
    </Stroke>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Stroke>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Stroke>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4Z" />
      <circle cx="16.5" cy="7.5" r="1" fill="currentColor" />
    </Stroke>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Stroke>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
    </Stroke>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </Stroke>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </Stroke>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m9 18 6-6-6-6" />
    </Stroke>
  );
}

export function BotIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4M9 13v2M15 13v2M2 14h2M20 14h2" />
    </Stroke>
  );
}

export function HammerIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m15 12-8.4 8.4a2.1 2.1 0 1 1-3-3L12 9" />
      <path d="M17.6 15 22 10.6M20.9 11.7l-1.3-1.3a2 2 0 0 1-.6-1.4V7.9L16.7 5.6A6 6 0 0 0 12.4 4H9l.9.8A6.2 6.2 0 0 1 12 9.5V11l2 2h1.2a2 2 0 0 1 1.4.6l1.3 1.3" />
    </Stroke>
  );
}

export function BootIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M7 3h6v8l6 2a3 3 0 0 1 2 3v2H3V3h4Z" />
      <path d="M3 21h18M13 7h-3M13 10h-3" />
    </Stroke>
  );
}

export function VolumeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </Stroke>
  );
}

export function MicStrokeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
    </Stroke>
  );
}

export function PhoneOffIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M10.7 13.3a16 16 0 0 0 3.4 2.4l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7" />
      <path d="M22 2 2 22" />
    </Stroke>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Stroke>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </Stroke>
  );
}

export function SmileStrokeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </Stroke>
  );
}

export function PowerIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0" />
    </Stroke>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M10 2h4M12 14l3-3" />
      <circle cx="12" cy="14" r="8" />
    </Stroke>
  );
}

export function AtIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </Stroke>
  );
}

export function PinStrokeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 17v5M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
    </Stroke>
  );
}

export function TrashStrokeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
    </Stroke>
  );
}

export function PlusStrokeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  );
}

export function DoorStrokeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Stroke>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </Stroke>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
    </Stroke>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" />
    </Stroke>
  );
}

export function SlashIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m14.5 7.5-5 9" />
    </Stroke>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Stroke>
  );
}

export function BellOffIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20" />
    </Stroke>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </Stroke>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path fill="currentColor" d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </Stroke>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </Stroke>
  );
}

export function ForumIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z" />
      <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
    </Stroke>
  );
}

export function MusicIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Stroke>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16M8 17v-5M13 17V8M18 17v-3" />
    </Stroke>
  );
}

export function GamepadIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M6 12h4M8 10v4M15 13h.01M18 11h.01" />
      <rect x="2" y="6" width="20" height="12" rx="6" />
    </Stroke>
  );
}

/**
 * Menus name their icon with a short glyph string, which keeps the menu
 * definitions plain data; this is where each glyph becomes a drawn icon. A
 * glyph with no entry still renders as the text it is.
 */
const MENU_GLYPHS: Record<string, (props: IconProps) => React.ReactNode> = {
  "↩": ReplyIcon,
  "↪": ForwardIcon,
  "✎": PencilIcon,
  "🔗": LinkIcon,
  "⧉": CopyIcon,
  "🆔": IdIcon,
  "✓": CheckIcon,
  "🔒": LockIcon,
  "🔑": KeyIcon,
  "👤": UserIcon,
  "🏷": TagIcon,
  "☰": ListIcon,
  "→": ArrowRightIcon,
  "🤖": BotIcon,
  "🔨": HammerIcon,
  "👢": BootIcon,
  "🔈": VolumeIcon,
  "🎙": MicStrokeIcon,
  "📴": PhoneOffIcon,
  "📁": FolderIcon,
  "✉": MailIcon,
  "☺": SmileStrokeIcon,
  "⏻": PowerIcon,
  "⏳": TimerIcon,
  "@": AtIcon,
  "📌": PinStrokeIcon,
  "🗑": TrashStrokeIcon,
  "＋": PlusStrokeIcon,
  "⎋": DoorStrokeIcon,
  "⚙": GearIcon,
  "🛡": ShieldIcon,
  "✦": SparkleIcon,
  "▸": ChevronRightIcon,
  "▾": ChevronDownStroke,
  "🔔": BellIcon,
  "🔕": BellOffIcon,
  "📊": ChartIcon,
  "📥": DownloadIcon,
  "🧵": ThreadIcon,
};

function ChevronDownStroke(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m6 9 6 6 6-6" />
    </Stroke>
  );
}

export function MenuGlyph({ glyph, size = 18 }: { glyph: string; size?: number }) {
  const Icon = MENU_GLYPHS[glyph];
  if (Icon) return <Icon size={size} />;
  return (
    <span aria-hidden className="w-[18px] text-center text-xs">
      {glyph}
    </span>
  );
}
