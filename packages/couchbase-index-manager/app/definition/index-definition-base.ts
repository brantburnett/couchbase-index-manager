import { isString } from 'lodash';
import { IndexConfiguration } from '../configuration';
import { DEFAULT_COLLECTION, DEFAULT_SCOPE } from '../index-manager';

export abstract class IndexDefinitionBase {
    readonly name: string;
    readonly scope: string;
    readonly collection: string;

    constructor(configuration: IndexConfiguration) {
        if (!configuration.name || !isString(configuration.name)) {
            throw new Error('Index definition does not have a \'name\'');
        }

        this.name = configuration.name;
        this.scope = configuration.scope ?? DEFAULT_SCOPE;
        this.collection = configuration.collection ?? DEFAULT_COLLECTION;
    }
}
