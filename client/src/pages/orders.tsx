import { TestSelection } from "@/components/test-selection";
import { defaultTests } from "@shared/tests-data";

export default function Orders() {
  const mockTests = defaultTests;

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
      />
    </div>
  );
}
