import { Data } from 'effect'

export class WorkflowLoadError extends Data.TaggedError('WorkflowLoadError')<{
  readonly code: 'missing_workflow_file' | 'workflow_read_error'
  readonly path: string
  readonly reason: string
  readonly cause?: unknown
}> {}

export class WorkflowParseError extends Data.TaggedError('WorkflowParseError')<{
  readonly code: 'workflow_parse_error' | 'workflow_front_matter_not_a_map'
  readonly path: string
  readonly reason: string
  readonly line?: number
  readonly cause?: unknown
}> {}

export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly code:
    | 'unsupported_tracker_kind'
    | 'missing_tracker_kind'
    | 'missing_tracker_api_key'
    | 'missing_tracker_project_slug'
    | 'missing_codex_command'
    | 'invalid_config_value'
  readonly path: string
  readonly field: string
  readonly reason: string
}> {}

export class PromptRenderError extends Data.TaggedError('PromptRenderError')<{
  readonly code: 'template_parse_error' | 'template_render_error'
  readonly reason: string
  readonly expression?: string
}> {}

export class TrackerError extends Data.TaggedError('TrackerError')<{
  readonly code:
    | 'unsupported_tracker_kind'
    | 'missing_tracker_api_key'
    | 'missing_tracker_project_slug'
    | 'linear_api_request'
    | 'linear_api_status'
    | 'linear_graphql_errors'
    | 'linear_unknown_payload'
    | 'linear_missing_end_cursor'
  readonly operation: string
  readonly reason: string
  readonly status?: number
  readonly cause?: unknown
}> {}

export class WorkspaceError extends Data.TaggedError('WorkspaceError')<{
  readonly code:
    | 'workspace_path_outside_root'
    | 'workspace_create_failed'
    | 'workspace_existing_non_directory'
    | 'workspace_remove_failed'
    | 'hook_failed'
    | 'hook_timeout'
  readonly path: string
  readonly reason: string
  readonly hook?: string
  readonly cause?: unknown
}> {}

export class CodexError extends Data.TaggedError('CodexError')<{
  readonly code:
    | 'codex_not_found'
    | 'invalid_workspace_cwd'
    | 'response_timeout'
    | 'turn_timeout'
    | 'process_exit'
    | 'response_error'
    | 'turn_failed'
    | 'turn_cancelled'
    | 'turn_input_required'
    | 'malformed_message'
    | 'unsupported_tool_call'
  readonly reason: string
  readonly sessionId?: string
  readonly cause?: unknown
}> {}
