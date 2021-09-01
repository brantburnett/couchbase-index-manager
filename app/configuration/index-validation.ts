import _ from "lodash";
import { IndexConfigurationBase } from "./types";

export type ValidatorSetBase<T> = {
    [key in keyof T]?: (this: T, val: any) => void;
}

export interface ValidatorSetPostValidate<T> {
    post_validate?: (this: T) => void;
}

export type ValidatorSet<T> = ValidatorSetBase<T> & ValidatorSetPostValidate<T>;

/**
 * Validators for the incoming index properties.
 */
export const IndexValidators: ValidatorSet<IndexConfigurationBase> = {
    is_primary: function(val) {
        if (val !== undefined && !_.isBoolean(val)) {
            throw new Error('is_primary must be a boolean');
        }
    },
    index_key: function(val) {
        if (val === undefined) {
            return;
        }

        if (!_.isArrayLike(val)) {
            val = [val];
        }

        for (const v of val) {
            if (!_.isString(v)) {
                throw new Error(
                    'index_key must be a string or array of strings');
            }
        }
    },
    condition: function(val) {
        if (val !== undefined && !_.isString(val)) {
            throw new Error('condition must be a string');
        }
    },
    partition: function(val) {
        if (val === undefined) {
            return;
        }

        if (!val.exprs || !_.isObjectLike(val.exprs)) {
            throw new Error('Invalid partition');
        }

        _.forOwn(val.exprs, (v) => {
            if (!_.isString(v)) {
                throw new Error('Invalid partition');
            }
        });
    },
    nodes: function(val) {
        if (val !== undefined) {
            if (!_.isArray(val)) {
                throw new Error('nodes must be an array of strings');
            }

            val.forEach((v: any) => {
                if (!_.isString(v)) {
                    throw new Error(
                        'nodes must be an array of strings');
                }
            });
        }
    },
    manual_replica: function(val) {
        if (val !== undefined && !_.isBoolean(val)) {
            throw new Error('manual_replica must be a boolean');
        }
    },
    num_replica: function(val: any){
        if (val !== undefined && !_.isNumber(val)) {
            throw new Error('num_replica must be a number');
        }
    },
    retain_deleted_xattr: function(val) {
        if (val !== undefined && !_.isBoolean(val)) {
            throw new Error('retain_deleted_xattr must be a boolean');
        }
    },
    lifecycle: function(val) {
        if (val !== undefined && !_.isObjectLike(val)) {
            throw new Error('lifecycle is invalid');
        }
    },
    post_validate: function(): void {
        if (!!this.scope !== !!this.collection) {
            throw new Error('if scope is supplied collection must also be supplied');
        }

        if (!this.is_primary) {
            const isDrop = this.lifecycle && this.lifecycle.drop;

            if (!isDrop && (!this.index_key || this.index_key.length === 0)) {
                throw new Error('index_key must include at least one key');
            }
        } else {
            if (this.index_key && this.index_key.length > 0) {
                throw new Error('index_key is not allowed for a primary index');
            }

            if (this.condition) {
                throw new Error('condition is not allowed for a primary index');
            }
        }

        if (this.partition && this.manual_replica) {
            throw new Error(
                'manual_replica is not supported on partioned indexes');
        }

        if (!this.partition && this.nodes) {
            // Validate nodes and num_replica values
            if (this.nodes.length !== (this.num_replica ?? 0) + 1) {
                throw new Error('mismatch between num_replica and nodes');
            }
        }
    },
};
