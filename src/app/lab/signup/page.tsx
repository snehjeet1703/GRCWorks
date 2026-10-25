import { notFound } from "next/navigation";
import { industryChoices, labContent, labMode } from "@/lib/lab/content";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function LabSignupPage() {
  if (!labMode) notFound();
  const course = (await labContent()).courses[0];
  const industries = course ? (await industryChoices(course.id)).sort((a, b) => a.industry.localeCompare(b.industry)) : [];
  return (
    <SignupForm
      course={course ? { title: course.title, labs: course.labs.map((l) => l.title.replace(/\{\{\w+\}\}/g, "your company")) } : null}
      industries={industries}
    />
  );
}
