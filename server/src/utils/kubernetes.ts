export class KubernetesValidationUtil {
    public static getGroupVersion(group: string, version: string) {
        return group ? `${group}/${version}` : version;
    }
}
