import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Download, DollarSign, TrendingUp, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RevenueData {
  date: string;
  patients: number;
  tests: number;
  revenue: number;
}

interface RevenueReportProps {
  data: RevenueData[];
  dateRange: string;
  totalRevenue: number;
  totalPatients: number;
  onExport: () => void;
}

export function RevenueReport({
  data,
  dateRange,
  totalRevenue,
  totalPatients,
  onExport,
}: RevenueReportProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Moliyaviy hisobot</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Calendar className="h-4 w-4" />
            {dateRange}
          </p>
        </div>
        <Button onClick={onExport} data-testid="button-export-report">
          <Download className="h-4 w-4 mr-2" />
          Yuklab olish
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Jami tushum
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">
              {totalRevenue.toLocaleString()} so'm
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Jami bemorlar
            </CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-patients">
              {totalPatients}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              O'rtacha summa
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-revenue">
              {totalPatients > 0
                ? Math.round(totalRevenue / totalPatients).toLocaleString()
                : 0}{" "}
              so'm
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kunlik tafsilotlar</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sana</TableHead>
                <TableHead>Bemorlar</TableHead>
                <TableHead>Tahlillar</TableHead>
                <TableHead className="text-right">Tushum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) => (
                <TableRow key={index} data-testid={`report-row-${index}`}>
                  <TableCell className="font-medium">{row.date}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.patients}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.tests}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {row.revenue.toLocaleString()} so'm
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
