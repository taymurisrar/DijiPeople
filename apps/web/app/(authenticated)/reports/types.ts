export type HeadcountSummary = {
  totalEmployees: number;
  statuses: {
    active: number;
    probation: number;
    notice: number;
    terminated: number;
  };
  departments: Array<{
    departmentId: string | null;
    departmentName: string;
    count: number;
  }>;
};

export type LeaveSummary = {
  totalRequests: number;
  statuses: {
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
  };
  leaveTypes: Array<{
    leaveTypeId: string;
    leaveTypeName: string;
    count: number;
  }>;
};

export type AttendanceSummary = {
  today: {
    totalEntries: number;
    statuses: {
      present: number;
      late: number;
      absent: number;
      halfDay: number;
      missedCheckOut: number;
    };
  };
  daily: Array<{
    date: string;
    total: number;
    present: number;
    late: number;
  }>;
};

export type RecruitmentSummary = {
  jobs: {
    open: number;
    onHold: number;
    filled: number;
    closed: number;
  };
  candidates: {
    applied: number;
    screening: number;
    interview: number;
    offer: number;
    hired: number;
  };
  applicationsByStage: Array<{
    stage: string;
    count: number;
  }>;
};
