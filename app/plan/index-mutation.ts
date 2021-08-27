import { IndexDefinition } from "../definition";
import { IndexManager } from "../index-manager";
import { Logger } from "../options";

/**
 * Abstract base class for index mutations
 */
export abstract class IndexMutation {
    name: string;
    phase: number;

    constructor(public definition: IndexDefinition, name?: string) {
        this.definition = definition;
        this.name = name || definition.name;
        this.phase = 1;
    }

    abstract execute(indexManager: IndexManager, logger: Logger): Promise<void>;

    abstract print(logger: Logger): void;

    isSafe(): boolean {
        return true;
    }
}
