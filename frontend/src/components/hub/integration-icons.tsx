"use client";

import type { ReactElement } from "react";

interface IconProps {
  size?: number;
  className?: string;
}

export function MicrosoftIcon({ size = 28 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function GoogleCalendarIcon({ size = 28 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="4" y="4" width="40" height="40" rx="6" fill="#4285F4" />
      <rect x="9" y="9" width="30" height="30" rx="3" fill="white" />
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="#4285F4"
        fontFamily="ui-sans-serif, system-ui"
      >
        22
      </text>
    </svg>
  );
}

export function GmailIcon({ size = 28 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="2" y="8" width="44" height="32" rx="4" fill="#fff" />
      <path d="M4 11l20 14L44 11" stroke="#EA4335" strokeWidth="3" fill="none" />
      <path d="M2 12v24a4 4 0 004 4h6V20L2 12z" fill="#C5221F" />
      <path d="M46 12v24a4 4 0 01-4 4h-6V20l10-8z" fill="#EA4335" />
      <path d="M12 40h24V20l-12 8-12-8v20z" fill="#FBBC04" opacity="0.0" />
    </svg>
  );
}

export function NotionIcon({ size = 28 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="6" y="6" width="36" height="36" rx="4" fill="#fff" />
      <path
        d="M14 14h6l10 13V14h4v20h-6L18 21v13h-4V14z"
        fill="#000"
      />
    </svg>
  );
}

export function SlackIcon({ size = 28 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="20" y="6" width="8" height="20" rx="4" fill="#36C5F0" />
      <rect x="20" y="22" width="8" height="20" rx="4" fill="#2EB67D" />
      <rect x="6" y="20" width="20" height="8" rx="4" fill="#ECB22E" />
      <rect x="22" y="20" width="20" height="8" rx="4" fill="#E01E5A" />
    </svg>
  );
}

export function GithubIcon({ size = 28 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-1.97c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.9-.39 2.88-.39s1.96.13 2.88.39c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.07.78 2.16v3.2c0 .31.21.68.8.56 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function TwilioIcon({ size = 28 }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" fill="#F22F46" />
      <circle cx="17" cy="17" r="3.5" fill="#fff" />
      <circle cx="31" cy="17" r="3.5" fill="#fff" />
      <circle cx="17" cy="31" r="3.5" fill="#fff" />
      <circle cx="31" cy="31" r="3.5" fill="#fff" />
    </svg>
  );
}
