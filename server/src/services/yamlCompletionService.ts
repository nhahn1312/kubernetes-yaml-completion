import { ASTNode, CompletionItem, CompletionsCollector, ObjectASTNode, TextEdit } from 'vscode-json-languageservice';
import { JSONSchema, JSONSchemaRef } from 'vscode-json-languageservice/lib/umd/jsonSchema';
import { CompletionList } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { YamlDocument } from '../parser/yamlDocument';
import { AstUtils } from '../utils/ast';
import { isDefined } from '../utils/objects';
import { extendedRegExp } from '../utils/strings';
import { JSONSchemaService, ResolvedSchema } from './jsonSchemaService';

export class CompletionsCollectorImpl implements CompletionsCollector {
    private result: CompletionList;

    constructor() {
        this.result = {
            items: [],
            isIncomplete: false
        };
    }

    add(suggestion: CompletionItem): void {
        const exists = this.result.items.find((item) => item.label === suggestion.label);
        if (!exists) {
            this.result.items.push(suggestion);
        }
    }
    error(message: string): void {
        console.error(message);
    }
    setAsIncomplete(): void {
        this.result.isIncomplete = true;
    }
    getNumberOfProposals(): number {
        return this.result.items.length;
    }
    getCompletionList(): CompletionList {
        return this.result;
    }
}

export class YamlCompletionService {
    constructor(private schemaService: JSONSchemaService) {}

    public doResolve(completionItem: CompletionItem): Promise<CompletionItem> {
        return Promise.resolve(completionItem);
    }

    public doComplete(document: TextDocument, position: Position, doc: YamlDocument): Thenable<CompletionList | null> {
        const completionsCollector: CompletionsCollectorImpl = new CompletionsCollectorImpl();

        const isInComment = doc.isInComment(position);
        //dont autocomplete in comments
        if (isInComment) {
            return Promise.resolve(completionsCollector.getCompletionList());
        }

        const offset = document.offsetAt(position);
        const node = doc.getNodeFromOffset(offset, true);

        return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
            if (node && schema) {
                if (node.type === 'object') {
                    this.getPropertyCompletions(node, doc, completionsCollector, schema, position);
                }

                this.getValueCompletions(node, doc, offset, completionsCollector, schema, position);
            }

            return completionsCollector.getCompletionList();
        });
    }
    private getValueCompletions(
        node: ASTNode | undefined,
        doc: YamlDocument,
        offset: number,
        completionsCollector: CompletionsCollectorImpl,
        schema: ResolvedSchema,
        position: Position
    ) {
        let parentKey: string | undefined = undefined;
        let valueNode: ASTNode | undefined = undefined;

        if (node && ['string', 'number', 'boolean', 'null'].indexOf(node.type) != -1) {
            valueNode = node;
            node = node.parent;
        }

        if (node && node.type === 'property') {
            const valueNode = node.valueNode;
            if (valueNode && offset > valueNode.offset + valueNode.length) {
                return;
            }
            parentKey = node.keyNode.value;
            node = node.parent;
        }

        //TODO: investigate array of object completion
        if (node && (isDefined(parentKey) || node.type === 'array')) {
            const matchingSchemas = doc.getMatchingSchemas(schema.schema, node.offset, valueNode);
            const typeMap: Map<string, boolean> = new Map();

            for (const matchingSchema of matchingSchemas) {
                if (matchingSchema.node === node && !matchingSchema.inverted && matchingSchema.schema) {
                    if (
                        node.type === 'array' &&
                        matchingSchema.schema.items &&
                        !Array.isArray(matchingSchema.schema.items)
                    ) {
                        //node is array value
                        this.collectSchemaValueCompletions(
                            matchingSchema.schema.items,
                            completionsCollector,
                            typeMap,
                            position
                        );
                    } else if (isDefined(parentKey)) {
                        let propertyFound = false;
                        if (matchingSchema.schema.properties) {
                            const propertySchema = matchingSchema.schema.properties[parentKey];
                            if (propertySchema) {
                                propertyFound = true;
                                //node is property value
                                this.collectSchemaValueCompletions(
                                    propertySchema,
                                    completionsCollector,
                                    typeMap,
                                    position
                                );
                            }
                        }
                        if (matchingSchema.schema.patternProperties && !propertyFound) {
                            for (const pattern of Object.keys(matchingSchema.schema.patternProperties)) {
                                const regex = extendedRegExp(pattern);
                                if (regex && regex.test(parentKey)) {
                                    propertyFound = true;
                                    const propertySchema = matchingSchema.schema.patternProperties[pattern];
                                    //node is property value
                                    this.collectSchemaValueCompletions(
                                        propertySchema,
                                        completionsCollector,
                                        typeMap,
                                        position
                                    );
                                }
                            }
                        }
                        if (matchingSchema.schema.additionalProperties && !propertyFound) {
                            const propertySchema = matchingSchema.schema.additionalProperties;
                            this.collectSchemaValueCompletions(propertySchema, completionsCollector, typeMap, position);
                        }
                    }
                }
            }

            if (typeMap.has('boolean')) {
                completionsCollector.add({
                    label: 'true'
                });
                completionsCollector.add({
                    label: 'false'
                });
            }
            if (typeMap.has('null')) {
                completionsCollector.add({
                    label: 'null'
                });
            }
        }
    }

    private collectSchemaValueCompletions(
        schema: JSONSchemaRef,
        collector: CompletionsCollectorImpl,
        typeMap: Map<string, boolean>,
        position: Position
    ): void {
        if (typeof schema === 'object') {
            //add completion for enum and const values
            this.collectEnumValueCompletions(schema, collector, position);
            //TODO: add default and examples to completion
            this.collectTypeValueCompletions(schema, typeMap);

            const itemSpecifiers = [schema.anyOf, schema.allOf, schema.oneOf];

            for (const itemSpecifier of itemSpecifiers) {
                if (Array.isArray(itemSpecifier)) {
                    for (const elem of itemSpecifier) {
                        this.collectSchemaValueCompletions(elem, collector, typeMap, position);
                    }
                }
            }
        }
    }

    private collectTypeValueCompletions(schema: JSONSchema, typeMap: Map<string, boolean>) {
        if (isDefined(schema.const) || Array.isArray(schema.enum)) {
            return;
        }
        let types = schema.type;
        const typesToCollect = ['boolean', 'null'];
        if (types) {
            if (!Array.isArray(types)) {
                types = [types];
            }
            for (const type of types) {
                if (typesToCollect.indexOf(type) != -1) {
                    typeMap.set(type, true);
                }
            }
        }
    }

    private collectEnumValueCompletions(schema: JSONSchema, collector: CompletionsCollectorImpl, position: Position) {
        if (isDefined(schema.const)) {
            collector.add({
                label: this.getLabelForValue(schema.const)
            });
        }

        if (Array.isArray(schema.enum)) {
            for (const enumValue of schema.enum) {
                collector.add({
                    label: this.getLabelForValue(enumValue)
                });
            }
        }
    }

    private getPropertyCompletions(
        node: ObjectASTNode,
        doc: YamlDocument,
        completionsCollector: CompletionsCollector,
        schema: ResolvedSchema,
        position: Position
    ) {
        const matchingSchemas = doc.getMatchingSchemas(schema.schema, node.offset);
        for (const matchingSchema of matchingSchemas) {
            if (matchingSchema.node === node && !matchingSchema.inverted) {
                const properties = matchingSchema.schema.properties;
                if (properties) {
                    Object.keys(properties).forEach((key: string) => {
                        const propertySchema = properties[key];

                        //collect properties that are not in the yaml node right now
                        if (
                            !AstUtils.hasProperty(node, key) &&
                            typeof propertySchema === 'object' &&
                            !propertySchema.deprecationMessage &&
                            !propertySchema.doNotSuggest
                        ) {
                            //add property proposal
                            completionsCollector.add({
                                textEdit: this.getPropertyTextEdit(key, position),
                                label: key
                            });
                        }
                    }, this);
                }
            }
        }
    }

    private getLabelForValue(value: any) {
        return JSON.stringify(value);
    }

    private getPropertyTextEdit(label: string, position: Position): TextEdit {
        position.character += 1;
        return TextEdit.insert(position, label + ': ');
    }
}
