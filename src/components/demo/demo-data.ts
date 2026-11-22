import { addDays } from "@/domain/dates";
import type { Task } from "@/domain/task";

export const DEMO_DATE = "2026-06-15";
export const DEMO_TIME = "2026-06-15T09:00:00.000Z";

const tasks = [
  { id: "review", title: "לבדוק את מסכי ההרשמה", projectId: "אתר קהילתי", offset: -2, status: "in_progress", isImportant: true },
  { id: "agenda", title: "לשלוח סדר יום למפגש", projectId: "סדנת צילום", offset: 0, status: "todo", isImportant: false },
  { id: "outline", title: "לסיים את מבנה דף הבית", projectId: "אתר קהילתי", offset: 1, status: "todo", isImportant: true },
  { id: "materials", title: "להכין רשימת ציוד", projectId: "סדנת צילום", offset: 3, status: "todo", isImportant: false },
  { id: "venue", title: "לקבל אישור על מקום המפגש", projectId: "סדנת צילום", offset: 5, status: "waiting", isImportant: true },
  { id: "contrast", title: "לבצע בדיקת ניגודיות", projectId: "אתר קהילתי", offset: 6, status: "todo", isImportant: false },
  { id: "gallery", title: "לבחור תמונות לגלריה", projectId: "אתר קהילתי", offset: 10, status: "todo", isImportant: true },
  { id: "schedule", title: "לשריין זמן לתרגול", projectId: "סדנת צילום", offset: -1, status: "done", isImportant: false },
] satisfies { id: string; title: string; projectId: string; offset: number; status: Task["status"]; isImportant: boolean }[];

export const DEMO_TASKS: readonly Task[] = tasks.map(({ offset, ...task }) => ({
  ...task,
  notes: null,
  urgentOverride: null,
  deadline: addDays(DEMO_DATE, offset),
  startDate: null,
  scheduledAt: null,
  categoryId: null,
  completedAt: task.status === "done" ? DEMO_TIME : null,
  createdAt: "2026-06-10T09:00:00.000Z",
}));
