import { schemaFieldPayloadSchema } from '../../utils/contracts'

export default defineEventHandler(async (event) => {
  const body = schemaFieldPayloadSchema.parse(await readBody(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()

  if ((!supabase && !sql) || !body.workspaceId) {
    return {
      mode: 'demo',
      field: {
        ...body,
        id: `demo_${body.key}`,
        origin: body.origin
      }
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)
  await requireWorkspaceMembership(supabase || useSupabaseAuthClient()!, user, body.workspaceId, ['owner', 'admin'])

  if (sql) {
    const [field] = await sql<Array<Record<string, unknown>>>`
      insert into public.crm_field_definitions (
        workspace_id,
        entity_type,
        key,
        label,
        value_type,
        required,
        origin,
        pack_key,
        description,
        help_text,
        sensitivity_level,
        pos_visible,
        cashier_editable,
        marketing_usable,
        ui_contexts,
        enum_values,
        sort_order,
        metadata
      )
      values (
        ${body.workspaceId}::uuid,
        ${body.entityType},
        ${body.key},
        ${body.label},
        ${body.type},
        ${body.required},
        ${body.origin},
        ${body.packKey || null},
        ${body.description || null},
        ${body.helpText || null},
        ${body.sensitivityLevel},
        ${body.posVisible},
        ${body.cashierEditable},
        ${body.marketingUsable},
        ${body.uiContexts},
        ${JSON.stringify(body.enumValues)}::jsonb,
        ${body.sortOrder},
        ${JSON.stringify(body.metadata)}::jsonb
      )
      returning *
    `

    return { mode: 'supabase', field }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const { data, error } = await supabase
    .from('crm_field_definitions')
    .insert({
      workspace_id: body.workspaceId,
      entity_type: body.entityType,
      key: body.key,
      label: body.label,
      value_type: body.type,
      required: body.required,
      origin: body.origin,
      pack_key: body.packKey || null,
      description: body.description || null,
      help_text: body.helpText || null,
      sensitivity_level: body.sensitivityLevel,
      pos_visible: body.posVisible,
      cashier_editable: body.cashierEditable,
      marketing_usable: body.marketingUsable,
      ui_contexts: body.uiContexts,
      enum_values: body.enumValues,
      sort_order: body.sortOrder,
      metadata: body.metadata
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { mode: 'supabase', field: data }
})
