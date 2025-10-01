import { ResultsEntry } from '../results-entry';

const mockOrderDetails = {
  patientName: 'Aliyev Vali Akramovich',
  tests: [
    { id: '1', name: 'Umumiy qon tahlili' },
    { id: '2', name: 'Qand miqdori' },
  ],
};

export default function ResultsEntryExample() {
  const handleSave = (results: any[]) => {
    console.log('Results saved:', results);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <ResultsEntry orderDetails={mockOrderDetails} onSave={handleSave} />
    </div>
  );
}
