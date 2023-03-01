/* eslint-disable no-mixed-spaces-and-tabs */
import { createConnection, TextDocuments, ProposedFeatures } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { YamlLanguageServer } from './yamlLanguageServer';
import path from 'path';
import * as k8s from '@kubernetes/client-node';
import { V1APIResourceList } from '@kubernetes/client-node';
import axios from 'axios';
import https from 'https';
import request from 'request';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

//get absolute path of server dir to parse schema files accordingly
const baseUri = path.resolve(__dirname, '../');

YamlLanguageServer.getInstance(connection, documents, baseUri);

/* const kubeConf = new k8s.KubeConfig();
kubeConf.loadFromDefault();
kubeConf.getCurrentCluster();
const options: request.Options = {
    url: ''
};
kubeConf.applyToRequest(options);

const promisesToFulFil: Promise<V1APIResourceList>[] = [];
const objectKinds: string[] = [];
const currentCluster = kubeConf.getCurrentCluster();
const promiseToWait: Promise<any>[] = [];
const client = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        ca: options.ca,
        cert: options.cert,
        key: options.key
    })
});

if (currentCluster) {
    const client1 = kubeConf.makeApiClient(k8s.ApisApi);
    promiseToWait.push(
        client1.getAPIVersions().then((value) => {
            const groups = value.body.groups;
            for (const group of groups) {
                for (const version of group.versions) {
                    promisesToFulFil.push(
                        client
                            .get<V1APIResourceList>(`${currentCluster.server}/apis/${version.groupVersion}`)
                            .then((res) => res.data)
                    );
                }
            }
        })
    );

    const client2 = kubeConf.makeApiClient(k8s.CoreApi);
    promiseToWait.push(
        client2.getAPIVersions().then((value) => {
            if (value.body.versions.includes('v1')) {
                const client3 = kubeConf.makeApiClient(k8s.CoreV1Api);
                promisesToFulFil.push(client3.getAPIResources().then((res) => res.body));
            } else {
                Promise.reject(`Only supported api version is v1!`);
            }
        })
    );

    Promise.all(promiseToWait).then(() => {
        Promise.allSettled(promisesToFulFil).then((promiseResultArray) => {
            for (const promiseResult of promiseResultArray) {
                if (promiseResult.status === 'fulfilled') {
                    const resourceList = promiseResult.value;
                    for (const resource of resourceList.resources) {
                        const resourceKind = resource.kind;
                        if (!objectKinds.includes(resourceKind)) {
                            objectKinds.push(resourceKind);
                        }
                    }
                } else {
                    console.log(promiseResult.reason);
                }
            }
            console.log(objectKinds);
        });
    });
} else {
    //TODO: show error message
} */
