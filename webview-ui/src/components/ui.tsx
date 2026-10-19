import { useState, type ReactNode } from 'react';
import type { SupportedLanguage } from '../types';

export function cn(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ');
}

/** Collapsible section — the primary layout unit in a narrow sidebar. */
export function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="lane-label flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-raised"
      >
        <span aria-hidden className="w-2 text-[9px]">
          {open ? '▼' : '▶'}
        </span>
        <span className="flex-1">{title}</span>
        {count !== undefined && <span className="chip">{count}</span>}
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </section>
  );
}

export function Chip({
  children,
  color,
  title,
}: {
  children: ReactNode;
  color?: string;
  title?: string;
}) {
  return (
    <span className="chip chip-lane" style={color ? { borderLeftColor: color } : undefined} title={title}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded border border-border">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-2 py-1 text-[11px] transition-colors',
            value === option.value
              ? 'bg-[var(--vscode-button-background,#0e639c)] font-medium text-[var(--vscode-button-foreground,#ffffff)]'
              : 'bg-surface text-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const LANG_LABEL: Record<SupportedLanguage, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'PY',
  rust: 'RS',
};

const LANG_CLASS: Record<SupportedLanguage, string> = {
  javascript: 'border-lang-js/60 text-lang-js',
  typescript: 'border-lang-js/60 text-lang-js',
  python: 'border-lang-py/60 text-lang-py',
  rust: 'border-lang-rs/60 text-lang-rs',
};

/** Language accent, always paired with a text label — never colour alone. */
export function LangBadge({ language }: { language: SupportedLanguage }) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide',
        LANG_CLASS[language],
      )}
    >
      {LANG_LABEL[language]}
    </span>
  );
}

export function Notice({ tone, children }: { tone: 'info' | 'warn' | 'err'; children: ReactNode }) {
  const toneClass = {
    info: 'border-accent/40 text-accent',
    warn: 'border-warn/40 text-warn',
    err: 'border-err/40 text-err',
  }[tone];
  return (
    <div className={cn('m-2 rounded border bg-raised px-2 py-1.5 text-[11px]', toneClass)}>
      {children}
    </div>
  );
}
