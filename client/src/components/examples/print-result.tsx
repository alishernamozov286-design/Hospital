import { PrintResult } from '../print-result';

const mockResults = [
  {
    testName: 'Umumiy qon tahlili',
    result: 'Gemoglobin: 140 g/l, Eritrotsitlar: 4.5 x 10^12/l',
    notes: 'Me\'yorida',
  },
  {
    testName: 'Qand miqdori',
    result: '5.2 mmol/l',
    notes: 'Normal ko\'rsatkichlar',
  },
];

export default function PrintResultExample() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PrintResult
        patientName="Aliyev Vali Akramovich"
        patientPhone="+998 90 123 45 67"
        orderDate="01.10.2025"
        results={mockResults}
        onPrint={handlePrint}
      />
    </div>
  );
}
