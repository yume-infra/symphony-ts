import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['docs/**', 'reference/**', 'repos/**', '.agents/**', '.codex/**', '.trellis/**', '.turbo/**', '**/.turbo/**'],
})
