import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { YamlKubernetesCompletionSettings } from './configurationService';
import * as k8s from '@kubernetes/client-node';
import { V1APIResourceList, V1GroupVersionForDiscovery } from '@kubernetes/client-node';
import axios from 'axios';
import https from 'https';
import request from 'request';

interface RawKubernetesResourceInfo {
    list: V1APIResourceList;
    groupVersion: string;
}

export class KubernetsApiService {
    private initialized = false;
    private started = false;
    private axiosClient: AxiosInstance;
    private kubeConf: k8s.KubeConfig;
    private abortController: AbortController | undefined;
    private currentCluster: k8s.Cluster | null;
    private resourceInfo: Map<string, string>;
    private static readonly SUPPORTED_VERSION = 'v1';

    constructor(settings: YamlKubernetesCompletionSettings) {
        this.kubeConf = new k8s.KubeConfig();
        this.resourceInfo = new Map();

        //load config
        const configFilePath = settings.kubectl.configFilePath;
        if (configFilePath.length === 0) {
            this.kubeConf.loadFromDefault();
        } else {
            this.kubeConf.loadFromFile(configFilePath);
        }

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

    public getResourceInfo(): Map<string, string> {
        return this.resourceInfo;
    }

    private async getApisApiGroups(): Promise<k8s.V1APIGroup[]> {
        const apisApiClient = this.kubeConf.makeApiClient(k8s.ApisApi);
        const res = await apisApiClient.getAPIVersions();
        return res.body.groups;
    }

    private async getResourcesForApisApiGroups(
        version: V1GroupVersionForDiscovery
    ): Promise<RawKubernetesResourceInfo> {
        this.abortController = new AbortController();
        if (this.currentCluster) {
            const options: AxiosRequestConfig = {
                signal: this.abortController.signal
            };
            const res = await this.axiosClient.get<V1APIResourceList>(
                `${this.currentCluster.server}/apis/${version.groupVersion}`,
                options
            );
            return {
                list: res.data,
                groupVersion: version.groupVersion
            };
        }
        return Promise.reject('kubernetes cluster is not defined');
    }
    private async getCoreApiVersions(): Promise<string[]> {
        const coreApiClient = this.kubeConf.makeApiClient(k8s.CoreApi);
        const res = await coreApiClient.getAPIVersions();
        return res.body.versions;
    }

    private async getCoreApiV1Resources(): Promise<RawKubernetesResourceInfo> {
        const coreApiv1Client = this.kubeConf.makeApiClient(k8s.CoreV1Api);
        const res = await coreApiv1Client.getAPIResources();
        const resources = res.body;
        return {
            list: resources,
            groupVersion: resources.groupVersion
        };
    }

    private collectResourceInfo(rawResourceInfo: RawKubernetesResourceInfo): void {
        for (const resource of rawResourceInfo.list.resources) {
            const kind = resource.kind;
            if (!this.resourceInfo.has(kind)) {
                this.resourceInfo.set(kind, rawResourceInfo.groupVersion);
            }
        }
    }

    private fetchKindList(): Promise<void> {
        this.abortController = new AbortController();

        const promisesToFulFil: Promise<any>[] = [];
        const promisesToSettle: Promise<RawKubernetesResourceInfo>[] = [];

        try {
            promisesToFulFil.push(
                this.getApisApiGroups().then((groups) => {
                    for (const group of groups) {
                        const usedVersion = group.preferredVersion ? group.preferredVersion : group.versions[0];
                        promisesToSettle.push(this.getResourcesForApisApiGroups(usedVersion));
                    }
                })
            );

            promisesToFulFil.push(
                this.getCoreApiVersions().then((versions) => {
                    if (versions.includes(KubernetsApiService.SUPPORTED_VERSION)) {
                        promisesToSettle.push(this.getCoreApiV1Resources());
                    } else {
                        Promise.reject(`Only supported api version is ${KubernetsApiService.SUPPORTED_VERSION}!`);
                    }
                })
            );

            return Promise.all(promisesToFulFil).then(async () => {
                const promiseResults = await Promise.allSettled(promisesToSettle);
                for (const promiseResult of promiseResults) {
                    if (promiseResult.status === 'fulfilled') {
                        this.collectResourceInfo(promiseResult.value);
                    } /* else {
                        Promise.reject(promiseResult.reason);
                    } */
                }
            });
        } catch (ex: any) {
            return Promise.reject(ex);
        }
    }
}
