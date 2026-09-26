"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// Same toast styling as HRMS: neutral borders for every type.
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-right"
      visibleToasts={3}
      gap={10}
      offset={20}
      closeButton
      toastOptions={{
        duration: 3200,
        classNames: {
          toast:
            "group !rounded-xl !border !border-border !bg-surface/95 !text-text-primary !shadow-lg !backdrop-blur-md !px-4 !py-3",
          title: "!text-sm !font-semibold !leading-tight",
          description: "!text-xs !font-medium !text-zinc-500",
          closeButton: "!border-border !bg-surface !text-zinc-400 hover:!text-zinc-700",
          success: "!border-border",
          error: "!border-border",
          warning: "!border-border",
          info: "!border-border",
          icon: "!text-zinc-500",
        },
      }}
      {...props}
    />
  );
}
