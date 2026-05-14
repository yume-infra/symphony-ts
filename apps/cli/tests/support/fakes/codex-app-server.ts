export type FakeCodexProtocolMessage = unknown

export interface FakeCodexAppServerScript {
  readonly sentMessages: ReadonlyArray<unknown>
  readonly send: (message: unknown) => void
  readonly nextMessage: () => FakeCodexProtocolMessage
  readonly queueMessage: (message: FakeCodexProtocolMessage) => void
  readonly remainingMessages: () => ReadonlyArray<FakeCodexProtocolMessage>
}

export function createFakeCodexAppServerScript(
  initialMessages: ReadonlyArray<FakeCodexProtocolMessage> = [],
): FakeCodexAppServerScript {
  const sentMessages: Array<unknown> = []
  const pendingMessages: Array<FakeCodexProtocolMessage> = [...initialMessages]

  return {
    sentMessages,
    send(message) {
      sentMessages.push(message)
    },
    nextMessage() {
      const message = pendingMessages.shift()

      if (message === undefined) {
        throw new Error('Fake Codex app-server script has no queued message')
      }

      return message
    },
    queueMessage(message) {
      pendingMessages.push(message)
    },
    remainingMessages() {
      return [...pendingMessages]
    },
  }
}
