import { ASTNode, Diagnostic, Position, Range } from 'vscode-json-languageservice';
import { CST } from 'yaml';
import { JSONDocument } from './jsonDocument';

export class YamlDocument extends JSONDocument {
    public tokenMap: Map<ASTNode, CST.Token | CST.CollectionItem | undefined>;
    public range: {
        startOffset: number;
        endOffset: number;
    };

    constructor(root: ASTNode | undefined, syntaxErrors: Diagnostic[] = [], comments: Range[] = []) {
        super(root, syntaxErrors, comments);
        this.tokenMap = new Map();
        this.range = {
            startOffset: -1,
            endOffset: -1
        };
    }

    public isOffsetInDocument(offset: number) {
        return offset >= this.range.startOffset && offset <= this.range.endOffset;
    }

    public getCstTokenFromAstNode(node: ASTNode): CST.Token | CST.CollectionItem | undefined {
        for (const entry of this.tokenMap.entries()) {
            if (entry[0] === node) {
                return entry[1];
            }
        }
        return undefined;
    }

    public getCstTokenFromOffset(offset: number): CST.Token | CST.CollectionItem | undefined {
        const astNode = this.getNodeFromOffset(offset, true);
        if (!astNode) {
            return undefined;
        }
        return this.getCstTokenFromAstNode(astNode);
    }

    public isInComment(pos: Position) {
        for (const comment of this.comments) {
            if (
                pos.line >= comment.start.line &&
                pos.line <= comment.end.line &&
                pos.character >= comment.start.character &&
                pos.character <= comment.end.character
            ) {
                return true;
            }
        }
        return false;
    }
}
