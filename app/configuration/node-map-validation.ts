import { forOwn, isObjectLike, isString } from "lodash";
import { NodeMapConfiguration } from "./types";

export interface NodeMapValidatorSet {
    [key: string]: (this: NodeMapConfiguration, val: any) => void;
}

/**
 * Validators for the incoming node map properties.
 */
export const NodeMapValidators: NodeMapValidatorSet = {
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
