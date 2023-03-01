interface IMessage<T> {
    subscribe(callback: (payload: T) => void): number;
    unsubscribe(id: number): void;
    notify(payload: T): void;
}

class Subscription<T> {
    constructor(public id: number, public callback: (payload: T) => void) {}
}

class Message<T> implements IMessage<T> {
    private subscriptions: Subscription<T>[];
    private nextId: number;

    constructor(public message: string) {
        this.subscriptions = [];
        this.nextId = 0;
    }

    subscribe(callback: (payload: T) => void): number {
        const subscription = new Subscription(this.nextId++, callback);
        this.subscriptions[subscription.id] = subscription;
        return subscription.id;
    }
    unsubscribe(id: number): void {
        delete this.subscriptions[id];
    }
    notify(payload: T): void {
        for (let i = 0; i < this.subscriptions.length; i++) {
            if (this.subscriptions[i]) {
                this.subscriptions[i].callback(payload);
            }
        }
    }
}

export class EventManager {
    private messages: any;

    constructor() {
        this.messages = {};
    }

    subscribe<T>(message: string, callback: (payload: T) => void): number {
        const msg = this.messages[message] || <IMessage<T>>(this.messages[message] = new Message(message));
        return msg.subscribe(callback);
    }

    unsubscribe(message: string, token: number) {
        if (this.messages[message]) {
            this.messages[message].unsubscribe(token);
        }
    }

    publish<T>(message: string, payload: T) {
        if (this.messages[message]) {
            this.messages[message].notify(payload);
        }
    }
}
