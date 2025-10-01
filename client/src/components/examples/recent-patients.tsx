import { RecentPatients } from '../recent-patients';

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

export default function RecentPatientsExample() {
  const handleViewDetails = (patientId: string) => {
    console.log('View patient details:', patientId);
  };

  return (
    <div className="p-6 max-w-4xl">
      <RecentPatients patients={mockPatients} onViewDetails={handleViewDetails} />
    </div>
  );
}
