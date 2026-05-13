export interface TestFixture<T> {
  readonly name: string
  readonly value: T
}

export function defineFixture<const T>(name: string, value: T): TestFixture<T> {
  return { name, value }
}

export function cloneFixture<T>(fixture: TestFixture<T>): T {
  return structuredClone(fixture.value)
}
