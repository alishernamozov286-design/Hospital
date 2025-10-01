import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, ShoppingCart } from "lucide-react";

interface Test {
  id: string;
  name: string;
  price: number;
  category: string;
}

interface TestSelectionProps {
  tests: Test[];
  onSubmit: (selectedTests: Test[], total: number) => void;
  patientName?: string;
}

export function TestSelection({ tests, onSubmit, patientName }: TestSelectionProps) {
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());

  const toggleTest = (testId: string) => {
    const newSelected = new Set(selectedTests);
    if (newSelected.has(testId)) {
      newSelected.delete(testId);
    } else {
      newSelected.add(testId);
    }
    setSelectedTests(newSelected);
  };

  const selectedTestsList = tests.filter(t => selectedTests.has(t.id));
  const totalAmount = selectedTestsList.reduce((sum, test) => sum + Number(test.price), 0);

  const categories = Array.from(new Set(tests.map(t => t.category)));

  const handleSubmit = () => {
    onSubmit(selectedTestsList, totalAmount);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Tahlillarni tanlash
            </CardTitle>
            {patientName && (
              <p className="text-sm text-muted-foreground">Bemor: {patientName}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {categories.map((category) => (
              <div key={category}>
                <h3 className="font-semibold mb-3 text-lg">{category}</h3>
                <div className="space-y-3">
                  {tests
                    .filter((test) => test.category === category)
                    .map((test) => (
                      <div
                        key={test.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover-elevate"
                        data-testid={`test-item-${test.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={test.id}
                            checked={selectedTests.has(test.id)}
                            onCheckedChange={() => toggleTest(test.id)}
                            data-testid={`checkbox-test-${test.id}`}
                          />
                          <label
                            htmlFor={test.id}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {test.name}
                          </label>
                        </div>
                        <Badge variant="secondary" className="font-semibold">
                          {test.price.toLocaleString()} so'm
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Tanlangan tahlillar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedTestsList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Hech qanday tahlil tanlanmagan
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {selectedTestsList.map((test) => (
                    <div
                      key={test.id}
                      className="flex justify-between text-sm"
                      data-testid={`selected-test-${test.id}`}
                    >
                      <span>{test.name}</span>
                      <span className="font-medium">{test.price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-semibold text-lg">Jami:</span>
                    <span className="font-bold text-2xl text-primary" data-testid="text-total">
                      {totalAmount.toLocaleString()} so'm
                    </span>
                  </div>
                  <Button
                    onClick={handleSubmit}
                    className="w-full"
                    disabled={selectedTestsList.length === 0}
                    data-testid="button-submit-order"
                  >
                    Buyurtma berish
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
