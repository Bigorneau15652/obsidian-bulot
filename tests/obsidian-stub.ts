// Minimal replacement of the obsidian module for unit tests.
export interface StubRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}
export interface StubResponse {
  status: number;
  json: unknown;
}

// Tests set this handler to decide what each request returns
export const stubState: { handler: (request: StubRequest) => Promise<StubResponse> | StubResponse } = {
  handler: () => ({ status: 500, json: {} }),
};

export async function requestUrl(request: StubRequest): Promise<StubResponse> {
  return stubState.handler(request);
}
