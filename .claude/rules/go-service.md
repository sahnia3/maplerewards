---
globs: internal/service/**/*.go
---
# Service Layer Rules
- Services accept interfaces, not concrete repo types (dependency injection)
- All public methods take `context.Context` as first parameter
- Business logic lives here, not in handlers or repos
- Check Redis cache before hitting PostgreSQL where applicable
- Log errors with context (request ID, user ID) before returning
