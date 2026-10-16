const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const tables = ['customers', 'discounts', 'login_history', 'products', 'product_types', 'transaction', 'users', 'user_types'];
const names = tables.join('|');

// Only the application's fixed SQL is accepted here. Values always remain bound parameters.
function scopeSql(sql, companyId) {
    if (!Number.isSafeInteger(companyId) || companyId < 1) throw new Error('Company context required');
    sql = sql.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
    if (/^\s*INSERT\b/i.test(sql)) {
        const match = sql.match(new RegExp('^\\s*INSERT INTO\\s+(`?(?:' + names + ')`?)\\s*\\(([^)]+)\\)\\s*VALUES\\s*\\(([^)]+)\\)\\s*;?$', 'i'));
        if (!match || /company_id/i.test(match[2])) throw new Error('Unsupported tenant insert');
        return `INSERT INTO ${match[1]} (${match[2]}, company_id) VALUES (${match[3]}, ${companyId})`;
    }
    // Scope every source, including joins and nested aggregate/subqueries.
    sql = sql.replace(new RegExp('\\b(FROM|JOIN)\\s+(`?(?:' + names + ')`?)(?![\\w])(?:\\s+(?:AS\\s+)?((?!(?:WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|ORDER|LIMIT|ON|SET|HAVING|UNION)\\b)[a-zA-Z_]\\w*))?', 'gi'),
        (all, keyword, table, alias) => `${keyword} (SELECT * FROM ${table} WHERE company_id = ${companyId}) AS ${alias || table}`);
    if (/^\s*(UPDATE|DELETE)\b/i.test(sql)) {
        // Restore DELETE target (a derived table cannot be deleted from).
        sql = sql.replace(/^\s*DELETE FROM \(SELECT \* FROM (\w+) WHERE company_id = \d+\) AS \w+/i, 'DELETE FROM $1');
        const match = sql.match(new RegExp('^\\s*(?:UPDATE\\s+|DELETE FROM\\s+)(`?(?:' + names + ')`?)\\b', 'i'));
        if (!match) throw new Error('Unsupported tenant mutation');
        const boundary = sql.search(/\b(?:ORDER BY|LIMIT)\b/i);
        let head = boundary < 0 ? sql : sql.slice(0, boundary);
        const tail = boundary < 0 ? '' : sql.slice(boundary);
        head = head.trim().replace(/;$/, '');
        head = /\bWHERE\b/i.test(head) ? head.replace(/\bWHERE\b/i, `WHERE ${match[1]}.company_id = ${companyId} AND (`) + ')' : head + ` WHERE ${match[1]}.company_id = ${companyId}`;
        sql = head + ' ' + tail;
    } else if (!/^\s*SELECT\b/i.test(sql)) throw new Error('Unsupported tenant query');
    return sql;
}
module.exports = { context, scopeSql };
