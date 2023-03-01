import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Composer, CST, DocumentOptions, LineCounter, ParseOptions, Parser, SchemaOptions } from 'yaml';
import { AstConverter } from './astConverter';
import { YamlDocument } from './yamlDocument';

export class YamlParser {
    static readonly commentTypeName = 'comment';
    static readonly flowCollectionTypeName = 'flow-collection';
    static readonly flowScalarTypeNames = ['alias', 'scalar', 'single-quoted-scalar', 'double-quoted-scalar'];
    static readonly documentTypeName = 'document';
    static readonly documentEndTypeName = 'doc-end';

    private textDocument: TextDocument;
    private yamlDocuments: YamlDocument[];

    constructor(textDocument: TextDocument) {
        this.textDocument = textDocument;
        this.yamlDocuments = [];
        this.parse();
    }

    public static isFlowScalarToken(token: CST.Token | null | undefined): token is CST.FlowScalar {
        return token != null && token !== undefined && YamlParser.flowScalarTypeNames.includes(token.type);
    }

    public static isFlowCollectionToken(token: CST.Token | null | undefined): token is CST.FlowCollection {
        return token != null && token !== undefined && token.type == YamlParser.flowCollectionTypeName;
    }

    public static isDocumentToken(token: CST.Token | null | undefined): token is CST.Document {
        return token != null && token !== undefined && token.type == YamlParser.documentTypeName;
    }

    public static isDocumentEndToken(token: CST.Token | null | undefined): token is CST.DocumentEnd {
        return token != null && token !== undefined && token.type == YamlParser.documentEndTypeName;
    }

    public getYamlDocuments(): YamlDocument[] {
        return this.yamlDocuments;
    }

    private parse(): void {
        const text = this.textDocument.getText();

        const options: ParseOptions & DocumentOptions & SchemaOptions = {
            strict: false,
            keepSourceTokens: true
        };

        const composer = new Composer(options);
        const lineCounter = new LineCounter();
        const lastLineStart = text.lastIndexOf('\n');
        const isLastLineEmpty = text.substring(lastLineStart + 1).trim().length === 0;

        const parser = isLastLineEmpty ? new Parser() : new Parser(lineCounter.addNewLine);
        const parsedTokens = parser.parse(text);
        const tokens: CST.Token[] = Array.from(parsedTokens);
        const syntaxErrorDiagnostics: Diagnostic[] = [];

        const composedTokens = composer.compose(tokens, true, text.length);
        for (const composedToken of composedTokens) {
            //get errors and warnings
            for (const error of composedToken.errors) {
                syntaxErrorDiagnostics.push(
                    Diagnostic.create(
                        this.createRangeItemFromOffset(error.pos[0], error.pos[1]),
                        error.message,
                        DiagnosticSeverity.Error,
                        undefined,
                        'Kubernetes YAML-Parser'
                    )
                );
            }
            for (const warning of composedToken.warnings) {
                syntaxErrorDiagnostics.push(
                    Diagnostic.create(
                        this.createRangeItemFromOffset(warning.pos[0], warning.pos[1]),
                        warning.message,
                        DiagnosticSeverity.Warning,
                        undefined,
                        'Kubernetes YAML-Parser'
                    )
                );
            }
            //convert yaml parser sytax tree (CST) to json language server syntax tree (AST)
            if (composedToken.contents) {
                const astConverter = new AstConverter();
                const astNode = astConverter.convert(composedToken.contents, undefined, composedToken, lineCounter);

                const yamlDocument = new YamlDocument(astNode, syntaxErrorDiagnostics);
                yamlDocument.range.startOffset = this.yamlDocuments.length == 0 ? 0 : composedToken.range[0];
                yamlDocument.range.endOffset = composedToken.range[2];
                yamlDocument.tokenMap = astConverter.getTokenMap();

                this.yamlDocuments.push(yamlDocument);
            }
        }
        this.parseCommentsFromCST(tokens);
    }

    private parseCommentsFromCST(tokens: CST.Token[]) {
        let yamlDocumentCounter = -1;
        for (const token of tokens) {
            if (YamlParser.isDocumentToken(token)) {
                //parse comments of root document token
                if (token.end !== undefined) {
                    this.getCommentsFromCstItems(token.end, yamlDocumentCounter);
                }

                //parse comments of other tokens in document token
                CST.visit(token, (item, path) => {
                    if (item.start.length > 0) {
                        this.getCommentsFromCstItems(item.start, yamlDocumentCounter);
                    }
                    if (
                        (YamlParser.isFlowScalarToken(item.value) ||
                            YamlParser.isFlowCollectionToken(item.value) ||
                            YamlParser.isDocumentEndToken(item.value)) &&
                        item.value.end !== undefined
                    ) {
                        this.getCommentsFromCstItems(item.value.end, yamlDocumentCounter);
                    }
                });
                yamlDocumentCounter++;
            }
            //parse comments before document token
            else if (token.type == YamlParser.commentTypeName) {
                this.createCommentRangeFromCstItem(token, yamlDocumentCounter);
            } else if (YamlParser.isDocumentEndToken(token) && token.end !== undefined) {
                this.getCommentsFromCstItems(token.end, yamlDocumentCounter);
            }
        }
    }

    private getCommentsFromCstItems(items: CST.SourceToken[], yamlDocumentCounter: number) {
        for (const item of items) {
            if (item.type == YamlParser.commentTypeName) {
                this.createCommentRangeFromCstItem(item, yamlDocumentCounter);
            }
        }
    }

    private createRangeItemFromOffset(start: number, end: number): Range {
        return Range.create(this.textDocument.positionAt(start), this.textDocument.positionAt(end));
    }

    private createCommentRangeFromCstItem(item: CST.SourceToken, yamlDocumentCounter: number) {
        //workaround if we encounter comment tokens before the first document token => append them to first document as well.
        const currentCounter = this.getCurrentDocumentCounter(yamlDocumentCounter);
        const range = this.createRangeItemFromOffset(item.offset, item.offset + item.source.length);
        this.yamlDocuments[currentCounter].comments.push(range);
    }

    private getCurrentDocumentCounter(yamlDocumentCounter: number) {
        return yamlDocumentCounter == -1 ? 0 : yamlDocumentCounter;
    }
}
