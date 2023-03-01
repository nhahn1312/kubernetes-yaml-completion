import { ASTNode, Range } from 'vscode-json-languageservice/lib/umd/jsonLanguageTypes';
import { Node, Pair, CST } from 'yaml';

export interface YamlParseError {
    pos: Range;
    message: string;
}

export interface STtokenMapValue {
    yamlCstToken: CST.Token | CST.CollectionItem | undefined;
    yamlAstToken: ASTNode;
}

export type YamlNode = Node | Pair;
export type CstCollection = CST.BlockMap | CST.BlockSequence | CST.FlowCollection;
export type CstScalar = CST.BlockScalar | CST.FlowScalar;
