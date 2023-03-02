import { JSONSchema as ParentSchema } from 'vscode-json-languageservice';

export type JSONSchemaRef = JSONSchema | boolean;

export interface JSONSchema extends ParentSchema {
    'x-kubernetes-group-version-kind'?: [KubernetesGroupVersionKind];
}

//nhahn[add]: type for 'x-kubernetes-group-version-kind'
export interface KubernetesGroupVersionKind {
    group: string;
    kind: string;
    version: string;
}

export interface JSONSchemaMap {
    [name: string]: JSONSchemaRef;
}
