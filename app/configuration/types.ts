export enum PartitionStrategy {
    Hash = "HASH"
}

export enum ConfigurationType {
    Index = "index",
    Override = "override",
    NodeMap = "nodeMap",
}

export interface ConfigurationItem {
    type?: ConfigurationType;
}

export interface Lifecycle {
    drop?: boolean;
}

export interface Partition {
    exprs: string[];
    strategy?: PartitionStrategy;
    num_partition?: number;
}

export interface IndexConfigurationBase {
    is_primary?: boolean;
    index_key?: string | string[];
    condition?: string;
    partition?: Partition;
    manual_replica?: boolean;
    num_replica?: number;
    nodes?: string[];
    retain_deleted_xattr?: boolean;
    lifecycle?: Lifecycle;
}

export interface IndexConfiguration extends IndexConfigurationBase {
    type: ConfigurationType.Index;
    name: string;
}

export interface OverrideConfiguration extends IndexConfigurationBase {
    type: ConfigurationType.NodeMap;
    post_process?: string | (() => void);
}

export interface NodeMapConfiguration extends ConfigurationItem {
    type: ConfigurationType.NodeMap;
    map: { [key: string]: string }
}
