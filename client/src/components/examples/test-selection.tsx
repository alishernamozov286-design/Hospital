import { TestSelection } from '../test-selection';
import { defaultTests } from '@shared/tests-data';

export default function TestSelectionExample() {
  const handleSubmit = (selectedTests: any[], total: number) => {
    console.log('Order submitted:', { selectedTests, total });
  };

  return (
    <div className="p-6">
      <TestSelection
        tests={defaultTests.slice(0, 20)}
        onSubmit={handleSubmit}
        patientName="Aliyev Vali Akramovich"
      />
    </div>
  );
}
