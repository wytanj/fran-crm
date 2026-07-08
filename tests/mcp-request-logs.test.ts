import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildMcpToolRequestLog,
  extractMcpWorkspaceId,
  mcpRequestStatusForError,
  summarizeMcpToolResult
} from '../server/utils/mcp-request-logs'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/0008_mcp_request_logging.sql'), 'utf8')

describe('MCP request log migration', () => {
  it('creates a workspace-scoped MCP request ledger with RLS and explicit grants', () => {
    expect(migration).toContain('create table public.crm_mcp_request_logs')
    expect(migration).toContain('workspace_id uuid references public.crm_workspaces(id) on delete cascade')
    expect(migration).toContain("status text not null default 'received' check (status in ('received', 'succeeded', 'failed', 'rejected'))")
    expect(migration).toContain('alter table public.crm_mcp_request_logs enable row level security')
    expect(migration).toContain('to authenticated')
    expect(migration).toContain('public.crm_is_workspace_member(workspace_id)')
    expect(migration).toContain('grant select on table public.crm_mcp_request_logs to authenticated')
    expect(migration).toContain('grant select, insert, update, delete on table public.crm_mcp_request_logs to service_role')
  })

  it('indexes the workspace, actor, tool, and status audit paths', () => {
    expect(migration).toContain('crm_mcp_request_logs_workspace_created_idx')
    expect(migration).toContain('crm_mcp_request_logs_actor_created_idx')
    expect(migration).toContain('crm_mcp_request_logs_tool_status_idx')
  })
})

describe('MCP request log helpers', () => {
  it('extracts only valid workspace ids from tool arguments', () => {
    expect(extractMcpWorkspaceId({
      workspaceId: '11111111-1111-4111-8111-111111111111'
    })).toBe('11111111-1111-4111-8111-111111111111')

    expect(extractMcpWorkspaceId({ workspaceId: 'not-a-uuid' })).toBeUndefined()
    expect(extractMcpWorkspaceId(null)).toBeUndefined()
  })

  it('keeps the requested tool shape while redacting obvious secrets', () => {
    const request = buildMcpToolRequestLog(7, 'tools/call', 'fran.analytics.topCustomers', {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      includeContact: true,
      apiKey: 'should-not-be-logged'
    })

    expect(request).toMatchObject({
      jsonrpcId: 7,
      method: 'tools/call',
      toolName: 'fran.analytics.topCustomers',
      arguments: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        includeContact: true,
        apiKey: '[redacted]'
      }
    })
  })

  it('summarizes tool responses and classifies request failures', () => {
    expect(summarizeMcpToolResult('fran.analytics.topCustomers', {
      mode: 'supabase',
      dateRange: { from: '2026-07-01', to: '2026-07-08' },
      topCustomers: [{ personId: 'person_001' }, { personId: 'person_002' }]
    })).toMatchObject({
      toolName: 'fran.analytics.topCustomers',
      mode: 'supabase',
      rowCount: 2
    })

    expect(mcpRequestStatusForError({ statusCode: 403 })).toBe('rejected')
    expect(mcpRequestStatusForError({ statusCode: 503 })).toBe('failed')
  })
})
