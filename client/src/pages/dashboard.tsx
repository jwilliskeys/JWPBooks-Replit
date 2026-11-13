import { DashboardSchedule } from "@/components/dashboard-schedule";
import { TuningReminderFeed } from "@/components/tuning-reminder-feed";

export default function Dashboard() {
  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:space-y-6 sm:p-6">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">JWP Books - Dashboard</h1>
      <TuningReminderFeed />
      <DashboardSchedule />
    </main>
  );
}
