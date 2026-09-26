"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// Hairline toasts; state colour only on the icon.
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
            "group !rounded-xl !border !border-border !bg-surface/95 !text-text-primary !shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)] !backdrop-blur-md !px-4 !py-3",
          title: "!text-sm !font-semibold !leading-tight",
          description: "!text-xs !font-medium !text-text-tertiary",
          closeButton: "!border-border !bg-surface !text-text-tertiary hover:!text-text-primary",
          success: "!border-border [&_[data-icon]]:!text-success",
          error: "!border-border",
          warning: "!border-border",
          info: "!border-border",
          icon: "!text-text-tertiary",
        },
      }}
      {...props}
    />
  );
}
