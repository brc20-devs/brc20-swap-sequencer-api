export type ObserverCallback = (type: string, data: any) => void;

export class Observer {
  private callback: ObserverCallback;
  constructor(callback: ObserverCallback) {
    this.callback = callback;
  }
  notify<T>(dataType: string, data: T) {
    this.callback(dataType, data);
  }
}
