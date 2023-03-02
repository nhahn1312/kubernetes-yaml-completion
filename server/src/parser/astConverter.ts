import { ASTNode, ObjectASTNode, PropertyASTNode } from 'vscode-json-languageservice';
import {
    CST,
    Document,
    isMap,
    isNode,
    isPair,
    isScalar,
    isSeq,
    LineCounter,
    Node,
    Pair,
    Range,
    Scalar,
    YAMLMap,
    YAMLSeq
} from 'yaml';
import { IRange } from '../validation/validationResult';
import {
    ArrayASTNodeImpl,
    BooleanASTNodeImpl,
    NullASTNodeImpl,
    NumberASTNodeImpl,
    ObjectASTNodeImpl,
    PropertyASTNodeImpl,
    StringASTNodeImpl
} from './astJsonTypes';
import { YamlNode } from './cstYamlTypes';

export class AstConverter {
    private tokenMap: Map<ASTNode, CST.Token | CST.CollectionItem | undefined>;

    constructor() {
        this.tokenMap = new Map();
    }

    public convert(
        node: YamlNode,
        parent: ASTNode | undefined,
        parsedYamlDocument: Document,
        lineCounter: LineCounter
    ): ASTNode | undefined {
        let convertedNode: ASTNode | undefined = undefined;
        if (!node) {
            return convertedNode;
        } else if (isMap(node)) {
            convertedNode = this.convertMap(node, parent, parsedYamlDocument, lineCounter);
        } else if (isPair(node)) {
            convertedNode = this.convertPair(node, parent, parsedYamlDocument, lineCounter);
        } else if (isSeq(node)) {
            convertedNode = this.convertSeq(node, parent, parsedYamlDocument, lineCounter);
        } else if (isScalar(node)) {
            convertedNode = this.convertScalar(node, parent);
        }

        if (convertedNode) {
            this.tokenMap.set(convertedNode, node.srcToken);
        }

        return convertedNode;
    }

    public getTokenMap() {
        return this.tokenMap;
    }

    private convertMap(
        node: YAMLMap<unknown, unknown>,
        parent: ASTNode | undefined,
        parsedYamlDocument: any,
        lineCounter: LineCounter
    ): ASTNode | undefined {
        let range: IRange | null = null;
        if (!node.range && node.flow) {
            range = this.getRangeForFlowCollection(node, parent);
        } else if (node.range) {
            range = this.convertRange(node.range, parent);
        }

        if (range) {
            const astMapNode = new ObjectASTNodeImpl(parent, range.offset, range.length);

            for (const item of node.items) {
                if (isPair(item)) {
                    const propertyNode = this.convert(item, astMapNode, parsedYamlDocument, lineCounter);
                    astMapNode.properties.push(propertyNode as PropertyASTNode);
                }
            }
            return astMapNode;
        }
    }

    private convertRange(range: Range, parent?: ASTNode | undefined): IRange {
        let offset = range[0];
        if (parent && parent.type == 'property') {
            offset = parent.keyNode.offset + parent.keyNode.length + 1;
        }
        return {
            offset: offset,
            length: range[1] - offset
        };
    }

    private convertPair(
        node: Pair<unknown, unknown>,
        parent: ASTNode | undefined,
        parsedYamlDocument: any,
        lineCounter: LineCounter
    ): ASTNode | undefined {
        //get range from key and value nodes
        const keyNode: Node = node.key as Node;
        const valueNode: Node = node.value as Node;
        let start: number | null = null;
        let end: number | null = null;

        if (keyNode && keyNode.range) {
            start = keyNode.range[0];
            end = keyNode.range[1];
        }
        if (valueNode && valueNode.range) {
            end = valueNode.range[1];
        }

        if (start !== null && end !== null) {
            const range: IRange = this.convertRange([start, end, end]);
            const astStringNode = this.convert(
                keyNode,
                undefined,
                parsedYamlDocument,
                lineCounter
            ) as StringASTNodeImpl;
            const astPropertyNode = new PropertyASTNodeImpl(
                parent as ObjectASTNode,
                astStringNode,
                range.offset,
                range.length
            );

            astStringNode.parent = astPropertyNode;
            astPropertyNode.valueNode = this.convert(valueNode, astPropertyNode, parsedYamlDocument, lineCounter);
            return astPropertyNode;
        }
    }

    private convertSeq(
        node: YAMLSeq<unknown>,
        parent: ASTNode | undefined,
        parsedYamlDocument: any,
        lineCounter: LineCounter
    ): ASTNode | undefined {
        if (node.range) {
            let range;
            if (node.srcToken && node.srcToken.type == 'block-seq') {
                range = this.convertRange(node.range, parent);
            } else {
                range = this.convertRange(node.range);
            }
            const astArrayNode = new ArrayASTNodeImpl(parent, range.offset, range.length);
            for (const item of node.items) {
                if (isNode(item)) {
                    const convertedNode = this.convert(item, astArrayNode, parsedYamlDocument, lineCounter);
                    if (convertedNode) {
                        astArrayNode.items.push(convertedNode);
                    }
                }
            }
            return astArrayNode;
        }
    }

    private convertScalar(node: Scalar<unknown>, parent: ASTNode | undefined): ASTNode | undefined {
        if (node.range) {
            let result;
            const range = this.convertRange(node.range, parent);
            if (node.value === null) {
                return new NullASTNodeImpl(parent, range.offset, range.length);
            }

            switch (typeof node.value) {
                case 'string': {
                    result = new StringASTNodeImpl(parent, range.offset, range.length);
                    result.value = node.value;
                    return result;
                }
                case 'boolean': {
                    return new BooleanASTNodeImpl(parent, node.value, range.offset, range.length);
                }
                case 'number': {
                    result = new NumberASTNodeImpl(parent, range.offset, range.length);
                    result.value = node.value;
                    return result;
                }
                default: {
                    result = new StringASTNodeImpl(parent, range.offset, range.length);
                    result.value = node.source ? node.source : '';
                    return result;
                }
            }
        }
    }

    private getRangeForFlowCollection(map: YAMLMap, parent: ASTNode | undefined): IRange {
        let start = Number.MAX_SAFE_INTEGER;
        let end = 0;
        for (const item of map.items) {
            if (isPair(item)) {
                if (isNode(item.key)) {
                    if (item.key.range && item.key.range[0] < start) {
                        start = item.key.range[0];
                    }
                }
                if (isNode(item.value)) {
                    if (item.value.range && item.value.range[2] < start) {
                        end = item.value.range[2];
                    }
                }
            }
        }
        return this.convertRange([start, end, end], parent);
    }
}
