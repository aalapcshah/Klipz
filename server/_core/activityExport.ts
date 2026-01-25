import { getDb } from "../db";
import { fileActivityLogs, users, files } from "../../drizzle/schema";
import { eq, gte, lte, and, desc } from "drizzle-orm";

export interface ExportFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: number;
  activityType?: string;
}

export interface ActivityExportRow {
  id: number;
  timestamp: string;
  userName: string;
  userEmail: string;
  activityType: string;
  fileName: string;
  details: string;
}

/**
 * Fetch activity data for export
 */
export async function fetchActivityDataForExport(
  filters: ExportFilters = {}
): Promise<ActivityExportRow[]> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  // Build where conditions
  const conditions = [];
  
  if (filters.startDate) {
    conditions.push(gte(fileActivityLogs.createdAt, filters.startDate));
  }
  
  if (filters.endDate) {
    conditions.push(lte(fileActivityLogs.createdAt, filters.endDate));
  }
  
  if (filters.userId) {
    conditions.push(eq(fileActivityLogs.userId, filters.userId));
  }
  
  if (filters.activityType) {
    conditions.push(eq(fileActivityLogs.activityType, filters.activityType as any));
  }

  // Fetch activities with user and file info
  const activities = await database
    .select({
      id: fileActivityLogs.id,
      createdAt: fileActivityLogs.createdAt,
      activityType: fileActivityLogs.activityType,
      details: fileActivityLogs.details,
      userId: fileActivityLogs.userId,
      fileId: fileActivityLogs.fileId,
    })
    .from(fileActivityLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(fileActivityLogs.createdAt))
    .limit(10000); // Limit to prevent memory issues

  // Fetch user and file data
  const result: ActivityExportRow[] = [];
  
  for (const activity of activities) {
    // Get user info
    const [user] = await database
      .select({
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, activity.userId))
      .limit(1);

    // Get file info
    let fileName = "Unknown";
    if (activity.fileId) {
      const [file] = await database
        .select({
          filename: files.filename,
        })
        .from(files)
        .where(eq(files.id, activity.fileId))
        .limit(1);
      
      if (file) {
        fileName = file.filename;
      }
    }

    result.push({
      id: activity.id,
      timestamp: activity.createdAt.toISOString(),
      userName: user?.name || "Unknown",
      userEmail: user?.email || "Unknown",
      activityType: activity.activityType,
      fileName,
      details: activity.details || "",
    });
  }

  return result;
}

/**
 * Generate CSV from activity data
 */
export function generateCSV(data: ActivityExportRow[]): string {
  const headers = ["ID", "Timestamp", "User Name", "User Email", "Activity Type", "File Name", "Details"];
  const rows = data.map(row => [
    row.id.toString(),
    row.timestamp,
    escapeCSV(row.userName),
    escapeCSV(row.userEmail),
    escapeCSV(row.activityType),
    escapeCSV(row.fileName),
    escapeCSV(row.details),
  ]);

  const csvLines = [
    headers.join(","),
    ...rows.map(row => row.join(",")),
  ];

  return csvLines.join("\n");
}

/**
 * Escape CSV values
 */
function escapeCSV(value: string): string {
  if (!value) return '""';
  
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  
  return value;
}

/**
 * Generate Excel buffer from activity data
 */
export async function generateExcel(data: ActivityExportRow[]): Promise<Buffer> {
  // Import ExcelJS dynamically
  const ExcelJS = await import("exceljs");
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Activity Report");

  // Add headers
  worksheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Timestamp", key: "timestamp", width: 25 },
    { header: "User Name", key: "userName", width: 20 },
    { header: "User Email", key: "userEmail", width: 30 },
    { header: "Activity Type", key: "activityType", width: 15 },
    { header: "File Name", key: "fileName", width: 30 },
    { header: "Details", key: "details", width: 40 },
  ];

  // Style headers
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  // Add data rows
  data.forEach(row => {
    worksheet.addRow({
      id: row.id,
      timestamp: row.timestamp,
      userName: row.userName,
      userEmail: row.userEmail,
      activityType: row.activityType,
      fileName: row.fileName,
      details: row.details,
    });
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
