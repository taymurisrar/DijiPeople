"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
};

export function UserMenuDropdown({
  avatarCacheKey,
  avatarSrc,
  email,
  firstName,
  lastName,
  profileHref,
  roleLabel,
}: UserMenuDropdownProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        className="flex items-center gap-3 rounded-full border border-border bg-white/80 px-3 py-2 text-left transition hover:border-accent/30 hover:bg-white"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <UserAvatar
          cacheKey={avatarCacheKey}
          firstName={firstName}
          imageSrc={avatarSrc}
          lastName={lastName}
          size="sm"
        />
        <div className="hidden min-w-0 sm:block">
          <div className="truncate text-sm font-semibold text-foreground">
            {firstName} {lastName}
          </div>
          <div className="truncate text-xs text-muted">{roleLabel}</div>
        </div>
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-30 mt-3 w-72 rounded-[24px] border border-border bg-white p-3 shadow-xl">
          <div className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3">
            <UserAvatar
              cacheKey={avatarCacheKey}
              firstName={firstName}
              imageSrc={avatarSrc}
              lastName={lastName}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {firstName} {lastName}
              </p>
              <p className="truncate text-sm text-muted">{email}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                {roleLabel}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-1">
            <Link
              className="rounded-2xl px-4 py-3 text-sm font-medium text-foreground transition hover:bg-surface hover:text-accent"
              href={profileHref}
            >
              My Profile
            </Link>
            <LogoutButton
              className="w-full justify-start rounded-2xl px-4 py-3 text-sm font-medium text-foreground transition hover:bg-surface hover:text-accent"
              label="Logout"
              onLoggedOut={() => setIsOpen(false)}
              variant="menu"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
