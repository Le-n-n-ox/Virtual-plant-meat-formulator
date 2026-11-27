"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";
import { useMotion } from "@/lib/motion";
import { getTheme } from "@/lib/themes";
import { cn } from "@/lib/utils";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  // Sonner only knows light/dark; map the six named themes to their mode.
  const mode: ToasterProps["theme"] = getTheme(resolvedTheme).mode;
  const motionTokens = useMotion();

  return (
    <Sonner
      theme={mode}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        /*
         * The one animation here allowed to repeat: it marks a request that is
         * still in flight, which is a live indicator rather than a decoration.
         * It still stops when less motion is asked for, and the toast's text
         * says the same thing on its own.
         */
        loading: (
          <Loader2Icon
            className={cn("size-4", !motionTokens.reduced && "animate-spin")}
          />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
        /*
         * Sonner times its own entry at 400ms in its stylesheet and already
         * drops it for `prefers-reduced-motion`. Overriding the duration
         * inline puts the toast on the shared entrance token and, just as
         * importantly, lets the preferences store's "Reduce" setting zero it
         * when the OS has not been told to reduce motion.
         */
        style: { ...motionTokens.enterStyle },
      }}
      {...props}
    />
  );
};

export { Toaster };
