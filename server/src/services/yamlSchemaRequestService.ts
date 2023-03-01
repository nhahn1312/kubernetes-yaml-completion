import { promises as fsPromises } from 'fs';
import path from 'path';
import { URI } from 'vscode-uri';

export class YamlSchemaRequestService {
    public static readonly KUBERNETES_SCHEMA_FILE = 'all.json';
    public static readonly KUBERNETES_SCHEMA_DIR = 'schemas';

    constructor(private baseUri: string) {}

    public requestSchema(uri: string): Thenable<string> {
        const parsedFileUri: URI = URI.parse(uri);
        const pathToSchema = path.join(
            this.baseUri,
            YamlSchemaRequestService.KUBERNETES_SCHEMA_DIR,
            parsedFileUri.fsPath
        );

        if (parsedFileUri.scheme == 'file') {
            return fsPromises.readFile(pathToSchema).then(
                (buffer: Buffer) => {
                    return buffer.toString();
                },
                (err) => {
                    console.error(err);
                    return `Unabled to load schema at ${uri}`;
                }
            );
        }
        return Promise.reject('Unsupported uri scheme');
    }
}
