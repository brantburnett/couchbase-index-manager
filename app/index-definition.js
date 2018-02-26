import _ from 'lodash';
import {CreateIndexMutation} from './create-index-mutation';
import {UpdateIndexMutation} from './update-index-mutation';
import {DropIndexMutation} from './drop-index-mutation';

/**
 * @typedef LifecycleHash
 * @property {?boolean} drop
 */

/**
 * @typedef IndexDefinitionHash
 * @property {string} name
 * @property {?boolean} is_primary
 * @property {?array.string} index_key
 * @property {?string} condition
 * @property {?number} num_replica
 * @property {?LifecycleHash} lifecycle
 */

/**
 * @typedef CouchbaseIndex
 * @property {string} name
 * @property {array.string} index_key
 * @property {?string} condition
 * @property {?boolean} is_primary
 */

/**
 * Ensures that the N1QL identifier is escaped with backticks
 *
 * @param  {!string} identifier
 * @return {!string}
 */
function ensureEscaped(identifier) {
    if (!identifier.startsWith('`')) {
        return '`' + identifier.replace(/`/g, '``') + '`';
    } else {
        return identifier;
    }
}

/**
 * Ensures that the N1QL identifier is escaped with backticks, unless it's a
 *     function call or array subquery
 *
 * @param  {!string} identifier
 * @return {!string}
 */
function normalizeIndexKey(identifier) {
    identifier = identifier.trim().replace(/\s{2,}/g, ' ');

    if (identifier.match(/^(\(?\s*DISTINCT|ALL)\s*\(?\s*ARRAY|\(/i)) {
        // Contains parentheses or starts with ALL ARRAY or DISTINCT ARRAY
        // Don't escape
        return identifier;
    } else {
        return ensureEscaped(identifier);
    }
}

/**
 * Represents an index
 * @property {!string} name
 * @property {!boolean} is_primary
 * @property {!array.string} index_key
 * @property {?string} condition
 * @property {!number} num_replica
 * @property {!LifecycleHash} lifecycle
 */
export class IndexDefinition {
    /**
     * Creates a new IndexDefinition from a simple object map
     *
     * @param  {IndexDefinitionHash} obj
     * @return {IndexDefinition}
     */
    static fromObject(obj) {
        let definition = new IndexDefinition();

        if (!obj.name || !_.isString(obj.name)) {
            throw new Error('Index definition does not have a \'name\'');
        }
        definition.name = obj.name;
        definition.is_primary = !!obj.is_primary;

        definition.index_key = !obj.index_key ?
            [] :
            _.isArray(obj.index_key) ?
                obj.index_key.map(normalizeIndexKey) :
                _.compact([normalizeIndexKey(obj.index_key)]);

        definition.condition =
            IndexDefinition.normalizeCondition(obj.condition);
        definition.num_replica = obj.num_replica || 0;
        definition.lifecycle = obj.lifecycle || {};

        if (!definition.is_primary) {
            if (definition.index_key.length === 0) {
                throw new Error('index_key must include at least one key');
            }
        } else {
            if (definition.index_key.length > 0) {
                throw new Error('index_key is not allowed for a primary index');
            }

            if (definition.condition) {
                throw new Error('condition is not allowed for a primary index');
            }
        }

        return definition;
    }

    /**
     * Gets the required index mutation, if any, to sync this definition
     *
     * @param  {array.CouchbaseIndex} currentIndexes
     * @return {?IndexMutation}
     */
    getMutation(currentIndexes) {
        let currentIndex = currentIndexes.find(this.isMatch, this);

        if (!currentIndex) {
            // Index isn't found
            if (!this.delete) {
                return new CreateIndexMutation(this);
            }
        } else if (this.lifecycle.drop) {
            return new DropIndexMutation(this, currentIndex);
        } else if (!this.is_primary && this.requiresUpdate(currentIndex)) {
            return new UpdateIndexMutation(this, currentIndex);
        }

        // No action
        return undefined;
    }

    /**
     * @private
     * Tests to see if a Couchbase index matches this definition
     *
     * @param {CouchbaseIndex} index
     * @return {boolean}
     */
    isMatch(index) {
        if (this.is_primary) {
            // Consider any primary index a match, regardless of name
            return index.is_primary;
        } else {
            return ensureEscaped(this.name) === ensureEscaped(index.name);
        }
    }

    /**
     * @private
     * Tests to see if a Couchbase index requires updating
     *
     * @param {CouchbaseIndex} index
     * @return {boolean}
     */
    requiresUpdate(index) {
        return index.condition !== this.condition
            || !_.isEqual(index.index_key, this.index_key);
    }

    /**
     * Formats a CREATE INDEX query which makes this index
     *
     * @param {string} bucketName Name of the bucket to receive the index
     * @return {string}
     */
    getCreateStatement(bucketName) {
        let statement;

        if (this.is_primary) {
            statement = `CREATE PRIMARY INDEX ${ensureEscaped(this.name)}`;
            statement += ` ON ${ensureEscaped(bucketName)}`;
        } else {
            statement = `CREATE INDEX ${ensureEscaped(this.name)}`;
            statement += ` ON ${ensureEscaped(bucketName)}`;
            statement += ` (${this.index_key.join(', ')})`;

            if (this.condition) {
                statement += ` WHERE ${this.condition}`;
            }
        }

        let withClause = {
            defer_build: true,
        };

        if (this.num_replica) {
            // Don't include in the query string if not > 0
            withClause.num_replica = this.num_replica;
        }

        statement += ' WITH ' + JSON.stringify(withClause);

        return statement;
    }

    /**
     * @private
     * Limited subset of normalizations on conditions
     *
     * @param {string} condition
     * @return {string}
     */
    static normalizeCondition(condition) {
        if (!condition) {
            return condition;
        }

        return condition.replace(/'([^']*)'/g, '"$1"');
    }
}
