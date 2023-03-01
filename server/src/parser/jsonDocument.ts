import { ASTNode, JSONSchema, Range, SchemaDraft } from 'vscode-json-languageservice';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    EvaluationContext,
    IApplicableSchema,
    NoOpSchemaCollector,
    SchemaCollector
} from '../validation/schemaCollector';
import { ValidationResult } from '../validation/validationResult';
import * as Json from 'jsonc-parser';
import { ValidationUtil } from '../utils/validation';
import { SchemaValidator } from '../validation/schemaValidator';

export class JSONDocument {
    constructor(
        public readonly root: ASTNode | undefined,
        public readonly syntaxErrors: Diagnostic[] = [],
        public readonly comments: Range[] = []
    ) {}

    public getNodeFromOffset(offset: number, includeRightBound = false): ASTNode | undefined {
        if (this.root) {
            return <ASTNode>Json.findNodeAtOffset(this.root, offset, includeRightBound);
        }
        return undefined;
    }

    public visit(visitor: (node: ASTNode) => boolean): void {
        if (this.root) {
            const doVisit = (node: ASTNode): boolean => {
                let ctn = visitor(node);
                const children = node.children;
                if (Array.isArray(children)) {
                    for (let i = 0; i < children.length && ctn; i++) {
                        ctn = doVisit(children[i]);
                    }
                }
                return ctn;
            };
            doVisit(this.root);
        }
    }

    public validate(
        textDocument: TextDocument,
        schema: JSONSchema | undefined,
        severity: DiagnosticSeverity = DiagnosticSeverity.Warning,
        schemaDraft?: SchemaDraft
    ): Diagnostic[] | undefined {
        if (this.root && schema) {
            const validationResult = new ValidationResult();
            SchemaValidator.validate(
                this.root,
                schema,
                validationResult,
                NoOpSchemaCollector.instance,
                new EvaluationContext(schemaDraft ?? ValidationUtil.getSchemaDraft(schema))
            );
            return validationResult.problems.map((p) => {
                const range = Range.create(
                    textDocument.positionAt(p.location.offset),
                    textDocument.positionAt(p.location.offset + p.location.length)
                );
                return Diagnostic.create(range, p.message, p.severity ?? severity, p.code);
            });
        }
        return undefined;
    }

    public getMatchingSchemas(schema: JSONSchema, focusOffset = -1, exclude?: ASTNode): IApplicableSchema[] {
        if (this.root && schema) {
            const matchingSchemas = new SchemaCollector(focusOffset, exclude);
            const schemaDraft = ValidationUtil.getSchemaDraft(schema);
            const context = new EvaluationContext(schemaDraft);
            SchemaValidator.validate(this.root, schema, new ValidationResult(), matchingSchemas, context);
            return matchingSchemas.schemas;
        }
        return [];
    }
}
