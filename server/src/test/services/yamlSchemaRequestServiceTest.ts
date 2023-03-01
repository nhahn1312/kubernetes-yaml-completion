export class YamlSchemaRequestServiceTest {
    public static readonly JSON_SCHEMA_URI = 'foo://server/data.schema.json';
    public static readonly JSON_SCHEMA = {
        type: 'object',
        required: ['name', 'Test'],
        properties: {
            name: {
                type: 'string'
            },
            men: {
                type: 'array'
            },
            Test: {
                type: 'array',
                items: {
                    anyOf: [
                        {
                            type: 'object',
                            properties: { 'Don Corleone': { type: 'string' } },
                            required: ['Don Corleone']
                        },
                        { type: 'object', properties: { Clemenza: { type: 'string' } }, required: ['Clemenza'] }
                    ]
                }
            },
            xyz: {
                type: 'object',
                properties: {
                    z: {
                        type: 'string'
                    },
                    a: {
                        type: 'string'
                    }
                }
            }
        }
    };

    public requestSchemaTest(uri: string): Thenable<string> {
        if (uri === YamlSchemaRequestServiceTest.JSON_SCHEMA_URI) {
            return Promise.resolve(JSON.stringify(YamlSchemaRequestServiceTest.JSON_SCHEMA));
        }
        return Promise.reject(`Unabled to load schema at ${uri}`);
    }
}
