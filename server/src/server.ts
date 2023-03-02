/* eslint-disable no-mixed-spaces-and-tabs */
import { createConnection, TextDocuments, ProposedFeatures } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { YamlLanguageServer } from './yamlLanguageServer';
import path from 'path';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

//get absolute path of server dir to parse schema files accordingly
const baseUri = path.resolve(__dirname, '../');

YamlLanguageServer.getInstance(connection, documents, baseUri);
