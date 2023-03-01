import { SchemaRequestService } from 'vscode-json-languageservice';
import { YamlSchemaRequestService } from '../services/yamlSchemaRequestService';
import { YamlSchemaRequestServiceTest } from '../test/services/yamlSchemaRequestServiceTest';

export class YamlSchemaRequestServiceFactory {
    public static getSchemaRequestService(baseUri: string, test = false): SchemaRequestService {
        if (test) {
            const yamlSchemaRequestService = new YamlSchemaRequestServiceTest();
            return yamlSchemaRequestService.requestSchemaTest;
        }
        const yamlSchemaRequestService = new YamlSchemaRequestService(baseUri);
        return yamlSchemaRequestService.requestSchema.bind(yamlSchemaRequestService);
    }
}
