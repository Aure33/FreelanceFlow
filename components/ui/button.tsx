import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Bouton — structure shadcn (Slot + cva), variants mappés sur les tokens du design
// system (reproduit `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-sm` / `.btn-icon`
// de la maquette). Les icônes enfants sont calibrées à 17px comme dans les maquettes.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-[17px] [&_svg]:w-[17px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-line bg-surface text-ink hover:bg-surface-2",
        primary:
          "border border-accent bg-accent text-on-accent shadow-sm hover:border-accent-hover hover:bg-accent-hover",
        ghost: "border border-transparent hover:bg-surface-2",
      },
      size: {
        default: "h-10 rounded-md px-4 text-sm",
        sm: "h-8 rounded-sm px-[11px] text-[13px]",
        icon: "h-10 w-10 rounded-md p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
