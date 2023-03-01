import {
    ArrayASTNode,
    ASTNode,
    BooleanASTNode,
    NullASTNode,
    NumberASTNode,
    ObjectASTNode,
    PropertyASTNode,
    StringASTNode
} from 'vscode-json-languageservice';

export abstract class ASTNodeImpl {
    public abstract readonly type: 'object' | 'property' | 'array' | 'number' | 'boolean' | 'null' | 'string';

    public offset: number;
    public length: number;
    public parent: ASTNode | undefined;

    constructor(parent: ASTNode | undefined, offset: number, length = 0) {
        this.offset = offset;
        this.length = length;
        this.parent = parent;
    }

    public get children(): ASTNode[] {
        return [];
    }

    public toString(): string {
        return (
            'type: ' +
            this.type +
            ' (' +
            this.offset +
            '/' +
            this.length +
            ')' +
            (this.parent ? ' parent: {' + this.parent.toString() + '}' : '')
        );
    }
}

export class NullASTNodeImpl extends ASTNodeImpl implements NullASTNode {
    public type = 'null' as const;
    public value = null;
    constructor(parent: ASTNode | undefined, offset: number, length = 0) {
        super(parent, offset, length);
    }
}

export class BooleanASTNodeImpl extends ASTNodeImpl implements BooleanASTNode {
    public type = 'boolean' as const;
    public value: boolean;

    constructor(parent: ASTNode | undefined, boolValue: boolean, offset: number, length = 0) {
        super(parent, offset, length);
        this.value = boolValue;
    }
}

export class ArrayASTNodeImpl extends ASTNodeImpl implements ArrayASTNode {
    public type = 'array' as const;
    public items: ASTNode[];

    constructor(parent: ASTNode | undefined, offset: number, length = 0) {
        super(parent, offset, length);
        this.items = [];
    }

    public get children(): ASTNode[] {
        return this.items;
    }
}

export class NumberASTNodeImpl extends ASTNodeImpl implements NumberASTNode {
    public type = 'number' as const;
    public isInteger: boolean;
    public value: number;

    constructor(parent: ASTNode | undefined, offset: number, length = 0) {
        super(parent, offset, length);
        this.isInteger = true;
        this.value = Number.NaN;
    }
}

export class StringASTNodeImpl extends ASTNodeImpl implements StringASTNode {
    public type = 'string' as const;
    public value: string;

    constructor(parent: ASTNode | undefined, offset: number, length = 0) {
        super(parent, offset, length);
        this.value = '';
    }
}

export class PropertyASTNodeImpl extends ASTNodeImpl implements PropertyASTNode {
    public type = 'property' as const;
    public keyNode: StringASTNode;
    public valueNode?: ASTNode;
    public colonOffset: number;

    constructor(parent: ObjectASTNode | undefined, keyNode: StringASTNode, offset: number, length = 0) {
        super(parent, offset, length);
        this.colonOffset = -1;
        this.keyNode = keyNode;
    }

    public get children(): ASTNode[] {
        return this.valueNode ? [this.keyNode, this.valueNode] : [this.keyNode];
    }
}

export class ObjectASTNodeImpl extends ASTNodeImpl implements ObjectASTNode {
    public type = 'object' as const;
    public properties: PropertyASTNode[];

    constructor(parent: ASTNode | undefined, offset: number, length = 0) {
        super(parent, offset, length);

        this.properties = [];
    }

    public get children(): ASTNode[] {
        return this.properties;
    }
}
