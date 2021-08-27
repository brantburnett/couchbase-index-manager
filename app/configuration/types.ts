export enum PartitionStrategy {
    Hash = "HASH"
}

export enum ConfigurationType {
    Index = "index",
    Override = "override",
    NodeMap = "nodeMap",
}

export interface Lifecycle {
    drop?: boolean;
}

export interface Partition {
    exprs: string[];
    strategy?: PartitionStrategy;
    num_partition?: number;
}

export type PostProcessHandler = (this: IndexConfigurationBase, require: NodeRequire, process: NodeJS.Process) => void;

export interface IndexConfigurationBase {
    name?: string;
    is_primary?: boolean;
    index_key?: string | string[];
    condition?: string;
    partition?: Partition;
    manual_replica?: boolean;
    num_replica?: number;
    nodes?: string[];
    retain_deleted_xattr?: boolean;
    lifecycle?: Lifecycle;
    post_process?: string | PostProcessHandler;
}

export interface IndexConfiguration extends Exclude<IndexConfigurationBase, "post_process"> {
    type: ConfigurationType.Index;
}

export interface OverrideConfiguration extends IndexConfigurationBase {
    type: ConfigurationType.Override;
}

export interface NodeMapConfiguration {
    type: ConfigurationType.NodeMap;
    map: { [key: string]: string }
}

export type ConfigurationItem = IndexConfiguration | OverrideConfiguration | NodeMapConfiguration;

export function isIndex(item: ConfigurationItem): item is IndexConfiguration {
    return item.type === ConfigurationType.Index;
}

export function isOverride(item: ConfigurationItem): item is OverrideConfiguration {
    return item.type === ConfigurationType.Override;
}

export function isNodeMap(item: ConfigurationItem): item is NodeMapConfiguration {
    return item.type === ConfigurationType.NodeMap;
}
