import { NextResponse } from "next/server";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    timesheetId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { timesheetId } = await context.params;

  try {
    const response = await apiRequestJson<{
      fileName: string;
      contentType: string;
      content: string;
    }>(`/timesheets/${timesheetId}/export`);

    return new NextResponse(response.content, {
      status: 200,
      headers: {
        "Content-Type": response.contentType,
        "Content-Disposition": `attachment; filename=\"${response.fileName}\"`,
      },
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to export timesheet.",
      },
      { status: 500 },
    );
  }
}
