import antfu from '@antfu/eslint-config'

function propertyName(node) {
  if (node?.type === 'Identifier') {
    return node.name
  }

  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }

  return null
}

function isMember(node, objectName, memberName) {
  return node?.type === 'MemberExpression'
    && node.object?.type === 'Identifier'
    && node.object.name === objectName
    && propertyName(node.property) === memberName
}

function isEffectVoidOrUnit(node) {
  return isMember(node, 'Effect', 'void') || isMember(node, 'Effect', 'unit')
}

function isEffectCatchMember(node) {
  return isMember(node, 'Effect', 'catch')
    || isMember(node, 'Effect', 'catchAll')
    || isMember(node, 'Effect', 'catchTag')
    || isMember(node, 'Effect', 'catchTags')
}

function returnsEffectVoidOrUnit(node) {
  if (node?.type === 'ArrowFunctionExpression') {
    if (isEffectVoidOrUnit(node.body)) {
      return true
    }

    if (node.body.type === 'BlockStatement') {
      return node.body.body.some(statement =>
        statement.type === 'ReturnStatement' && isEffectVoidOrUnit(statement.argument),
      )
    }
  }

  if (node?.type === 'FunctionExpression') {
    return node.body.body.some(statement =>
      statement.type === 'ReturnStatement' && isEffectVoidOrUnit(statement.argument),
    )
  }

  return false
}

function banEffectMemberRule(memberName, message) {
  return {
    meta: {
      type: 'problem',
      docs: { description: `Disallow Effect.${memberName}` },
      messages: { banned: message },
      schema: [],
    },
    create(context) {
      return {
        MemberExpression(node) {
          if (isMember(node, 'Effect', memberName)) {
            context.report({ node, messageId: 'banned' })
          }
        },
      }
    },
  }
}

const symphonyEffectRules = {
  rules: {
    'no-context-tag': {
      meta: {
        type: 'problem',
        docs: { description: 'Use Context.Service for Effect services' },
        messages: {
          banned: 'Use Context.Service for project services; Context.Tag is a stale service pattern for this repository.',
        },
        schema: [],
      },
      create(context) {
        return {
          MemberExpression(node) {
            if (isMember(node, 'Context', 'Tag')) {
              context.report({ node, messageId: 'banned' })
            }
          },
        }
      },
    },
    'no-effect-as-void': banEffectMemberRule(
      'asVoid',
      'Avoid Effect.asVoid; use the expected void return type or map to an explicit value.',
    ),
    'no-effect-catch-all-cause': banEffectMemberRule(
      'catchAllCause',
      'Do not catch all causes in normal runtime code; handle expected typed errors with catch/catchTag.',
    ),
    'no-effect-ignore': banEffectMemberRule(
      'ignore',
      'Do not use Effect.ignore; handle, log, or propagate the typed error explicitly.',
    ),
    'no-effect-service-option': banEffectMemberRule(
      'serviceOption',
      'Do not use Effect.serviceOption; required services should be present in the layer graph.',
    ),
    'no-legacy-effect-cli-import': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow legacy @effect/cli imports' },
        messages: {
          banned: 'Use effect/unstable/cli with Effect v4 beta; do not import @effect/cli.',
        },
        schema: [],
      },
      create(context) {
        function checkSource(node, source) {
          if (typeof source === 'string' && (source === '@effect/cli' || source.startsWith('@effect/cli/'))) {
            context.report({ node, messageId: 'banned' })
          }
        }

        return {
          ExportAllDeclaration(node) {
            checkSource(node.source, node.source?.value)
          },
          ExportNamedDeclaration(node) {
            checkSource(node.source, node.source?.value)
          },
          ImportDeclaration(node) {
            checkSource(node.source, node.source?.value)
          },
          ImportExpression(node) {
            checkSource(node.source, node.source?.value)
          },
          CallExpression(node) {
            if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
              checkSource(node.arguments[0], node.arguments[0]?.value)
            }
          },
        }
      },
    },
    'no-silent-effect-catch': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow catch handlers that silently return Effect.void' },
        messages: {
          banned: 'Do not silently swallow Effect errors with Effect.void; recover explicitly, transform, or log and propagate.',
        },
        schema: [],
      },
      create(context) {
        return {
          CallExpression(node) {
            if (!isEffectCatchMember(node.callee)) {
              return
            }

            if (isMember(node.callee, 'Effect', 'catchTags')) {
              if (node.arguments[0]?.type === 'ObjectExpression') {
                for (const property of node.arguments[0].properties) {
                  if (property.type === 'Property' && returnsEffectVoidOrUnit(property.value)) {
                    context.report({ node: property.value, messageId: 'banned' })
                  }
                }
              }

              return
            }

            const handler = propertyName(node.callee.property) === 'catchTag'
              ? node.arguments[1]
              : node.arguments[0]

            if (returnsEffectVoidOrUnit(handler)) {
              context.report({ node: handler, messageId: 'banned' })
            }
          },
        }
      },
    },
    'no-vendored-effect-import': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow imports from the vendored Effect source tree' },
        messages: {
          banned: 'Do not import from repos/effect; it is read-only reference material.',
        },
        schema: [],
      },
      create(context) {
        function checkSource(node, source) {
          if (typeof source === 'string' && source.includes('repos/effect')) {
            context.report({ node, messageId: 'banned' })
          }
        }

        return {
          ExportAllDeclaration(node) {
            checkSource(node.source, node.source?.value)
          },
          ExportNamedDeclaration(node) {
            checkSource(node.source, node.source?.value)
          },
          ImportDeclaration(node) {
            checkSource(node.source, node.source?.value)
          },
          ImportExpression(node) {
            checkSource(node.source, node.source?.value)
          },
          CallExpression(node) {
            if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
              checkSource(node.arguments[0], node.arguments[0]?.value)
            }
          },
        }
      },
    },
  },
}

export default antfu(
  {
    ignores: ['docs/**', 'reference/**', 'repos/**', '.agents/**', '.codex/**', '.trellis/**', '.turbo/**', '**/.turbo/**'],
  },
  {
    name: 'symphony/effect-rules',
    files: ['apps/cli/src/**/*.ts', 'apps/cli/tests/**/*.ts'],
    plugins: {
      symphony: symphonyEffectRules,
    },
    rules: {
      'symphony/no-context-tag': 'error',
      'symphony/no-effect-as-void': 'error',
      'symphony/no-effect-catch-all-cause': 'error',
      'symphony/no-effect-ignore': 'error',
      'symphony/no-effect-service-option': 'error',
      'symphony/no-legacy-effect-cli-import': 'error',
      'symphony/no-silent-effect-catch': 'error',
      'symphony/no-vendored-effect-import': 'error',
    },
  },
)
