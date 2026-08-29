"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { LogoutButton } from "../logout-button";
import { UserAvatar } from "./user-avatar";

type UserMenuDropdownProps = {
  avatarCacheKey?: string | null;
  avatarSrc?: string | null;
  email: string;
  firstName: string;
  lastName: string;
  profileHref: string;
  roleLabel: string;

  /**
   * Server-rendered workspace navigation.
   *
   * The dropdown deliberately receives this as a slot instead of fetching
   * workspace data itself. The account menu must remain immediately usable
   * even if workspace discovery is slow or unavailable.
   *
   * WorkspaceSwitcher owns its separator because this component cannot know
   * whether a Suspense-backed ReactNode eventually resolves to content or null.
   */
  workspaceSection?: ReactNode;
};

export function UserMenuDropdown({
  avatarCacheKey,
  avatarSrc,
  email,
  firstName,
  lastName,
  profileHref,
  roleLabel,
  workspaceSection,
}: UserMenuDropdownProps) {
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const menuId = useId();

  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || "User";

  /*
   * Close the menu after navigation.
   *
   * This also covers navigation initiated by menu content such as My Profile
   * without requiring every possible future menu item to manage the dropdown.
   */
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsOpen(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pathname]);

  /*
   * Global interaction handlers only exist while the menu is open.
   *
   * pointerdown works for mouse, pen and touch, unlike mousedown.
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        !containerRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();

      setIsOpen(false);

      /*
       * Returning focus to the trigger makes keyboard dismissal predictable
       * and prevents focus from becoming effectively lost behind the popover.
       */
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function toggleMenu() {
    setIsOpen((current) => !current);
  }

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={
          isOpen
            ? `Close account menu for ${fullName}`
            : `Open account menu for ${fullName}`
        }
        className="
          group
          flex min-h-11 items-center gap-2.5
          rounded-full
          border border-border/80
          bg-background/90
          px-2 py-1.5
          text-left
          shadow-sm
          outline-none
          transition
          hover:border-accent/30
          hover:bg-surface
          hover:shadow
          focus-visible:ring-2
          focus-visible:ring-accent
          focus-visible:ring-offset-2
          focus-visible:ring-offset-background
          sm:pl-2
          sm:pr-3
        "
        onClick={toggleMenu}
      >
        <UserAvatar
          cacheKey={avatarCacheKey}
          firstName={firstName}
          imageSrc={avatarSrc}
          lastName={lastName}
          size="xs"
        />

        <span className="hidden min-w-0 max-w-40 sm:block">
          <span className="block truncate text-xs font-semibold leading-5 text-foreground">
            {fullName}
          </span>
        </span>

        <ChevronDownIcon isOpen={isOpen} />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          aria-label="Account menu"
          className="
            absolute right-0 top-full z-50
            mt-2.5
            w-[340px]
            max-w-[calc(100vw-24px)]
            overflow-hidden
            rounded-[20px]
            border border-border/80
            bg-background
            p-2
            shadow-xl
          "
        >
          <AccountIdentity
            avatarCacheKey={avatarCacheKey}
            avatarSrc={avatarSrc}
            email={email}
            firstName={firstName}
            fullName={fullName}
            lastName={lastName}
            roleLabel={roleLabel}
          />

          {workspaceSection}

          <div className="mt-3 border-t border-border pt-2">
            <Link
              href={profileHref}
              onClick={closeMenu}
              className="
                group/item
                flex min-h-11 w-full
                items-center gap-3
                rounded-xl
                px-3 py-2.5
                text-sm font-medium
                text-foreground
                outline-none
                transition-colors
                hover:bg-surface
                hover:text-accent
                focus-visible:bg-surface
                focus-visible:ring-2
                focus-visible:ring-accent
              "
            >
              <ProfileIcon />

              <span className="min-w-0 flex-1">
                My Profile
              </span>

              <ChevronRightIcon />
            </Link>

            <LogoutButton
              className="
    group
    min-h-11
    w-full
    justify-start
    rounded-xl
    px-3 py-2.5
    text-sm font-medium
    text-foreground
    transition-colors
    hover:bg-surface
    hover:text-accent
  "
              label="Logout"
              onLoggedOut={closeMenu}
              variant="menu"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type AccountIdentityProps = {
  avatarCacheKey?: string | null;
  avatarSrc?: string | null;
  email: string;
  firstName: string;
  fullName: string;
  lastName: string;
  roleLabel: string;
};

function AccountIdentity({
  avatarCacheKey,
  avatarSrc,
  email,
  firstName,
  fullName,
  lastName,
  roleLabel,
}: AccountIdentityProps) {
  return (
    <div
      className="
        flex min-w-0 items-center gap-3
        rounded-[14px]
        bg-surface
        px-3 py-3
      "
    >
      <div className="shrink-0">
        <UserAvatar
          cacheKey={avatarCacheKey}
          firstName={firstName}
          imageSrc={avatarSrc}
          lastName={lastName}
          size="md"
        />
      </div>

      <div className="min-w-0 flex-1">
        <p
          className="
            truncate
            text-sm font-semibold
            leading-5
            text-foreground
          "
          title={fullName}
        >
          {fullName}
        </p>

        <p
          className="
            mt-0.5
            truncate
            text-xs
            leading-5
            text-muted
          "
          title={email}
        >
          {email}
        </p>

        {roleLabel ? (
          <p
            className="
              mt-1.5
              truncate
              text-[10px] font-semibold
              uppercase
              leading-4
              tracking-[0.14em]
              text-muted
            "
            title={roleLabel}
          >
            {roleLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ChevronDownIcon({
  isOpen,
}: {
  isOpen: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`
        hidden h-4 w-4 shrink-0
        text-muted
        transition-transform duration-200
        group-hover:text-foreground
        sm:block
        ${isOpen ? "rotate-180" : ""}
      `}
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="m6.5 8 3.5 3.5L13.5 8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="
        h-4 w-4 shrink-0
        text-muted
        transition-transform
        group-hover/item:translate-x-0.5
        group-hover/item:text-foreground
      "
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        d="m8 5 5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <span
      aria-hidden="true"
      className="
        flex h-8 w-8 shrink-0
        items-center justify-center
        rounded-lg
        border border-border
        bg-background
        text-muted
        transition-colors
        group-hover/item:border-accent/20
        group-hover/item:text-accent
      "
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 20 20"
      >
        <circle
          cx="10"
          cy="7"
          r="3"
          stroke="currentColor"
          strokeWidth="1.5"
        />

        <path
          d="M4.5 16c.65-2.6 2.5-4 5.5-4s4.85 1.4 5.5 4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  );
}