import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['docs/**', 'reference/**', '.agents/**', '.codex/**', '.trellis/**', '.turbo/**', '**/.turbo/**'],
})
