import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Save } from "lucide-react";

interface TestResult {
  testName: string;
  result: string;
  notes: string;
}

interface ResultsEntryProps {
  orderDetails: {
    patientName: string;
    tests: { id: string; name: string }[];
  };
  onSave: (results: TestResult[]) => void;
  isPending?: boolean;
}

export function ResultsEntry({ orderDetails, onSave, isPending }: ResultsEntryProps) {
  const { register, handleSubmit } = useForm();

  const onSubmit = (data: any) => {
    const results: TestResult[] = orderDetails.tests.map((test) => ({
      testName: test.name,
      result: data[`result-${test.id}`] || "",
      notes: data[`notes-${test.id}`] || "",
    }));
    onSave(results);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Tahlil natijalarini kiritish
        </CardTitle>
        <p className="text-sm text-muted-foreground">Bemor: {orderDetails.patientName}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {orderDetails.tests.map((test) => (
            <div key={test.id} className="p-4 border rounded-lg space-y-4">
              <h3 className="font-semibold text-lg">{test.name}</h3>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`result-${test.id}`}>Natija</Label>
                  <Input
                    id={`result-${test.id}`}
                    placeholder="Natijani kiriting"
                    {...register(`result-${test.id}`)}
                    data-testid={`input-result-${test.id}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`notes-${test.id}`}>Izoh</Label>
                  <Textarea
                    id={`notes-${test.id}`}
                    placeholder="Qo'shimcha ma'lumot (ixtiyoriy)"
                    {...register(`notes-${test.id}`)}
                    data-testid={`textarea-notes-${test.id}`}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            type="submit"
            className="w-full"
            disabled={isPending}
            data-testid="button-save-results"
          >
            <Save className="h-4 w-4 mr-2" />
            {isPending ? "Saqlanmoqda..." : "Natijalarni saqlash"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
