"use client";

import { Button } from "@/app/components/ui/button";

export default function WorkQueuesError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      className="rounded-[24px] border border-danger/20 bg-danger/5 p-6"
      role="alert"
    >
      <h3 className="text-xl font-semibold text-foreground">
        Work queues could not be loaded
      </h3>
      <p className="mt-3 text-sm text-danger">{error.message}</p>
      <div className="mt-5">
        <Button onClick={reset}>Retry</Button>
      </div>
    </div>
  );
}
