import { AccessDeniedState } from "../_components/access-denied-state";

type DashboardAccessDeniedPageProps = {
  searchParams?: Promise<{
    traceId?: string;
    permission?: string;
  }>;
};

export default async function DashboardAccessDeniedPage({
  searchParams,
}: DashboardAccessDeniedPageProps) {
  const params = searchParams ? await searchParams : undefined;

  return (
    <AccessDeniedState
      description={
        params?.permission
          ? "You do not have permission to access this page or feature."
          : undefined
      }
      traceId={params?.traceId}
    />
  );
}
