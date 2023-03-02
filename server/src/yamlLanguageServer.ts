import { Diagnostic } from 'vscode-json-languageservice';
import { CompletionItem, TextDocumentPositionParams, TextDocuments, _Connection } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { YamlSchemaRequestServiceFactory } from './factories/yamlSchemaRequestServiceFactory';
import { YamlSchemaRequestService } from './services/yamlSchemaRequestService';
import {
    ConfigurationService,
    YamlKubernetesCompletionSettings,
    YamlKubernetesCompletionSettingsDiff
} from './services/configurationService';
import { YamlLanguageService, IYamlLanguageService } from './services/yamlLanguageService';
import { KubernetsApiService } from './services/kubernetesApiService';

export class YamlLanguageServer {
    private languageService: IYamlLanguageService;
    private configurationService: ConfigurationService;
    private kubernetesApiService: KubernetsApiService | undefined;
    private static instance: YamlLanguageServer | null = null;

    public static getInstance(
        connection: _Connection,
        documents: TextDocuments<TextDocument>,
        baseUri: string
    ): YamlLanguageServer {
        if (!YamlLanguageServer.instance) {
            YamlLanguageServer.instance = new YamlLanguageServer(connection, documents, baseUri);
        }
        return YamlLanguageServer.instance;
    }

    private constructor(
        private connection: _Connection,
        private documents: TextDocuments<TextDocument>,
        private baseUri: string
    ) {
        this.languageService = new YamlLanguageService({
            schemaRequestService: YamlSchemaRequestServiceFactory.getSchemaRequestService(this.baseUri)
        });
        this.configurationService = new ConfigurationService(connection);

        //listen to connection events we need
        this.configurationService.onConfigChanged(this.onConfigChange.bind(this));
        this.configurationService.onConfigInitialized(this.onConfigInitialized.bind(this));
        this.connection.onCompletion(this.onCompletion.bind(this));
        this.connection.onCompletionResolve(this.onResolve.bind(this));
        //this.connection.onDidChangeWatchedFiles()
        //this.connection.onCompletionResolve()

        // The content of a text document has changed. This event is emitted
        // when the text document first opened or when its content has changed.
        this.documents.onDidChangeContent((change) => {
            this.validateTextDocument(change.document);
        });

        // Make the text document manager listen on the connection
        // for open, change and close text document events
        this.documents.listen(connection);

        // Listen on the connection
        this.connection.listen();
    }

    private onConfigChange(settingsDiff: YamlKubernetesCompletionSettingsDiff) {
        //reinitilize kubernetes service if config for it was changed
        if (settingsDiff.diff.changed.includes('validation')) {
            this.configureLanguageService(settingsDiff.settings);
        }
        if (settingsDiff.diff.changed.includes('kubectl')) {
            this.createNewKubernetesApiService(settingsDiff.settings).then(() => {
                //validate documents if ready
                for (const document of this.documents.all()) {
                    this.validateTextDocument(document);
                }
            });
        }
    }

    private createNewKubernetesApiService(settings: YamlKubernetesCompletionSettings): Promise<void> {
        if (this.kubernetesApiService) {
            this.kubernetesApiService.stop();
        }
        this.kubernetesApiService = new KubernetsApiService(settings);
        return this.kubernetesApiService.start();
    }

    private configureLanguageService(settings: YamlKubernetesCompletionSettings) {
        this.languageService.configure({
            allowComments: true,
            schemas: [
                {
                    fileMatch: settings.validation.associatedFiles,
                    uri: YamlSchemaRequestService.KUBERNETES_SCHEMA_FILE
                }
            ]
        });
    }

    private onConfigInitialized(settings: YamlKubernetesCompletionSettings) {
        //configure language service
        this.configureLanguageService(settings);
        //initialize kubernetes service
        this.createNewKubernetesApiService(settings).then(() => {
            //validate documents if ready
            for (const document of this.documents.all()) {
                this.validateTextDocument(document);
            }
        });
    }

    private async validateTextDocument(textDocument: TextDocument): Promise<void> {
        if (!this.configurationService.isInitialized || !this.kubernetesApiService?.isInitialized()) {
            return Promise.resolve();
        }

        const diagnostics: Diagnostic[] = [];
        const yamlDocuments = this.languageService.parseYamlDocument(textDocument);
        const promiseArray: Thenable<Diagnostic[]>[] = [];

        for (const yamlDocument of yamlDocuments) {
            diagnostics.push(...yamlDocument.syntaxErrors);
            promiseArray.push(this.languageService.doValidation(textDocument, yamlDocument));
        }

        Promise.all(promiseArray).then((diagnosticComp) => {
            for (const diagnosticArray of diagnosticComp) {
                diagnostics.push(...diagnosticArray);
            }
            // Send the computed diagnostics to VS Code.
            this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: diagnostics });
        });
    }

    public async onResolve(completionItem: CompletionItem): Promise<CompletionItem> {
        return this.languageService.doResolve(completionItem);
    }

    public async onCompletion(textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> {
        const textDocument = this.documents.get(textDocumentPosition.textDocument.uri);

        if (!textDocument) {
            return Promise.resolve([]);
        }

        const yamlDocuments = this.languageService.parseYamlDocument(textDocument);
        const currentOffset = textDocument.offsetAt(textDocumentPosition.position);
        let currentYamlDoc;

        for (const yamlDocument of yamlDocuments) {
            if (currentOffset >= yamlDocument.range.startOffset && currentOffset <= yamlDocument.range.endOffset) {
                currentYamlDoc = yamlDocument;
                break;
            }
        }

        if (!currentYamlDoc) {
            return Promise.resolve([]);
        }

        return this.languageService
            .doComplete(textDocument, textDocumentPosition.position, currentYamlDoc)
            .then((list) => {
                return list ? list.items : [];
            });
    }
}
