import { isString } from 'lodash';
import { IndexConfiguration } from '../configuration';

export abstract class IndexDefinitionBase {
    name: string;

    constructor(configuration: IndexConfiguration) {
        if (!configuration.name || !isString(configuration.name)) {
            throw new Error('Index definition does not have a \'name\'');
        }

        this.name = configuration.name;
    }
}
