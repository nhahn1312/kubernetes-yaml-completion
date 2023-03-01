import { ObjectASTNode, PropertyASTNode } from 'vscode-json-languageservice';

export class AstUtils {
    public static hasProperty(objectNode: ObjectASTNode, propertyName: string): boolean {
        return objectNode.properties.some(function (prop: PropertyASTNode) {
            const propChildren = prop.children;
            return propertyName === propChildren[0].value;
        });
    }
}
