import {isString} from 'lodash';

/**
 * @abstract
 */
export class IndexDefinitionBase {
    name;
    
    /**
     * @param {!{name: !string}} hashMap
     */
    constructor(hashMap) {
        if (!hashMap.name || !isString(hashMap.name)) {
            throw new Error('Index definition does not have a \'name\'');
        }

        this.name = hashMap.name;
    }
}
