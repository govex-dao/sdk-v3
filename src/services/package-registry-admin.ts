// PackageRegistryAdminOperations was removed.
//
// This class called package_registry::add_package etc. directly, bypassing
// the governance action execution pattern (no intent, no executable, no cap).
// The Move functions require a PackageAdminCap argument that this class
// never provided, so every method would abort at runtime.
//
// The correct path for package registry mutations is through the
// intent-executor.ts withBorrowedCap pattern, which correctly borrows
// PackageAdminCap from the DAO account.
