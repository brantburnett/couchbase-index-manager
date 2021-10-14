import { forOwn, isObjectLike, isString } from "lodash";
import { ValidatorSet } from "./index-validation";
import { NodeMapConfiguration } from "./types";

/**
 * Validators for the incoming node map properties.
 */
export const NodeMapValidators: ValidatorSet<NodeMapConfiguration> = {
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
