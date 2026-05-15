"use client";

// Re-export shim. Canonical implementation lives at components/stack-templates.tsx
// and is shared with non-pro-tools surfaces. Imported here so all 14 Pro Tools
// tiles can be found under components/pro-tools/.
export { StackTemplates } from "@/components/stack-templates";
