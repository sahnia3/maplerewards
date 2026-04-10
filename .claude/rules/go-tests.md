---
globs: "**/*_test.go"
---
# Go Test Rules
- Use standard `testing` package, not testify or other frameworks
- Mock repos by implementing the interface with function fields
- Test helpers go in `testutil/` package
- Use `t.Helper()` in helper functions
- Run with race detector: `go test -race`
