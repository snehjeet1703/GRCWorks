import { notFound } from "next/navigation";
import { labContent, labMode } from "@/lib/lab/content";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function LabSignupPage() {
  if (!labMode) notFound();
  const course = (await labContent()).courses[0];
  return <SignupForm course={course ? { title: course.title, labs: course.labs.map((l) => l.title) } : null} />;
}
