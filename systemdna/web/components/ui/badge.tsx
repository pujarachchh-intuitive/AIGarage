import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Hairline, compact, mono. Colour only for state.
export const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-1.5 py-0 font-mono text-[10.5px] leading-4 font-medium tracking-[0.02em] whitespace-nowrap transition-[background-color,color,border-color] duration-150 ease-out [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-brand text-brand-ink border-transparent",
        outline: "border-border text-text-secondary bg-transparent",
        success: "bg-success-soft text-success border-success/25",
        warning: "bg-warning-soft text-warning border-warning/25",
        destructive: "bg-error-soft text-error border-error/25",
        info: "bg-info-soft text-info border-info/25",
        neutral: "bg-surface-secondary text-text-secondary border-border",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
