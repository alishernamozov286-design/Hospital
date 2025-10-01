import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface TestResult {
  testName: string;
  result: string;
  notes?: string;
}

interface PrintResultProps {
  patientName: string;
  patientPhone: string;
  orderDate: string;
  results: TestResult[];
  onPrint: () => void;
}

export function PrintResult({
  patientName,
  patientPhone,
  orderDate,
  results,
  onPrint,
}: PrintResultProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button onClick={onPrint} data-testid="button-print">
          <Printer className="h-4 w-4 mr-2" />
          Chop etish
        </Button>
      </div>

      <Card className="print:shadow-none print:border-0" id="printable-result">
        <CardContent className="p-8 space-y-6">
          <div className="text-center border-b pb-6">
            <h1 className="text-3xl font-bold text-primary mb-2">MedLab</h1>
            <p className="text-sm text-muted-foreground">Tibbiy Laboratoriya</p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Tahlil natijalari</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Bemor:</p>
                <p className="font-semibold" data-testid="text-patient-name">
                  {patientName}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Telefon:</p>
                <p className="font-semibold">{patientPhone}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sana:</p>
                <p className="font-semibold">{orderDate}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Natijalar</h3>
            {results.map((result, index) => (
              <div
                key={index}
                className="p-4 border rounded-lg space-y-2"
                data-testid={`result-item-${index}`}
              >
                <h4 className="font-semibold">{result.testName}</h4>
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Natija: </span>
                    <span className="font-medium">{result.result}</span>
                  </p>
                  {result.notes && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Izoh: </span>
                      <span>{result.notes}</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground">Laborant:</p>
                <div className="mt-8 border-t border-muted w-48"></div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Imzo:</p>
                <div className="mt-8 border-t border-muted w-48"></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
