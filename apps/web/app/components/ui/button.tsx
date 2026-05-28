import * as React from "react";
import Link, { LinkProps } from "next/link";
import { Loader2 } from "lucide-react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "soft"
  | "success"
  | "success-soft"
  | "warning"
  | "warning-soft"
  | "danger"
  | "danger-soft"
  | "link"
  | "pill"
  | "card";

type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl" | "icon-xs" | "icon-sm" | "icon-md" | "icon-lg";

type CommonButtonProps = {
  children?: React.ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  "aria-label"?: string;
};

type NativeButtonProps = CommonButtonProps &
  Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "disabled" | "children"
  > & {
    href?: never;
  };

type AnchorButtonProps = CommonButtonProps &
  Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    "children" | "href"
  > &
  Pick<LinkProps, "href"> & {
    href: LinkProps["href"];
  };

export type ButtonProps = NativeButtonProps | AnchorButtonProps;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white shadow-sm hover:bg-accent-strong disabled:opacity-70 disabled:cursor-not-allowed",

  secondary:
    "border border-border bg-white text-foreground shadow-sm hover:border-accent/30 hover:bg-accent-soft/20 hover:text-accent disabled:opacity-70 disabled:cursor-not-allowed",

  outline:
    "border border-border bg-transparent text-foreground hover:border-accent/40 hover:bg-accent-soft/20 hover:text-accent disabled:opacity-70 disabled:cursor-not-allowed",

  ghost:
    "bg-transparent text-foreground hover:bg-accent-soft/30 hover:text-accent disabled:opacity-70 disabled:cursor-not-allowed",

  soft:
    "bg-accent-soft text-accent hover:bg-accent-soft/80 disabled:opacity-70 disabled:cursor-not-allowed",

  success:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-not-allowed",

  "success-soft":
    "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-70 disabled:cursor-not-allowed",

  warning:
    "bg-amber-500 text-white shadow-sm hover:bg-amber-600 disabled:opacity-70 disabled:cursor-not-allowed",

  "warning-soft":
    "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-70 disabled:cursor-not-allowed",

  danger:
    "border border-danger/20 bg-white text-danger shadow-sm hover:bg-danger/5 disabled:opacity-70 disabled:cursor-not-allowed",

  "danger-soft":
    "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-70 disabled:cursor-not-allowed",

  link:
    "h-auto rounded-none bg-transparent px-0 text-accent hover:text-accent-strong hover:underline disabled:opacity-70 disabled:cursor-not-allowed",

  pill:
    "rounded-full border border-border bg-white/80 text-foreground shadow-sm hover:border-accent/30 hover:bg-white hover:text-accent disabled:opacity-70 disabled:cursor-not-allowed",

  card:
    "rounded-[22px] border border-border bg-white/90 text-left shadow-sm hover:border-accent/30 hover:bg-accent-soft/20 disabled:opacity-70 disabled:cursor-not-allowed",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-9 px-3 text-xs",
  sm: "h-11 px-4 text-sm",
  md: "h-12 px-4 text-sm",
  lg: "h-[52px] px-5 text-sm",
  xl: "h-14 px-6 text-base",

  "icon-xs": "h-8 w-8 p-0",
  "icon-sm": "h-9 w-9 p-0",
  "icon-md": "h-10 w-10 p-0",
  "icon-lg": "h-12 w-12 p-0",
};

const baseClasses =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-semibold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:pointer-events-none";

const cardSizeClass = "min-h-[96px] p-5";
const pillSizeClass = "h-10 px-4 text-sm";

const iconOnlySizes = new Set<ButtonSize>([
  "icon-xs",
  "icon-sm",
  "icon-md",
  "icon-lg",
]);

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
    "aria-label": ariaLabel,
    ...rest
  } = props;

  const isDisabled = disabled || loading;
const isIconOnly = iconOnlySizes.has(size) || (!children && Boolean(leftIcon || rightIcon));
    const content = (
    <>
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : leftIcon ? (
        <span className="inline-flex shrink-0 items-center justify-center">
          {leftIcon}
        </span>
      ) : null}

      {children ? (
        <span className="inline-flex min-w-0 items-center leading-none">
          {loading ? (loadingText ?? children) : children}
        </span>
      ) : null}

      {!loading && rightIcon ? (
        <span className="inline-flex shrink-0 items-center justify-center">
          {rightIcon}
        </span>
      ) : null}
    </>
  );

  const classes = cn(
    baseClasses,
    variantClasses[variant],

    variant === "card"
      ? cardSizeClass
      : variant === "pill"
        ? pillSizeClass
        : variant === "link"
          ? ""
          : sizeClasses[size],

    fullWidth && "w-full",

    variant === "card" && "items-start justify-start whitespace-normal leading-normal",

    isIconOnly && "aspect-square gap-0",

    className,
  );

  if ("href" in props && props.href) {
    const linkRest = rest as Omit<
      AnchorButtonProps,
      keyof CommonButtonProps | "href"
    >;

    if (isDisabled) {
      return (
        <span
          className={cn(classes, "pointer-events-none opacity-70")}
          aria-disabled="true"
          aria-label={ariaLabel}
        >
          {content}
        </span>
      );
    }

    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={props.href}
        className={classes}
        aria-label={ariaLabel}
        {...linkRest}
      >
        {content}
      </Link>
    );
  }

  const buttonRest = rest as Omit<
    NativeButtonProps,
    keyof CommonButtonProps
  >;

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={classes}
      disabled={isDisabled}
      type={buttonRest.type ?? "button"}
      aria-label={ariaLabel}
      {...buttonRest}
    >
      {content}
    </button>
  );
});

Button.displayName = "Button";