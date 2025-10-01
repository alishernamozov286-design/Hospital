import { TestSelection } from "@/components/test-selection";

export default function Orders() {
  const mockTests = [
    { id: '1', name: 'Umumiy qon tahlili', price: 25000, category: 'Qon tahlillari' },
    { id: '2', name: 'Biokimyoviy qon tahlili', price: 45000, category: 'Qon tahlillari' },
    { id: '3', name: 'Qand miqdori', price: 15000, category: 'Qon tahlillari' },
    { id: '4', name: 'Umumiy siydik tahlili', price: 20000, category: 'Siydik tahlillari' },
    { id: '5', name: 'Gepatit markerlari', price: 65000, category: 'Infeksiya tahlillari' },
    { id: '6', name: 'HIV testi', price: 35000, category: 'Infeksiya tahlillari' },
  ];

  const handleSubmit = (selectedTests: any[], total: number) => {
    console.log('Order submitted:', { selectedTests, total });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tahlillar buyurtmasi</h1>
        <p className="text-muted-foreground mt-2">
          Bemorga kerakli tahlillarni tanlang
        </p>
      </div>

      <TestSelection
        tests={mockTests}
        onSubmit={handleSubmit}
        patientName="Aliyev Vali Akramovich"
      />
    </div>
  );
}
