import {
    DidChangeConfigurationNotification,
    DidChangeConfigurationParams,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    _Connection
} from 'vscode-languageserver';
import { EventManager } from '../handlers/event';
import { ArrayUtils } from '../utils/array';

export interface YamlKubernetesCompletionSettings {
    kubectl: {
        cacheTimeout: number;
    };
    completion: {
        indentation: number;
    };
    validation: {
        associatedFiles: string[];
    };
}

export interface YamlKubernetesCompletionSettingsDiff {
    settings: YamlKubernetesCompletionSettings;
    diff: SettingsDiff;
}

export interface SettingsDiff {
    changed: string[];
}

export class ConfigurationService {
    public static readonly SETTINGS_SECTION_NAME = 'yamlKubernetesCompletion';
    private static readonly CONFIG_CHANGED_EVENT_NAME = 'onConfigChange';
    private static readonly CONFIG_INIT_EVENT_NAME = 'onConfigInit';
    private currentSettings: YamlKubernetesCompletionSettings;
    private hasConfigurationCapability = false;
    private hasWorkspaceFolderCapability = false;
    private hasDiagnosticRelatedInformationCapability = false;
    private eventManager: EventManager;
    private initialized = false;

    constructor(private connection: _Connection) {
        this.currentSettings = this.getDefaultSettings();
        this.eventManager = new EventManager();
        this.connection.onInitialize(this.onConnectionInitialize.bind(this));
        this.connection.onInitialized(this.onConnectionInitialized.bind(this));
        this.connection.onDidChangeConfiguration(this.onConnectionConfigChange.bind(this));
    }

    private onConnectionInitialized(): void {
        if (this.hasConfigurationCapability) {
            // Register for all configuration changes.
            this.connection.client.register(DidChangeConfigurationNotification.type, {
                section: ConfigurationService.SETTINGS_SECTION_NAME
            });

            this.connection.workspace
                .getConfiguration(ConfigurationService.SETTINGS_SECTION_NAME)
                .then(
                    ((settings: YamlKubernetesCompletionSettings) => {
                        this.currentSettings = settings;
                        this.initialized = true;
                        this.eventManager.publish<YamlKubernetesCompletionSettings>(
                            ConfigurationService.CONFIG_INIT_EVENT_NAME,
                            settings
                        );
                    }).bind(this)
                )
                .catch((error) => {
                    console.error(error);
                });
        }
        if (this.hasWorkspaceFolderCapability) {
            this.connection.workspace.onDidChangeWorkspaceFolders((_event) => {
                this.connection.console.log('Workspace folder change event received.');
            });
        }
    }

    private onConnectionInitialize(params: InitializeParams): InitializeResult {
        const capabilities = params.capabilities;

        // Does the client support the `workspace/configuration` request?
        // If not, we fall back using global settings.
        this.hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
        this.hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
        this.hasDiagnosticRelatedInformationCapability = !!(
            capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation
        );

        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                // Tell the client that this server supports code completion.
                completionProvider: {
                    resolveProvider: true
                }
            }
        };
        if (this.hasWorkspaceFolderCapability) {
            result.capabilities.workspace = {
                workspaceFolders: {
                    supported: true
                }
            };
        }

        return result;
    }

    private getConfigDiff(
        old: YamlKubernetesCompletionSettings,
        current: YamlKubernetesCompletionSettings
    ): SettingsDiff {
        const settingsDiff: SettingsDiff = {
            changed: []
        };
        if (old.kubectl.cacheTimeout != current.kubectl.cacheTimeout) {
            settingsDiff.changed.push('kubectl');
        }
        if (old.completion.indentation != current.completion.indentation) {
            settingsDiff.changed.push('completion');
        }
        if (ArrayUtils.isDifferent<string>(old.validation.associatedFiles, current.validation.associatedFiles)) {
            settingsDiff.changed.push('validation');
        }
        return settingsDiff;
    }

    private onConnectionConfigChange(change: DidChangeConfigurationParams): void {
        const oldSettings = this.currentSettings;
        this.currentSettings = change.settings[ConfigurationService.SETTINGS_SECTION_NAME];
        const settingsDiff = this.getConfigDiff(oldSettings, this.currentSettings);

        this.eventManager.publish<YamlKubernetesCompletionSettingsDiff>(
            ConfigurationService.CONFIG_CHANGED_EVENT_NAME,
            {
                settings: this.currentSettings,
                diff: settingsDiff
            }
        );
    }

    public onConfigChanged(callback: (configChange: YamlKubernetesCompletionSettingsDiff) => void) {
        this.eventManager.subscribe<YamlKubernetesCompletionSettingsDiff>(
            ConfigurationService.CONFIG_CHANGED_EVENT_NAME,
            callback
        );
    }

    public onConfigInitialized(callback: (config: YamlKubernetesCompletionSettings) => void) {
        this.eventManager.subscribe<YamlKubernetesCompletionSettings>(
            ConfigurationService.CONFIG_INIT_EVENT_NAME,
            callback
        );
    }

    public isInitialized() {
        return this.initialized;
    }

    public getDefaultSettings(): YamlKubernetesCompletionSettings {
        return {
            kubectl: {
                cacheTimeout: 600
            },
            completion: {
                indentation: 4
            },
            validation: {
                associatedFiles: ['kubernetes.yaml']
            }
        };
    }

    public getCurrentSettings(): YamlKubernetesCompletionSettings {
        return this.currentSettings;
    }
}
