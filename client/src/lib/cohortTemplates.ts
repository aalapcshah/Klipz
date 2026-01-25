export interface CohortTemplate {
  id: string;
  name: string;
  description: string;
  getDateRange: () => { startDate: Date; endDate: Date };
}

export const cohortTemplates: CohortTemplate[] = [
  {
    id: "last_7_days",
    name: "Last 7 Days",
    description: "Users who joined in the past week",
    getDateRange: () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      return { startDate, endDate };
    },
  },
  {
    id: "last_30_days",
    name: "Last 30 Days",
    description: "Users who joined in the past month",
    getDateRange: () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      return { startDate, endDate };
    },
  },
  {
    id: "last_90_days",
    name: "Last 90 Days",
    description: "Users who joined in the past quarter",
    getDateRange: () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      return { startDate, endDate };
    },
  },
  {
    id: "this_month",
    name: "This Month",
    description: "Users who joined this calendar month",
    getDateRange: () => {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate, endDate };
    },
  },
  {
    id: "last_month",
    name: "Last Month",
    description: "Users who joined last calendar month",
    getDateRange: () => {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate, endDate };
    },
  },
  {
    id: "q1_2026",
    name: "Q1 2026",
    description: "January - March 2026",
    getDateRange: () => {
      return {
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-03-31"),
      };
    },
  },
  {
    id: "q2_2026",
    name: "Q2 2026",
    description: "April - June 2026",
    getDateRange: () => {
      return {
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-06-30"),
      };
    },
  },
  {
    id: "q3_2026",
    name: "Q3 2026",
    description: "July - September 2026",
    getDateRange: () => {
      return {
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-09-30"),
      };
    },
  },
  {
    id: "q4_2026",
    name: "Q4 2026",
    description: "October - December 2026",
    getDateRange: () => {
      return {
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-12-31"),
      };
    },
  },
  {
    id: "january_2026",
    name: "January 2026",
    description: "Users who joined in January 2026",
    getDateRange: () => {
      return {
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      };
    },
  },
  {
    id: "february_2026",
    name: "February 2026",
    description: "Users who joined in February 2026",
    getDateRange: () => {
      return {
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-02-28"),
      };
    },
  },
];

export function getCohortTemplate(id: string): CohortTemplate | undefined {
  return cohortTemplates.find((template) => template.id === id);
}
