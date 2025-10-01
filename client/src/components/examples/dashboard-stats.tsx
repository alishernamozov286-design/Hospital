import { DashboardStats } from '../dashboard-stats';

export default function DashboardStatsExample() {
  return (
    <div className="p-6">
      <DashboardStats
        todayPatients={24}
        pendingTests={8}
        completedTests={16}
        todayRevenue={1250000}
      />
    </div>
  );
}
