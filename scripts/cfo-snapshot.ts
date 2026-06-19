// Superseded — use scripts/cfo-snapshot.mjs instead.
//
// This .ts version requires running through tsx, which depends on esbuild's
// native binary. The project's node_modules ships the macOS (darwin-arm64)
// build, so tsx fails with a platform-mismatch error in any Linux execution
// environment (e.g. the scheduled-task runner). scripts/cfo-snapshot.mjs is
// plain JavaScript with no TypeScript/esbuild step and queries the database
// directly via the pure-JS `pg` driver, so it runs anywhere Node runs.
//
// Kept here only so the git history shows why the plain-JS version exists;
// safe to delete next time you're cleaning up the scripts/ folder.
export {};
