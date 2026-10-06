import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRiskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

export function getRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score <= 4) return "low";
  if (score <= 9) return "medium";
  if (score <= 16) return "high";
  return "critical";
}

export function getRiskColor(level: string): string {
  switch (level) {
    case "low": return "text-green-700 bg-green-50 border-green-200";
    case "medium": return "text-yellow-700 bg-yellow-50 border-yellow-200";
    case "high": return "text-orange-700 bg-orange-50 border-orange-200";
    case "critical": return "text-red-700 bg-red-50 border-red-200";
    default: return "text-gray-700 bg-gray-50 border-gray-200";
  }
}

export function getControlStatusColor(status: string): string {
  switch (status) {
    case "IMPLEMENTED": return "text-green-700 bg-green-50";
    case "IN_PROGRESS": return "text-blue-700 bg-blue-50";
    case "NOT_STARTED": return "text-gray-700 bg-gray-50";
    case "NOT_APPLICABLE": return "text-gray-400 bg-gray-50";
    default: return "text-gray-700 bg-gray-50";
  }
}

export function getPolicyStatusColor(status: string): string {
  switch (status) {
    case "APPROVED": return "text-green-700 bg-green-50";
    case "IN_REVIEW": return "text-yellow-700 bg-yellow-50";
    case "DRAFT": return "text-gray-700 bg-gray-50";
    case "EXPIRED": return "text-red-700 bg-red-50";
    case "ARCHIVED": return "text-gray-400 bg-gray-50";
    default: return "text-gray-700 bg-gray-50";
  }
}
