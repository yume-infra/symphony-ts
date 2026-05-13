export type FakeLinearGraphQLVariables = Record<string, unknown>

export interface FakeLinearGraphQLRequest {
  readonly query: string
  readonly variables?: FakeLinearGraphQLVariables
}

export interface FakeLinearGraphQLResponse {
  readonly status: number
  readonly body: unknown
}

export interface FakeLinearTransport {
  readonly requests: ReadonlyArray<FakeLinearGraphQLRequest>
  readonly execute: (request: FakeLinearGraphQLRequest) => Promise<FakeLinearGraphQLResponse>
  readonly queueResponse: (response: FakeLinearGraphQLResponse) => void
}

export function createFakeLinearTransport(
  initialResponses: ReadonlyArray<FakeLinearGraphQLResponse> = [],
): FakeLinearTransport {
  const requests: Array<FakeLinearGraphQLRequest> = []
  const responses: Array<FakeLinearGraphQLResponse> = [...initialResponses]

  return {
    requests,
    async execute(request) {
      requests.push(request)

      const response = responses.shift()

      if (response === undefined) {
        throw new Error('Fake Linear transport has no queued response')
      }

      return response
    },
    queueResponse(response) {
      responses.push(response)
    },
  }
}
