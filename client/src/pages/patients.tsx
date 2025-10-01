import { PatientRegistrationForm } from "@/components/patient-registration-form";

export default function Patients() {
  const handleSubmit = (values: any) => {
    console.log('Patient registered:', values);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bemorlar</h1>
        <p className="text-muted-foreground mt-2">
          Yangi bemorni ro'yxatdan o'tkazing
        </p>
      </div>

      <div className="max-w-4xl">
        <PatientRegistrationForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
