import { RevenueReport } from "@/components/revenue-report";

export default function Reports() {
  const mockData = [
    { date: '01.10.2025', patients: 12, tests: 28, revenue: 850000 },
    { date: '02.10.2025', patients: 15, tests: 32, revenue: 1050000 },
    { date: '03.10.2025', patients: 10, tests: 22, revenue: 720000 },
    { date: '04.10.2025', patients: 18, tests: 40, revenue: 1280000 },
    { date: '05.10.2025', patients: 14, tests: 30, revenue: 950000 },
  ];

  const handleExport = () => {
    console.log('Export report clicked');
  };

  return (
    <div className="space-y-6">
      <RevenueReport
        data={mockData}
        dateRange="01.10.2025 - 05.10.2025"
        totalRevenue={4850000}
        totalPatients={69}
        onExport={handleExport}
      />
    </div>
  );
}
