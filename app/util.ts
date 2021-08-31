/**
 * Ensures that the N1QL identifier is escaped with backticks
 */
export function ensureEscaped(identifier: string): string {
    if (!identifier.startsWith('`')) {
        return '`' + identifier.replace(/`/g, '``') + '`';
    } else {
        return identifier;
    }
}