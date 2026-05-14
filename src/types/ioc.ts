export type IocType = "ip" | "domain" | "sha256";

export interface LookupRequest {
  type: IocType;
  value: string;
}

export interface IocUpsertRequest extends LookupRequest {
  source: string;
  score: number;
}

export interface IocRecord extends IocUpsertRequest {
  added_at: string;
}

export type LookupResponse =
  | {
      verdict: "unknown";
    }
  | {
      verdict: "malicious";
      ioc: IocRecord;
    };
