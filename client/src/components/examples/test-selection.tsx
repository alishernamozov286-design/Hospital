import { TestSelection } from '../test-selection';

const mockTests = [
  { id: '1', name: 'Umumiy qon tahlili', price: 25000, category: 'Qon tahlillari' },
  { id: '2', name: 'Biokimyoviy qon tahlili', price: 45000, category: 'Qon tahlillari' },
  { id: '3', name: 'Qand miqdori', price: 15000, category: 'Qon tahlillari' },
  { id: '4', name: 'Umumiy siydik tahlili', price: 20000, category: 'Siydik tahlillari' },
  { id: '5', name: 'Gepatit markerlari', price: 65000, category: 'Infeksiya tahlillari' },
  { id: '6', name: 'HIV testi', price: 35000, category: 'Infeksiya tahlillari' },
];

export default function TestSelectionExample() {
  const handleSubmit = (selectedTests: any[], total: number) => {
    console.log('Order submitted:', { selectedTests, total });
  };

  return (
    <div className="p-6">
      <TestSelection
        tests={mockTests}
        onSubmit={handleSubmit}
        patientName="Aliyev Vali Akramovich"
      />
    </div>
  );
}
