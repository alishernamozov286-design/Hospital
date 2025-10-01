import { PatientRegistrationForm } from '../patient-registration-form';

export default function PatientRegistrationFormExample() {
  const handleSubmit = (values: any) => {
    console.log('Patient registered:', values);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <PatientRegistrationForm onSubmit={handleSubmit} />
    </div>
  );
}
