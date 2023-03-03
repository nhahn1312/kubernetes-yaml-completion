import { ASTNode, JSONPath, ObjectASTNode, SchemaDraft } from 'vscode-json-languageservice';
import * as Json from 'jsonc-parser';
import { isBoolean } from './objects';
import { Diagnostic } from 'vscode-languageserver';
import { JSONDocument } from '../parser/jsonDocument';
import { JSONSchema, JSONSchemaRef } from '../types/jsonSchema';

export class ValidationUtil {
    private static readonly schemaDraftFromId: { [id: string]: SchemaDraft } = {
        'http://json-schema.org/draft-03/schema#': SchemaDraft.v3,
        'http://json-schema.org/draft-04/schema#': SchemaDraft.v4,
        'http://json-schema.org/draft-06/schema#': SchemaDraft.v6,
        'http://json-schema.org/draft-07/schema#': SchemaDraft.v7,
        'https://json-schema.org/draft/2019-09/schema': SchemaDraft.v2019_09,
        'https://json-schema.org/draft/2020-12/schema': SchemaDraft.v2020_12
    };

    public static newJSONDocument(root: ASTNode, diagnostics: Diagnostic[] = []) {
        return new JSONDocument(root, diagnostics, []);
    }

    public static getNodeValue(node: ASTNode): any {
        return Json.getNodeValue(node);
    }

    public static getNodePath(node: ASTNode): JSONPath {
        return Json.getNodePath(node);
    }

    public static contains(node: ASTNode, offset: number, includeRightBound = false): boolean {
        return (
            (offset >= node.offset && offset < node.offset + node.length) ||
            (includeRightBound && offset === node.offset + node.length)
        );
    }

    public static getSchemaDraft(schema: JSONSchema, fallBack = SchemaDraft.v2020_12) {
        const schemaId = schema.$schema;
        if (schemaId) {
            return ValidationUtil.schemaDraftFromId[schemaId] ?? fallBack;
        }
        return fallBack;
    }

    public static asSchema(schema: JSONSchemaRef): JSONSchema;
    public static asSchema(schema: JSONSchemaRef | undefined): JSONSchema | undefined;
    public static asSchema(schema: JSONSchemaRef | undefined): JSONSchema | undefined {
        if (isBoolean(schema)) {
            return schema ? {} : { not: {} };
        }
        return schema;
    }

    //nhahn[add]: method to find property by key
    public static getPropertyValueByKey(
        node: ObjectASTNode,
        key: string
    ): string | number | boolean | null | undefined {
        for (const property of node.properties) {
            if (property.keyNode.value == key) {
                return property.valueNode?.value;
            }
        }
    }

    //nhahn[add]: method to find string property
    public static getStringPropertyValue(node: ObjectASTNode, key: string): string | undefined {
        const value = ValidationUtil.getPropertyValueByKey(node, key);
        if (typeof value === 'string') {
            return value;
        }
        return undefined;
    }
}
