import { isNil } from "lodash";

/**
 * Ensures that the N1QL identifier is escaped with backticks
 */
export function ensureEscaped(identifier: string): string;
export function ensureEscaped(identifier: null | undefined): null | undefined;
export function ensureEscaped(identifier: string | null | undefined): string | null | undefined;
export function ensureEscaped(identifier: string | null | undefined): string | null | undefined {
    if (isNil(identifier)) {
        return identifier;
    }

    if (!identifier.startsWith('`')) {
        return '`' + identifier.replace(/`/g, '``') + '`';
    } else {
        return identifier;
    }
}