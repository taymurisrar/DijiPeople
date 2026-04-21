import * as React from "react";

type FieldTriggerButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string;
  baseInputClassName: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function FieldTriggerButton({
  baseInputClassName,
  className,
  disabled,
  children,
  ...props
}: FieldTriggerButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        baseInputClassName,
        "flex items-center justify-between gap-3 text-left",
        !disabled && "cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}