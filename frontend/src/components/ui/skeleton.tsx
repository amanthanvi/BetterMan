import * as React from "react"
import { cn } from "@/lib/utils"

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular" | "rounded"
  animation?: "pulse" | "wave" | "none"
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "text", animation = "pulse", ...props }, ref) => {
    const variantStyles = {
      text: "rounded",
      circular: "rounded-full",
      rectangular: "rounded-none",
      rounded: "rounded-md",
    }

    const animationStyles = {
      pulse: "animate-pulse",
      wave: "animate-shimmer",
      none: "",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "bg-gray-200 dark:bg-gray-700",
          variantStyles[variant],
          animationStyles[animation],
          className
        )}
        {...props}
      />
    )
  }
)
Skeleton.displayName = "Skeleton"

export { Skeleton }