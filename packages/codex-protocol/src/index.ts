export type JsonRpcId = number | string;

export interface JsonRpcRequest<T = unknown> {
  id: JsonRpcId;
  method: string;
  params?: T;
}

export interface JsonRpcNotification<T = unknown> {
  method: string;
  params?: T;
}

export interface JsonRpcResponse<T = unknown> {
  id: JsonRpcId;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type CodexEnvelope =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;
