import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Same variants and classes as the HRMS badge.
export const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap transition-[background-color,color,border-color] duration-150 ease-out [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-transparent",
        outline: "border-border text-foreground bg-surface",
        success: "bg-emerald-50 text-emerald-700 border-emerald-200/50",
        warning: "bg-amber-50 text-amber-700 border-amber-200/50",
        destructive: "bg-red-50 text-red-700 border-red-200/50",
        info: "bg-sky-50 text-sky-700 border-sky-200/50",
        neutral: "bg-zinc-50 text-zinc-500 border-zinc-200",
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
