import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { YamlKubernetesCompletionSettings } from './settingsService';
import * as k8s from '@kubernetes/client-node';
import { V1APIResourceList, V1GroupVersionForDiscovery } from '@kubernetes/client-node';
import axios from 'axios';
import https from 'https';
import request from 'request';

export class KubernetsApiService {
    private initialized = false;
    private started = false;
    private axiosClient: AxiosInstance;
    private kubeConf: k8s.KubeConfig;
    private abortController: AbortController | undefined;
    private currentCluster: k8s.Cluster | null;
    private kindList: string[];

    constructor(settings: YamlKubernetesCompletionSettings) {
        this.kindList = [];
        this.kubeConf = new k8s.KubeConfig();
        this.kubeConf.loadFromDefault();
        const options: request.Options = {
            url: ''
        };
        this.kubeConf.applyToRequest(options);
        this.axiosClient = axios.create({
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
                ca: options.ca,
                cert: options.cert,
                key: options.key
            })
        });
        this.currentCluster = this.kubeConf.getCurrentCluster();
    }

    public start(): Promise<void> {
        if (this.started) {
            return Promise.reject();
        }
        return this.fetchKindList().then(() => {
            this.initialized = true;
        });
    }

    public stop() {
        if (!this.started) {
            return;
        }
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    public isInitialized(): boolean {
        return this.initialized;
    }

    private async getApisApiGroups(): Promise<k8s.V1APIGroup[]> {
        const apisApiClient = this.kubeConf.makeApiClient(k8s.ApisApi);
        const res = await apisApiClient.getAPIVersions();
        return res.body.groups;
    }

    private async getResourcesForApisApiGroups(version: V1GroupVersionForDiscovery): Promise<k8s.V1APIResourceList> {
        this.abortController = new AbortController();
        if (this.currentCluster) {
            const options: AxiosRequestConfig = {
                signal: this.abortController.signal
            };
            const res = await this.axiosClient.get<V1APIResourceList>(
                `${this.currentCluster.server}/apis/${version.groupVersion}`,
                options
            );
            return res.data;
        }
        return Promise.reject('kubernetes cluster is not defined');
    }
    private async getCoreApiVersions(): Promise<string[]> {
        const coreApiClient = this.kubeConf.makeApiClient(k8s.CoreApi);
        const res = await coreApiClient.getAPIVersions();
        return res.body.versions;
    }

    private async getCoreApiV1Resources(): Promise<V1APIResourceList> {
        const coreApiv1Client = this.kubeConf.makeApiClient(k8s.CoreV1Api);
        const res = await coreApiv1Client.getAPIResources();
        return res.body;
    }

    private addToKindList(resourceList: V1APIResourceList): void {
        for (const resource of resourceList.resources) {
            const resourceKind = resource.kind;
            if (!this.kindList.includes(resourceKind)) {
                this.kindList.push(resourceKind);
            }
        }
    }

    private fetchKindList(): Promise<void> {
        this.abortController = new AbortController();

        const promisesToFulFil: Promise<any>[] = [];
        const promisesToSettle: Promise<V1APIResourceList>[] = [];

        try {
            promisesToFulFil.push(
                this.getApisApiGroups().then((groups) => {
                    for (const group of groups) {
                        for (const version of group.versions) {
                            promisesToSettle.push(this.getResourcesForApisApiGroups(version));
                        }
                    }
                })
            );

            promisesToFulFil.push(
                this.getCoreApiVersions().then((versions) => {
                    if (versions.includes('v1')) {
                        promisesToSettle.push(this.getCoreApiV1Resources());
                    } else {
                        Promise.reject(`Only supported api version is v1!`);
                    }
                })
            );

            return Promise.all(promisesToFulFil).then(async () => {
                const promiseResults = await Promise.allSettled(promisesToSettle);
                for (const promiseResult of promiseResults) {
                    if (promiseResult.status === 'fulfilled') {
                        this.addToKindList(promiseResult.value);
                    } else {
                        Promise.reject(promiseResult.reason);
                    }
                }
            });
        } catch (ex: any) {
            return Promise.reject(ex);
        }
    }
}
