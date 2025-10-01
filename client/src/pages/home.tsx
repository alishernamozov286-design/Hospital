import { DashboardStats } from "@/components/dashboard-stats";
import { RecentPatients } from "@/components/recent-patients";
import { Button } from "@/components/ui/button";
import { UserPlus, FlaskConical } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();

  const mockPatients = [
    {
      id: '1',
      fullName: 'Aliyev Vali Akramovich',
      phone: '+998 90 123 45 67',
      createdAt: new Date().toISOString(),
      status: 'pending' as const,
    },
    {
      id: '2',
      fullName: 'Karimova Malika Shavkatovna',
      phone: '+998 91 234 56 78',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      status: 'completed' as const,
    },
    {
      id: '3',
      fullName: 'Toshmatov Bobur Rustamovich',
      phone: '+998 93 345 67 89',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      status: 'pending' as const,
    },
  ];

  const handleViewPatient = (patientId: string) => {
    console.log('View patient:', patientId);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Bosh sahifa</h1>
        <p className="text-muted-foreground mt-2">
          Bugungi kunning umumiy ko'rsatkichlari
        </p>
      </div>

      <DashboardStats
        todayPatients={24}
        pendingTests={8}
        completedTests={16}
        todayRevenue={1250000}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Button
          size="lg"
          className="h-24 text-lg"
          onClick={() => setLocation('/patients')}
          data-testid="button-new-patient"
        >
          <UserPlus className="h-6 w-6 mr-2" />
          Yangi bemor qo'shish
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-24 text-lg"
          onClick={() => setLocation('/orders')}
          data-testid="button-new-order"
        >
          <FlaskConical className="h-6 w-6 mr-2" />
          Tahlil buyurtmasi
        </Button>
      </div>

      <RecentPatients patients={mockPatients} onViewDetails={handleViewPatient} />
    </div>
  );
}
