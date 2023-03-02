/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CompletionItem,
    CompletionList,
    Diagnostic,
    DocumentLanguageSettings,
    JSONLanguageStatus,
    LanguageServiceParams,
    LanguageSettings,
    MatchingSchema,
    Position,
    TextDocument
} from 'vscode-json-languageservice';
import { JSONDocument } from '../parser/jsonDocument';
import { YamlDocument } from '../parser/yamlDocument';
import { YamlParser } from '../parser/yamlParser';
import { JSONSchema } from '../types/jsonSchema';
import { schemaContributions } from '../types/jsonSchemaConfig';
import { JSONSchemaService } from './jsonSchemaService';
import { JSONValidation } from './jsonValidationService';
import { YamlCompletionService } from './yamlCompletionService';

export interface IYamlLanguageService {
    configureKubernetes(params: KubernetesParams): void;
    configure(settings: LanguageSettings): void;
    doValidation(
        document: TextDocument,
        jsonDocument: YamlDocument,
        documentSettings?: DocumentLanguageSettings,
        schema?: JSONSchema
    ): Thenable<Diagnostic[]>;
    parseYamlDocument(document: TextDocument): YamlDocument[];
    resetSchema(uri: string): boolean;
    getMatchingSchemas(
        document: TextDocument,
        jsonDocument: JSONDocument,
        schema?: JSONSchema
    ): Thenable<MatchingSchema[]>;
    getLanguageStatus(document: TextDocument, jsonDocument: JSONDocument): JSONLanguageStatus;
    doResolve(item: CompletionItem): Thenable<CompletionItem>;
    doComplete(document: TextDocument, position: Position, doc: YamlDocument): Thenable<CompletionList | null>;
}

export interface KubernetesParams {
    resourceInfo?: Map<string, string>;
}

export class YamlLanguageService implements IYamlLanguageService {
    private schemaService: JSONSchemaService;
    private completionService: YamlCompletionService;
    private validationService: JSONValidation;

    constructor(params: LanguageServiceParams) {
        this.schemaService = new JSONSchemaService(params.schemaRequestService, params.workspaceContext);
        this.schemaService.setSchemaContributions(schemaContributions);

        this.completionService = new YamlCompletionService(this.schemaService);
        this.validationService = new JSONValidation(this.schemaService);
    }

    public configure(settings: LanguageSettings) {
        this.schemaService.clearExternalSchemas();
        if (settings.schemas) {
            settings.schemas.forEach((settings) => {
                this.schemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
            });
        }
        this.validationService.configure(settings);
    }

    public configureKubernetes(params: KubernetesParams) {
        this.schemaService.setResourceInfo(params.resourceInfo);
    }

    doValidation(
        document: TextDocument,
        jsonDocument: YamlDocument,
        documentSettings?: DocumentLanguageSettings | undefined,
        schema?: JSONSchema | undefined
    ): Thenable<Diagnostic[]> {
        return this.validationService.doValidation(document, jsonDocument, documentSettings, schema);
    }
    parseYamlDocument(document: TextDocument): YamlDocument[] {
        const yamlParser = new YamlParser(document);
        return yamlParser.getYamlDocuments();
    }
    resetSchema(uri: string): boolean {
        return this.schemaService.onResourceChange(uri);
    }
    getMatchingSchemas(
        document: TextDocument,
        jsonDocument: JSONDocument,
        schema?: JSONSchema | undefined
    ): Thenable<MatchingSchema[]> {
        return this.schemaService.getMatchingSchemas(document, jsonDocument, schema);
    }
    getLanguageStatus(document: TextDocument, jsonDocument: JSONDocument): JSONLanguageStatus {
        return this.validationService.getLanguageStatus(document, jsonDocument);
    }
    doResolve(item: CompletionItem): Thenable<CompletionItem> {
        return this.completionService.doResolve(item);
    }
    doComplete(document: TextDocument, position: Position, doc: YamlDocument): Thenable<CompletionList | null> {
        return this.completionService.doComplete(document, position, doc);
    }
}
