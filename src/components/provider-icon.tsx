import { useId } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  linear: "Linear",
  jira: "Jira",
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
  slack: "Slack",
  obsidian: "Obsidian",
  figma: "Figma",
  fake: "Fake provider",
  native: "Native",
};

function LinearMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"
      />
    </svg>
  );
}

function JiraMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"
      />
    </svg>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      />
    </svg>
  );
}

function NativeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" strokeLinejoin="round" />
      <path d="M12 12v9M12 12 4 7.5M12 12l8-4.5" strokeLinecap="round" />
    </svg>
  );
}

function GitLabMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 0 0-.867 0L16.418 9.45H7.582L4.919 1.263a.455.455 0 0 0-.867 0L1.388 9.452.045 13.587a.924.924 0 0 0 .331 1.023L12 23.054l11.624-8.443a.92.92 0 0 0 .331-1.024"
      />
    </svg>
  );
}

function GiteaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.209 4.603c-.247 0-.525.02-.84.088-.333.07-1.28.283-2.054 1.027C-.403 7.25.035 9.685.089 10.052c.065.446.263 1.687 1.21 2.768 1.749 2.141 5.513 2.092 5.513 2.092s.462 1.103 1.168 2.119c.955 1.263 1.936 2.248 2.89 2.367 2.406 0 7.212-.004 7.212-.004s.458.004 1.08-.394c.535-.324 1.013-.893 1.013-.893s.492-.527 1.18-1.73c.21-.37.385-.729.538-1.068 0 0 2.107-4.471 2.107-8.823-.042-1.318-.367-1.55-.443-1.627-.156-.156-.366-.153-.366-.153s-4.475.252-6.792.306c-.508.011-1.012.023-1.512.027v4.474l-.634-.301c0-1.39-.004-4.17-.004-4.17-1.107.016-3.405-.084-3.405-.084s-5.399-.27-5.987-.324c-.187-.011-.401-.032-.648-.032zm.354 1.832h.111s.271 2.269.6 3.597C5.549 11.147 6.22 13 6.22 13s-.996-.119-1.641-.348c-.99-.324-1.409-.714-1.409-.714s-.73-.511-1.096-1.52C1.444 8.73 2.021 7.7 2.021 7.7s.32-.859 1.47-1.145c.395-.106.863-.12 1.072-.12zm8.33 2.554c.26.003.509.127.509.127l.868.422-.529 1.075a.686.686 0 0 0-.614.359.685.685 0 0 0 .072.756l-.939 1.924a.69.69 0 0 0-.66.527.687.687 0 0 0 .347.763.686.686 0 0 0 .867-.206.688.688 0 0 0-.069-.882l.916-1.874a.667.667 0 0 0 .237-.02.657.657 0 0 0 .271-.137 8.826 8.826 0 0 1 1.016.512.761.761 0 0 1 .286.282c.073.21-.073.569-.073.569-.087.29-.702 1.55-.702 1.55a.692.692 0 0 0-.676.477.681.681 0 1 0 1.157-.252c.073-.141.141-.282.214-.431.19-.397.515-1.16.515-1.16.035-.066.218-.394.103-.814-.095-.435-.48-.638-.48-.638-.467-.301-1.116-.58-1.116-.58s0-.156-.042-.27a.688.688 0 0 0-.148-.241l.516-1.062 2.89 1.401s.48.218.583.619c.073.282-.019.534-.069.657-.24.587-2.1 4.317-2.1 4.317s-.232.554-.748.588a1.065 1.065 0 0 1-.393-.045l-.202-.08-4.31-2.1s-.417-.218-.49-.596c-.083-.31.104-.691.104-.691l2.073-4.272s.183-.37.466-.497a.855.855 0 0 1 .35-.077z"
      />
    </svg>
  );
}

function FakeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M15 10h.01M9.5 15c.8.8 1.7 1.2 2.5 1.2s1.7-.4 2.5-1.2" strokeLinecap="round" />
    </svg>
  );
}

function SlackMark({ className }: { className?: string }) {
  // Official Slack four-color mark (not a single currentColor wash).
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#2EB67D"
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.268 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.83 24a2.528 2.528 0 0 1-2.52-2.522v-6.313z"
      />
      <path
        fill="#36C5F0"
        d="M8.83 5.042a2.528 2.528 0 0 1-2.52-2.52A2.528 2.528 0 0 1 8.83 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.83zm0 1.268a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.83a2.528 2.528 0 0 1 2.522-2.52H8.83z"
      />
      <path
        fill="#ECB22E"
        d="M18.958 8.831a2.528 2.528 0 0 1 2.521-2.521A2.528 2.528 0 0 1 24 8.83a2.528 2.528 0 0 1-2.521 2.521h-2.521V8.83zm-1.268 0a2.528 2.528 0 0 1-2.522 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.168 0a2.528 2.528 0 0 1 2.521 2.522v6.311z"
      />
      <path
        fill="#E01E5A"
        d="M15.168 18.958a2.528 2.528 0 0 1 2.521 2.521A2.528 2.528 0 0 1 15.168 24a2.527 2.527 0 0 1-2.52-2.521v-2.521h2.52zm0-1.269a2.527 2.527 0 0 1-2.52-2.52 2.527 2.527 0 0 1 2.52-2.521h6.313A2.527 2.527 0 0 1 24 15.168a2.528 2.528 0 0 1-2.521 2.521H15.168z"
      />
    </svg>
  );
}

function ObsidianMark({ className }: { className?: string }) {
  // Official 2023 Obsidian rock mark with brand gradients (obsidian.md).
  const uid = useId().replace(/:/g, "");
  const g = (name: string) => `${uid}-${name}`;
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={g("bl")} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-59 -225 150 -39 161.4 470)">
          <stop offset="0" stopColor="#fff" stopOpacity={0.4} />
          <stop offset="1" stopOpacity={0.1} />
        </radialGradient>
        <radialGradient id={g("tr")} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(50 -379 280 37 360 374.2)">
          <stop offset="0" stopColor="#fff" stopOpacity={0.6} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.1} />
        </radialGradient>
        <radialGradient id={g("tl")} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(69 -319 218 47 175.4 307)">
          <stop offset="0" stopColor="#fff" stopOpacity={0.8} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.4} />
        </radialGradient>
        <radialGradient id={g("br")} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-96 -163 187 -111 335.3 512.2)">
          <stop offset="0" stopColor="#fff" stopOpacity={0.3} />
          <stop offset="1" stopOpacity={0.3} />
        </radialGradient>
        <radialGradient id={g("te")} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-36 166 -112 -24 310 128.2)">
          <stop offset="0" stopColor="#fff" stopOpacity={0} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.2} />
        </radialGradient>
        <radialGradient id={g("le")} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(88 89 -190 187 111 220.2)">
          <stop offset="0" stopColor="#fff" stopOpacity={0.2} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.4} />
        </radialGradient>
        <radialGradient id={g("be")} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(9 130 -276 20 215 284)">
          <stop offset="0" stopColor="#fff" stopOpacity={0.2} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.3} />
        </radialGradient>
        <radialGradient id={g("me")} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-198 -104 327 -623 400 399.2)">
          <stop offset="0" stopColor="#fff" stopOpacity={0.2} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.2} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.3} />
        </radialGradient>
      </defs>
      <path
        fill="#6C31E3"
        d="M382.3 475.6c-3.1 23.4-26 41.6-48.7 35.3-32.4-8.9-69.9-22.8-103.6-25.4l-51.7-4a34 34 0 0 1-22-10.2l-89-91.7a34 34 0 0 1-6.7-37.7s55-121 57.1-127.3c2-6.3 9.6-61.2 14-90.6 1.2-7.9 5-15 11-20.3L248 8.9a34.1 34.1 0 0 1 49.6 4.3L386 125.6a37 37 0 0 1 7.6 22.4c0 21.3 1.8 65 13.6 93.2 11.5 27.3 32.5 57 43.5 71.5a17.3 17.3 0 0 1 1.3 19.2 1494 1494 0 0 1-44.8 70.6c-15 22.3-21.9 49.9-25 73.1z"
      />
      <path
        fill={`url(#${g("bl")})`}
        d="M165.9 478.3c41.4-84 40.2-144.2 22.6-187-16.2-39.6-46.3-64.5-70-80-.6 2.3-1.3 4.4-2.2 6.5L60.6 342a34 34 0 0 0 6.6 37.7l89.1 91.7a34 34 0 0 0 9.6 7z"
      />
      <path
        fill={`url(#${g("tr")})`}
        d="M278.4 307.8c11.2 1.2 22.2 3.6 32.8 7.6 34 12.7 65 41.2 90.5 96.3 1.8-3.1 3.6-6.2 5.6-9.2a1536 1536 0 0 0 44.8-70.6 17 17 0 0 0-1.3-19.2c-11-14.6-32-44.2-43.5-71.5-11.8-28.2-13.5-72-13.6-93.2 0-8.1-2.6-16-7.6-22.4L297.6 13.2a34 34 0 0 0-1.5-1.7 96 96 0 0 1 2 54 198.3 198.3 0 0 1-17.6 41.3l-7.2 14.2a171 171 0 0 0-19.4 71c-1.2 29.4 4.8 66.4 24.5 115.8z"
      />
      <path
        fill={`url(#${g("tl")})`}
        d="M278.4 307.8c-19.7-49.4-25.8-86.4-24.5-115.9a171 171 0 0 1 19.4-71c2.3-4.8 4.8-9.5 7.2-14.1 7.1-13.9 14-27 17.6-41.4a96 96 0 0 0-2-54A34.1 34.1 0 0 0 248 9l-105.4 94.8a34.1 34.1 0 0 0-10.9 20.3l-12.8 85-.5 2.3c23.8 15.5 54 40.4 70.1 80a147 147 0 0 1 7.8 24.8c28-6.8 55.7-11 82.1-8.3z"
      />
      <path
        fill={`url(#${g("br")})`}
        d="M333.6 511c22.7 6.2 45.6-12 48.7-35.4a187 187 0 0 1 19.4-63.9c-25.6-55-56.5-83.6-90.4-96.3-36-13.4-75.2-9-115 .7 8.9 40.4 3.6 93.3-30.4 162.2 4 1.8 8.1 3 12.5 3.3 0 0 24.4 2 53.6 4.1 29 2 72.4 17.1 101.6 25.2z"
      />
      <path
        fill={`url(#${g("te")})`}
        d="M254.1 190c-1.3 29.2 2.4 62.8 22.1 112.1l-6.2-.5c-17.7-51.5-21.5-78-20.2-107.6a174.7 174.7 0 0 1 20.4-72c2.4-4.9 8-14.1 10.5-18.8 7.1-13.7 11.9-21 16-33.6 5.7-17.5 4.5-25.9 3.8-34.1 4.6 29.9-12.7 56-25.7 82.4a177.1 177.1 0 0 0-20.7 72z"
      />
      <path
        fill={`url(#${g("le")})`}
        d="M194.3 293.4c2.4 5.4 4.6 9.8 6 16.5L195 311c-2.1-7.8-3.8-13.4-6.8-20-17.8-42-46.3-63.6-69.7-79.5 28.2 15.2 57.2 39 75.7 81.9z"
      />
      <path
        fill={`url(#${g("be")})`}
        d="M200.6 315.1c9.8 46-1.2 104.2-33.6 160.9 27.1-56.2 40.2-110.1 29.3-160z"
      />
      <path
        fill={`url(#${g("me")})`}
        d="M312.5 311c53.1 19.9 73.6 63.6 88.9 100-19-38.1-45.2-80.3-90.8-96-34.8-11.8-64.1-10.4-114.3 1l-1.1-5c53.2-12.1 81-13.5 117.3 0z"
      />
    </svg>
  );
}

function FigmaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 38 57" className={className} aria-hidden="true">
      <path fill="#1ABCFE" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0Z" />
      <path fill="#0ACF83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0Z" />
      <path fill="#FF7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19Z" />
      <path fill="#F24E1E" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5Z" />
      <path fill="#A259FF" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5Z" />
    </svg>
  );
}

const tones: Record<string, string> = {
  linear: "bg-[#5E6AD2]/10 text-[#5E6AD2] ring-1 ring-[#5E6AD2]/25",
  jira: "bg-[#2684FF]/10 text-[#2684FF] ring-1 ring-[#2684FF]/25",
  github: "bg-white text-[#24292f] ring-1 ring-black/15 dark:bg-[#24292f] dark:text-white dark:ring-white/15",
  gitlab: "bg-[#FC6D26]/15 text-[#FC6D26] ring-1 ring-[#FC6D26]/35",
  gitea: "bg-[#609926]/15 text-[#609926] ring-1 ring-[#609926]/35",
  slack: "bg-white ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/15",
  obsidian: "bg-[#6C31E3]/20 ring-1 ring-[#6C31E3]/45 dark:bg-[#6C31E3]/30 dark:ring-[#A78BFA]/45",
  figma: "bg-[#1E1E1E] text-white ring-1 ring-black/20 dark:bg-[#2C2C2C] dark:ring-white/15",
  fake: "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30",
  native: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-400/30",
};

/** Solid accents for project tiles / rails — keyed by provider id. */
export const providerAccents: Record<
  string,
  { bar: string; wash: string; ink: string }
> = {
  linear: {
    bar: "bg-[#5E6AD2]",
    wash: "bg-[#5E6AD2]/12 dark:bg-[#5E6AD2]/20",
    ink: "text-[#5E6AD2] dark:text-[#9aa3ef]",
  },
  jira: {
    bar: "bg-[#2684FF]",
    wash: "bg-[#2684FF]/12 dark:bg-[#2684FF]/20",
    ink: "text-[#2684FF] dark:text-[#7eb6ff]",
  },
  github: {
    bar: "bg-[#24292f] dark:bg-[#c9d1d9]",
    wash: "bg-stone-500/10 dark:bg-white/8",
    ink: "text-[#24292f] dark:text-[#c9d1d9]",
  },
  gitlab: {
    bar: "bg-[#FC6D26]",
    wash: "bg-[#FC6D26]/12 dark:bg-[#FC6D26]/18",
    ink: "text-[#E24329] dark:text-[#fc9b66]",
  },
  gitea: {
    bar: "bg-[#609926]",
    wash: "bg-[#609926]/12 dark:bg-[#609926]/18",
    ink: "text-[#609926] dark:text-[#9ccc5a]",
  },
  slack: {
    bar: "bg-[#4A154B]",
    wash: "bg-[#4A154B]/10 dark:bg-[#4A154B]/25",
    ink: "text-[#4A154B] dark:text-[#d2a8d8]",
  },
  obsidian: {
    bar: "bg-[#6C31E3]",
    wash: "bg-[#6C31E3]/12 dark:bg-[#6C31E3]/20",
    ink: "text-[#6C31E3] dark:text-[#C4B5FD]",
  },
  figma: {
    bar: "bg-[#F24E1E]",
    wash: "bg-[#F24E1E]/12 dark:bg-[#F24E1E]/18",
    ink: "text-[#F24E1E] dark:text-[#ff8f6b]",
  },
  fake: {
    bar: "bg-amber-600",
    wash: "bg-amber-500/12 dark:bg-amber-500/18",
    ink: "text-amber-800 dark:text-amber-200",
  },
  native: {
    bar: "bg-emerald-600 dark:bg-emerald-400",
    wash: "bg-emerald-500/12 dark:bg-emerald-400/15",
    ink: "text-emerald-800 dark:text-emerald-200",
  },
};

export function providerKey(provider: string | null | undefined): string {
  if (provider && LABELS[provider]) return provider;
  return "native";
}

export function providerLabel(provider: string | null | undefined): string {
  if (provider && LABELS[provider]) return LABELS[provider];
  return LABELS.native ?? "Native";
}

function ProviderMark({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  if (provider === "linear") return <LinearMark className={className} />;
  if (provider === "jira") return <JiraMark className={className} />;
  if (provider === "github") return <GitHubMark className={className} />;
  if (provider === "gitlab") return <GitLabMark className={className} />;
  if (provider === "gitea") return <GiteaMark className={className} />;
  if (provider === "slack") return <SlackMark className={className} />;
  if (provider === "obsidian") return <ObsidianMark className={className} />;
  if (provider === "figma") return <FigmaMark className={className} />;
  if (provider === "fake") return <FakeMark className={className} />;
  return <NativeMark className={className} />;
}

export function ProviderIcon({
  provider,
  className,
  size = "sm",
}: {
  provider: string | null | undefined;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const key = providerKey(provider);
  const label = LABELS[key] ?? "Native";
  const shell = size === "lg" ? "size-12" : size === "md" ? "size-9" : "size-6";
  const iconClass = size === "lg" ? "size-6" : size === "md" ? "size-5" : "size-3.5";
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        shell,
        tones[key] ?? tones.native,
        className,
      )}
    >
      <ProviderMark provider={key} className={iconClass} />
    </span>
  );
}

export function OpenInProviderButton({
  provider,
  href,
  className,
  label,
}: {
  provider: string | null | undefined;
  href: string;
  className?: string;
  /** Overrides the default “Open in {provider}” text. */
  label?: string;
}) {
  const key = provider && LABELS[provider] ? provider : null;
  if (!key || key === "native") return null;
  const text = label ?? `Open in ${LABELS[key] ?? "provider"}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium text-foreground transition hover:bg-accent",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full",
          tones[key] ?? tones.native,
        )}
      >
        <ProviderMark provider={key} className="size-3" />
      </span>
      {text}
      <ExternalLink className="size-3 text-muted" aria-hidden="true" />
    </a>
  );
}
