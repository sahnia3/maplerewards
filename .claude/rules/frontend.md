---
globs: frontend/**/*.{ts,tsx}
---
# Frontend Rules
- Use App Router conventions (page.tsx, layout.tsx, route.ts)
- "use client" directive required for components with hooks or browser APIs
- Fetch data in Server Components, use hooks in Client Components
- shadcn/ui components for all UI primitives
- Tailwind CSS 4 — use utility classes, avoid inline styles
