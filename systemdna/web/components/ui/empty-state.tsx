import type { ComponentType, ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 gap-3">
      <div className="relative size-12 rounded-xl border border-border bg-surface-secondary flex items-center justify-center text-icon-secondary select-none">
        <Icon className="size-5" />
        <span aria-hidden className="absolute -top-px -right-px size-2 rounded-full bg-brand ring-2 ring-surface" />
      </div>
      <h2 className="type-heading mt-2">{title}</h2>
      <p className="type-subtitle font-normal max-w-sm">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
