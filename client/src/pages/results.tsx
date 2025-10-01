import { ResultsEntry } from "@/components/results-entry";
import { PrintResult } from "@/components/print-result";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Results() {
  const mockOrderDetails = {
    patientName: 'Aliyev Vali Akramovich',
    tests: [
      { id: '1', name: 'Umumiy qon tahlili' },
      { id: '2', name: 'Qand miqdori' },
    ],
  };

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

  const handleSave = (results: any[]) => {
    console.log('Results saved:', results);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Natijalar</h1>
        <p className="text-muted-foreground mt-2">
          Tahlil natijalarini kiriting yoki ko'ring
        </p>
      </div>

      <Tabs defaultValue="entry" className="w-full">
        <TabsList>
          <TabsTrigger value="entry">Natija kiritish</TabsTrigger>
          <TabsTrigger value="print">Natijani chop etish</TabsTrigger>
        </TabsList>
        <TabsContent value="entry" className="mt-6">
          <div className="max-w-4xl">
            <ResultsEntry orderDetails={mockOrderDetails} onSave={handleSave} />
          </div>
        </TabsContent>
        <TabsContent value="print" className="mt-6">
          <div className="max-w-4xl">
            <PrintResult
              patientName="Aliyev Vali Akramovich"
              patientPhone="+998 90 123 45 67"
              orderDate="01.10.2025"
              results={mockResults}
              onPrint={handlePrint}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
