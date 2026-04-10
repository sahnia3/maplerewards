---
globs: internal/handler/**/*.go
---
# API Handler Rules
- All handlers must extract user ID via `middleware.UserIDFromContext(r.Context())`
- Return JSON via `jsonOK()` helper, not raw `json.Marshal`
- URL params via `chi.URLParam(r, "param")`
- Handlers call services, never repos directly
- Error responses must not leak stack traces or internal paths
