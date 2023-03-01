import { ASTNode, SchemaDraft } from 'vscode-json-languageservice';
import { JSONSchema } from '../types/jsonSchema';
import { ValidationUtil } from '../utils/validation';

export interface ISchemaCollector {
    schemas: IApplicableSchema[];
    add(schema: IApplicableSchema): void;
    merge(other: ISchemaCollector): void;
    include(node: ASTNode): boolean;
    newSub(): ISchemaCollector;
}

export interface IApplicableSchema {
    node: ASTNode;
    inverted?: boolean;
    schema: JSONSchema;
}

export interface IEvaluationContext {
    readonly schemaDraft: SchemaDraft;
}

export class EvaluationContext implements IEvaluationContext {
    constructor(public readonly schemaDraft: SchemaDraft) {}
}

export class SchemaCollector implements ISchemaCollector {
    schemas: IApplicableSchema[] = [];
    constructor(private focusOffset = -1, private exclude?: ASTNode) {}
    add(schema: IApplicableSchema) {
        this.schemas.push(schema);
    }
    merge(other: ISchemaCollector) {
        Array.prototype.push.apply(this.schemas, other.schemas);
    }
    include(node: ASTNode) {
        return (this.focusOffset === -1 || ValidationUtil.contains(node, this.focusOffset)) && node !== this.exclude;
    }
    newSub(): ISchemaCollector {
        return new SchemaCollector(-1, this.exclude);
    }
}

export class NoOpSchemaCollector implements ISchemaCollector {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private constructor() {}
    get schemas() {
        return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    add(_schema: IApplicableSchema) {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    merge(_other: ISchemaCollector) {}
    include(_node: ASTNode) {
        return true;
    }
    newSub(): ISchemaCollector {
        return this;
    }

    static instance = new NoOpSchemaCollector();
}
