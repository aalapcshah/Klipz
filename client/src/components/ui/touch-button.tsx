import * as React from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button";

/**
 * Mobile-optimized button with minimum 44px touch target
 * Follows iOS and Android accessibility guidelines
 */
export const TouchButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }
>(
  ({ className, size = "default", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size={size}
        className={cn(
          // Minimum touch target size
          "min-h-[44px] min-w-[44px]",
          // Add padding for better touch area
          "touch-manipulation",
          // Prevent text selection on double tap
          "select-none",
          className
        )}
        {...props}
      />
    );
  }
);

TouchButton.displayName = "TouchButton";
