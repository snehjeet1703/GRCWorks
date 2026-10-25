import { notFound } from "next/navigation";
import { industryChoices, labContent, labMode } from "@/lib/lab/content";
import { SignupForm } from "./signup-form";
import { labSettings } from "@/lib/lab/access";

export const dynamic = "force-dynamic";

export default async function LabSignupPage() {
  if (!labMode) notFound();
  if (!(await labSettings()).signupOpen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sign-ups are closed for now</h1>
          <p className="mt-2 text-sm text-gray-500">Already have an account? <a href="/login" className="font-medium text-brand-600 hover:underline">Sign in</a></p>
        </div>
      </div>
    );
  }
  const course = (await labContent()).courses[0];
  const industries = course ? (await industryChoices(course.id)).sort((a, b) => a.industry.localeCompare(b.industry)) : [];
  return (
    <SignupForm
      course={course ? { title: course.title, labs: course.labs.map((l) => l.title.replace(/\{\{\w+\}\}/g, "your company")) } : null}
      industries={industries}
    />
  );
}
