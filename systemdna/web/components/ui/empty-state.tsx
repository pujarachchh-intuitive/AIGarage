import type { ComponentType, ReactNode } from "react";

// Empty / coming-soon block from DESIGN.md section 8.
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
      <div
        className="size-16 rounded-2xl flex items-center justify-center text-white select-none"
        style={{ background: "linear-gradient(to top, #18181B, #71717A)" }}
      >
        <Icon className="size-8" />
      </div>
      <h2 className="type-heading mt-2">{title}</h2>
      <p className="type-subtitle max-w-sm">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
