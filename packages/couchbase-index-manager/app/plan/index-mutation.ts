import { IndexDefinition } from "../definition";
import { DEFAULT_COLLECTION, DEFAULT_SCOPE, IndexManager } from "../index-manager";
import { Logger } from "../options";

/**
 * Abstract base class for index mutations
 */
export abstract class IndexMutation {
    readonly name: string;
    readonly scope: string;
    readonly collection: string;
    phase: number;

    /**
     * A display name for the index which includes the scope and collection if non-default.
     */
    get displayName(): string {
        if (this.scope === DEFAULT_SCOPE && this.collection === DEFAULT_COLLECTION) {
            return this.name;
        } else {
            return `${this.scope}.${this.collection}.${this.name}`;
        }
    }

    constructor(public definition: IndexDefinition, name?: string) {
        this.definition = definition;
        this.name = name || definition.name;
        this.scope = definition.scope;
        this.collection = definition.collection;
        this.phase = 1;
    }

    abstract execute(indexManager: IndexManager, logger: Logger): Promise<void>;

    abstract print(logger: Logger): void;

    isSafe(): boolean {
        return true;
    }
}
