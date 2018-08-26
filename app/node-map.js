import {extend, forOwn, isObjectLike, isString} from 'lodash';

/**
 * Validators for the incoming node map properties.
 */
export const NodeMapValidators = {
    map: function(map) {
        if (!isObjectLike(map)) {
            throw new Error('Invalid node map');
        }

        forOwn(map, (v) => {
            if (!isString(v)) {
                throw new Error('Invalid node map');
            }
        });
    },
};

/**
 * Stores a map of node aliases to their fully qualified name
 */
export class NodeMap {
    /**
     * @param {Object<string, string>} [hash]
     */
    constructor(hash) {
        this._values = {};

        if (hash) {
            this.merge(hash);
        }
    }

    /**
     * Adds or overwrites mapped nodes
     *
     * @param {!Object<string, string>} hash
     */
    merge(hash) {
        extend(this._values, hash);
    }

    /**
     * Applies node mappings to an array of index definitions
     *
     * @param {Iterable.<IndexDefinition>} definition
     */
    apply(definition) {
        definition.forEach((def) => {
            if (def.nodes) {
                def.nodes = def.nodes.map((node) => {
                    return this._values[node] || node;
                });
            }
        });
    }
}
