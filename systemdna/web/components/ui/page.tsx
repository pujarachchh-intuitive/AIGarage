import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Page shell and header from DESIGN.md sections 13 and 14.

export function PageShell({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "w-full min-h-full border border-border rounded-2xl p-8 bg-surface flex flex-col gap-8",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col text-left min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="type-title truncate">{title}</h1>
          {meta}
        </div>
        {subtitle ? <p className="text-body text-text-tertiary mt-1">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-3 shrink-0">{actions}</div> : null}
    </div>
  );
}

export const primaryButton =
  "cursor-pointer inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-body bg-brand text-brand-ink font-semibold shadow-[inset_0_-1px_0_rgb(0_0_0/0.14),0_1px_2px_rgb(0_0_0/0.08)] hover:-translate-y-px hover:shadow-[inset_0_-1px_0_rgb(0_0_0/0.14),0_8px_18px_-10px_rgb(0_0_0/0.4)] active:translate-y-0 active:scale-[0.98] transition-[transform,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40 disabled:pointer-events-none [&>svg]:size-4";

export const secondaryButton =
  "cursor-pointer inline-flex items-center gap-2 h-9 px-3 border border-border rounded-lg bg-surface hover:bg-surface-hover hover:border-border-strong text-body font-medium text-text-primary active:scale-[0.98] transition-[transform,background-color,border-color] duration-150 ease-out disabled:opacity-40 disabled:pointer-events-none [&>svg]:size-4 [&>svg]:text-icon-secondary";

export const inputClass =
  "h-10 w-full px-3 border border-border rounded-lg bg-surface text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand-soft transition-[border-color,box-shadow] duration-150";

export function PrimaryLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn(primaryButton, className)} {...props} />;
}

export function SecondaryLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn(secondaryButton, className)} {...props} />;
}

/** Nested card used for charts, lists and panels inside the page shell. */
export function Card({
  title,
  subtitle,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("border border-border rounded-xl bg-surface flex flex-col min-w-0", className)}>
      {title ? (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="flex flex-col min-w-0">
            <h2 className="text-[13px] leading-5 font-semibold tracking-[-0.005em] text-text-primary truncate">{title}</h2>
            {subtitle ? <p className="type-caption mt-0.5">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("px-5 pb-5 min-h-0", !title && "pt-5", bodyClassName)}>{children}</div>
    </section>
  );
}
