import { JSONSchema, KubernetesGroupVersionKind } from '../types/jsonSchema';

export interface KubernetesResourceInfo {
    groupVersion: string;
    kind: string;
}

export class KubernetesValidationUtil {
    public static getGroupVersion(group: string, version: string) {
        return group ? `${group}/${version}` : version;
    }

    public static getGroupVersionKindFromSchema(schema: JSONSchema): KubernetesResourceInfo | undefined {
        const groupVersionKindArray = schema['x-kubernetes-group-version-kind'];
        if (groupVersionKindArray) {
            const groupVersionKind = groupVersionKindArray[0];
            const groupVersion = KubernetesValidationUtil.getGroupVersion(
                groupVersionKind.group,
                groupVersionKind.version
            );
            return {
                groupVersion: groupVersion,
                kind: groupVersionKind.kind
            };
        }
        return undefined;
    }
}
