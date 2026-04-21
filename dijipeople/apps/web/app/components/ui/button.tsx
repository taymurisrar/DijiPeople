import * as React from "react";
import Link, { LinkProps } from "next/link";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-soft"
  | "pill"
  | "card";

type ButtonSize = "sm" | "md" | "lg";

type CommonButtonProps = {
  children: React.ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

type NativeButtonProps = CommonButtonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "disabled" | "children"> & {
    href?: never;
  };

type AnchorButtonProps = CommonButtonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> &
  Pick<LinkProps, "href"> & {
    href: LinkProps["href"];
  };

export type ButtonProps = NativeButtonProps | AnchorButtonProps;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-strong disabled:opacity-70 disabled:cursor-not-allowed",
  secondary:
    "border border-border text-foreground hover:border-accent/30 hover:text-accent disabled:opacity-70 disabled:cursor-not-allowed",
  ghost:
    "text-foreground hover:bg-accent-soft/30 disabled:opacity-70 disabled:cursor-not-allowed",
  danger:
    "border border-danger/20 text-danger hover:bg-danger/5 disabled:opacity-70 disabled:cursor-not-allowed",
  "danger-soft":
    "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-70 disabled:cursor-not-allowed",
  pill:
    "rounded-full border border-border bg-white/80 text-foreground hover:border-accent/30 hover:bg-white disabled:opacity-70 disabled:cursor-not-allowed",
  card:
    "rounded-[22px] border border-border bg-white/90 text-left hover:border-accent/30 hover:bg-accent-soft/20 disabled:opacity-70 disabled:cursor-not-allowed",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-4 py-3 text-sm",
  lg: "px-5 py-3 text-sm",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

const cardSizeClass = "p-5";
const pillSizeClass = "px-3 py-2 text-sm";

export const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(function Button(props, ref) {
  const {
    children,
    className,
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    loadingText,
    disabled = false,
    leftIcon,
    rightIcon,
    ...rest
  } = props;

  const content = (
    <>
      {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
      <span>{loading ? (loadingText ?? children) : children}</span>
      {rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </>
  );

  const classes = cn(
    baseClasses,
    variantClasses[variant],
    variant === "card" ? cardSizeClass : variant === "pill" ? pillSizeClass : sizeClasses[size],
    fullWidth && "w-full",
    variant === "card" && "justify-start",
    className,
  );

  if ("href" in props && props.href) {
    const { href, ...linkRest } = rest as Omit<AnchorButtonProps, keyof CommonButtonProps>;
    const isDisabled = disabled || loading;

    if (isDisabled) {
      return (
        <span
          className={cn(classes, "pointer-events-none inline-flex")}
          aria-disabled="true"
        >
          {content}
        </span>
      );
    }

    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={classes}
        {...linkRest}
      >
        {content}
      </Link>
    );
  }

  const buttonRest = rest as Omit<NativeButtonProps, keyof CommonButtonProps>;

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={classes}
      disabled={disabled || loading}
      {...buttonRest}
    >
      {content}
    </button>
  );
});