import type { Metadata } from "next";
import { DemoDashboard } from "@/components/demo/demo-dashboard";

export const metadata: Metadata = {
  title: "לוח בקרה | הדגמה",
  description: "סביבת הדגמה לניהול משימות עם נתונים לדוגמה",
};

export default function DemoPage() {
  return <DemoDashboard />;
}
