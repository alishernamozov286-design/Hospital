import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Clock, Phone } from "lucide-react";

interface Patient {
  id: string;
  fullName: string;
  phone: string;
  createdAt: string;
  status: "pending" | "completed";
}

interface RecentPatientsProps {
  patients: Patient[];
  onViewDetails: (patientId: string) => void;
}

export function RecentPatients({ patients, onViewDetails }: RecentPatientsProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>So'nggi bemorlar</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {patients.map((patient) => (
            <div
              key={patient.id}
              className="flex items-center justify-between p-4 rounded-lg border hover-elevate"
              data-testid={`patient-card-${patient.id}`}
            >
              <div className="flex items-center gap-4">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials(patient.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium" data-testid={`patient-name-${patient.id}`}>
                    {patient.fullName}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {patient.phone}
                    </span>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(patient.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={patient.status === "completed" ? "default" : "secondary"}
                  data-testid={`status-${patient.id}`}
                >
                  {patient.status === "completed" ? "Tayyor" : "Kutilmoqda"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewDetails(patient.id)}
                  data-testid={`button-view-${patient.id}`}
                >
                  Ko'rish
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
