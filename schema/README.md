# Company accounts and schema synchronization

- Register at `/register` to create a company and its administrator. Company codes are unique; usernames are unique within each company.
- Existing records belong to company 1. Existing users log in using company code `default` and their existing credentials. There are no seeded passwords for fresh installations.
- Authentication uses random, database-backed tokens in HttpOnly cookies. New registration passwords use scrypt; existing SHA-256 passwords are accepted for compatibility.
- Every protected request establishes company context. Application/model queries go through the scoped database adapter. Only authentication/provisioning and startup schema synchronization use `db.auth`.
- `schema/pos.sql` is the canonical MySQL table definition. Each process runs `schema/sync.js` once before listening. It compares column types, nullability, defaults, extras, collation and named indexes, then adds or modifies differences. A database advisory lock serializes startup updates.
- Extra tables, columns and indexes are retained. Renames, deletion, foreign keys and table engine conversions are not inferred. Column modifications can fail when existing values cannot be converted; the application then exits without listening. MySQL DDL can partially apply before a failure; the next start checks again.
- The database account needs CREATE, ALTER, INDEX and CREATE TEMPORARY TABLES privileges as well as normal application read/write privileges.
- Tenant SQL rewriting supports the existing fixed application SQL. Extend the adapter and its tests when adding new SQL forms; never pass client SQL into it.
- Run `node --test tests/auth.test.js` and `node tests/queries.cjs` for local checks.
