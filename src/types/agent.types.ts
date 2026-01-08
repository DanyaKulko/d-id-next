export type CompatibilityMode = "on" | "off" | "auto";

export interface CreateStreamPathParams {
  agentId: string;
}

export interface CreateStreamRequestBody {
  /** Defaults to false */
  fluent?: boolean;

  /** ≤ 300 */
  session_timeout?: number;

  /** Defaults to false */
  stream_warmup?: boolean;

  compatibility_mode?: CompatibilityMode;
}

export interface CreateStreamResponseBody {
  session_id?: string;

  id: string;
  offer: unknown;

  jsep: {
    type: string;
    sdp: string;
  };

  ice_servers: IceServer[];
}

export interface IceServer {
  urls: string[] | string;
  username?: string;
  credential?: string;
}

export interface AuthorizationErrorResponseBody {
  kind: string;
  description: string;
  details?: string;
}
