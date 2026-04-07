import { cn } from "@/lib/utils";

function IconWrap({ size = 14, strokeWidth = 2, className, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props) {
  return (
    <IconWrap {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </IconWrap>
  );
}

export function SearchEmptyIcon(props) {
  return (
    <IconWrap {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </IconWrap>
  );
}

export function CloseIcon(props) {
  return (
    <IconWrap {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </IconWrap>
  );
}

export function MailIcon(props) {
  return (
    <IconWrap {...props}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </IconWrap>
  );
}

export function ChevronRightIcon({ className, ...props }) {
  return (
    <IconWrap className={cn(className)} {...props}>
      <polyline points="9 18 15 12 9 6" />
    </IconWrap>
  );
}

export function SparkleIcon(props) {
  return (
    <IconWrap {...props}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </IconWrap>
  );
}

export function BackArrowIcon(props) {
  return (
    <IconWrap {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </IconWrap>
  );
}
