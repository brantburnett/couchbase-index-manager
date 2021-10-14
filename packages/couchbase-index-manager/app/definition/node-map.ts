import { IndexDefinition } from "./index-definition";

export interface StringMap {
    [key: string]: string;
}

/**
 * Stores a map of node aliases to their fully qualified name
 */
export class NodeMap {
    private _values: StringMap = {};

    constructor(configuration?: StringMap) {
        if (configuration) {
            this.merge(configuration);
        }
    }

    /**
     * Adds or overwrites mapped nodes
     */
    merge(hash: StringMap): void {
        this._values = {
            ...this._values,
            ...hash
        };
    }

    /**
     * Applies node mappings to an array of index definitions
     */
    apply(definition: Iterable<IndexDefinition>): void {
        for (const def of definition) {
            if (def.nodes) {
                def.nodes = def.nodes.map((node) => {
                    return this._values[node] || node;
                });
            }
        }
    }
}
