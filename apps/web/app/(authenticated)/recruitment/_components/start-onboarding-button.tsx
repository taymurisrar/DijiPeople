"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";

type StartOnboardingButtonProps = {
  candidateId: string;
};

type OnboardingLookupResponse = {
  items?: Array<{ id: string }>;
};

type OnboardingCreateResponse = {
  id?: string;
  message?: string;
};

export function StartOnboardingButton({
  candidateId,
}: StartOnboardingButtonProps) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openOrStartOnboarding() {
    if (isStarting) return;

    setIsStarting(true);
    setError(null);

    try {
      const existing = await findExistingOnboarding(candidateId);

      if (existing) {
        router.push(`/onboarding/${existing}`);
        return;
      }

      const created = await createOnboarding(candidateId);
      router.push(`/onboarding/${created}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to start onboarding.",
      );
      setIsStarting(false);
    }
  }

  return (
    <div className="grid gap-1">
      <Button
        loading={isStarting}
        loadingText="Starting..."
        onClick={openOrStartOnboarding}
        size="sm"
        type="button"
        variant="success"
      >
        Start onboarding
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

async function findExistingOnboarding(candidateId: string) {
  const query = new URLSearchParams({
    candidateId,
    page: "1",
    pageSize: "1",
  });
  const response = await fetch(`/api/onboarding?${query.toString()}`);

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as OnboardingLookupResponse;
  return data.items?.[0]?.id ?? null;
}

async function createOnboarding(candidateId: string) {
  const response = await fetch("/api/onboarding", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ candidateId, createEmployee: true }),
  });
  const data = (await response.json()) as OnboardingCreateResponse;

  if (response.ok && data.id) {
    return data.id;
  }

  if (response.status === 409) {
    const existing = await findExistingOnboarding(candidateId);
    if (existing) {
      return existing;
    }
  }

  throw new Error(data.message ?? "Unable to start onboarding.");
}
