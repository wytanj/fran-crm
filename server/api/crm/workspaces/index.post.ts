import { shopifyCustomerFields } from '../../../utils/demo-crm'
import { workspaceSetupPayloadSchema } from '../../../utils/contracts'
import { getDefaultProfilePacks, toDbFieldRow, toDbProfilePackRow } from '../../../utils/profile-packs'

const plannedSources = [
  { key: 'shopify', label: 'Shopify', source_type: 'commerce', status: 'planned' },
  { key: 'pos', label: 'POS', source_type: 'commerce', status: 'planned' },
  { key: 'support', label: 'Support desk', source_type: 'support', status: 'planned' },
  { key: 'email_sms', label: 'Email/SMS', source_type: 'marketing', status: 'planned' },
  { key: 'csv', label: 'CSV import', source_type: 'file', status: 'available' }
] as const

function toSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || `workspace-${Date.now()}`
}

async function resolveSlug(supabase: ReturnType<typeof useSupabaseAdmin>, requestedSlug: string) {
  if (!supabase) {
    return requestedSlug
  }

  let candidate = requestedSlug

  for (let attempt = 2; attempt <= 30; attempt += 1) {
    const { data, error } = await supabase
      .from('crm_workspaces')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    if (!data) {
      return candidate
    }

    candidate = `${requestedSlug}-${attempt}`
  }

  return `${requestedSlug}-${Date.now().toString(36)}`
}

async function resolveSlugWithPostgres(sql: ReturnType<typeof useCrmPostgres>, requestedSlug: string) {
  if (!sql) {
    return requestedSlug
  }

  let candidate = requestedSlug

  for (let attempt = 2; attempt <= 30; attempt += 1) {
    const rows = await sql<Array<{ id: string }>>`
      select id::text
      from public.crm_workspaces
      where slug = ${candidate}
      limit 1
    `

    if (rows.length === 0) {
      return candidate
    }

    candidate = `${requestedSlug}-${attempt}`
  }

  return `${requestedSlug}-${Date.now().toString(36)}`
}

export default defineEventHandler(async (event) => {
  const body = workspaceSetupPayloadSchema.parse(await readBody(event))
  const supabase = useSupabaseAdmin()
  const sql = useCrmPostgres()
  const requestedSlug = toSlug(body.slug || body.companyName)

  if (!supabase && !sql) {
    return {
      mode: 'demo',
      workspace: {
        id: 'demo_workspace',
        name: body.companyName,
        slug: requestedSlug,
        role: 'owner',
        plan: body.plan,
        hostingMode: 'demo'
      }
    }
  }

  const { user } = await requireSupabaseUser(event, supabase || undefined)

  if (sql) {
    const slug = await resolveSlugWithPostgres(sql, requestedSlug)
    const workspace = await sql.begin(async (tx) => {
      const [createdWorkspace] = await tx<Array<{
        id: string
        name: string
        slug: string
        plan: string
        hosting_mode: string
        created_at: string
        updated_at: string
      }>>`
        insert into public.crm_workspaces (name, slug, plan, hosting_mode, created_by)
        values (${body.companyName}, ${slug}, ${body.plan}, 'hosted', ${user.id}::uuid)
        returning id::text, name, slug, plan, hosting_mode, created_at, updated_at
      `

      if (!createdWorkspace) {
        throw createError({ statusCode: 500, statusMessage: 'Workspace creation returned no row.' })
      }

      await tx`
        insert into public.crm_workspace_members (workspace_id, user_id, role)
        values (${createdWorkspace.id}::uuid, ${user.id}::uuid, 'owner')
      `

      await tx`
        insert into public.crm_subscriptions (workspace_id, provider, status, plan_key)
        values (${createdWorkspace.id}::uuid, 'stripe', 'trialing', ${body.plan})
      `

      if (user.email) {
        await tx`
          insert into public.crm_billing_customers (workspace_id, email, provider)
          values (${createdWorkspace.id}::uuid, ${user.email}, 'stripe')
        `
      }

      await tx`
        insert into public.crm_field_definitions ${tx(shopifyCustomerFields.map((field) => ({
          workspace_id: createdWorkspace.id,
          entity_type: 'person',
          key: field.key,
          label: field.label,
          value_type: field.type,
          required: field.required,
          origin: field.origin
        })), 'workspace_id', 'entity_type', 'key', 'label', 'value_type', 'required', 'origin')}
        on conflict (workspace_id, entity_type, key) where pack_key is null do update set
          label = excluded.label,
          value_type = excluded.value_type,
          required = excluded.required,
          origin = excluded.origin
      `

      for (const pack of getDefaultProfilePacks()) {
        const packRow = toDbProfilePackRow(createdWorkspace.id, pack)

        await tx`
          insert into public.crm_profile_packs (
            workspace_id,
            key,
            label,
            description,
            vertical,
            status,
            install_mode,
            metadata
          )
          values (
            ${packRow.workspace_id}::uuid,
            ${packRow.key},
            ${packRow.label},
            ${packRow.description},
            ${packRow.vertical},
            ${packRow.status},
            ${packRow.install_mode},
            ${JSON.stringify(packRow.metadata)}::jsonb
          )
          on conflict (workspace_id, key) do update set
            label = excluded.label,
            description = excluded.description,
            vertical = excluded.vertical,
            status = excluded.status,
            install_mode = excluded.install_mode,
            metadata = excluded.metadata,
            updated_at = now()
        `

        for (const field of pack.fields) {
          const fieldRow = toDbFieldRow(createdWorkspace.id, field)
          const fieldPackKey = fieldRow.pack_key || pack.key

          await tx`
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
              ${fieldRow.workspace_id}::uuid,
              ${fieldRow.entity_type},
              ${fieldRow.key},
              ${fieldRow.label},
              ${fieldRow.value_type},
              ${fieldRow.required},
              ${fieldRow.origin},
              ${fieldPackKey},
              ${fieldRow.description || null},
              ${fieldRow.help_text || null},
              ${fieldRow.sensitivity_level},
              ${fieldRow.pos_visible},
              ${fieldRow.cashier_editable},
              ${fieldRow.marketing_usable},
              ${fieldRow.ui_contexts},
              ${JSON.stringify(fieldRow.enum_values)}::jsonb,
              ${fieldRow.sort_order},
              ${JSON.stringify(fieldRow.metadata)}::jsonb
            )
            on conflict (workspace_id, entity_type, pack_key, key) where pack_key is not null do update set
              label = excluded.label,
              value_type = excluded.value_type,
              required = excluded.required,
              origin = excluded.origin,
              description = excluded.description,
              help_text = excluded.help_text,
              sensitivity_level = excluded.sensitivity_level,
              pos_visible = excluded.pos_visible,
              cashier_editable = excluded.cashier_editable,
              marketing_usable = excluded.marketing_usable,
              ui_contexts = excluded.ui_contexts,
              enum_values = excluded.enum_values,
              sort_order = excluded.sort_order,
              metadata = excluded.metadata
          `
        }
      }

      await tx`
        insert into public.crm_data_sources ${tx(plannedSources.map((source) => ({
          workspace_id: createdWorkspace.id,
          ...source
        })), 'workspace_id', 'key', 'label', 'source_type', 'status')}
        on conflict (workspace_id, key) do update set
          label = excluded.label,
          source_type = excluded.source_type,
          status = excluded.status
      `

      await tx`
        insert into public.crm_audit_events (workspace_id, actor_id, event_type, subject_type, subject_id, metadata)
        values (
          ${createdWorkspace.id}::uuid,
          ${user.id}::uuid,
          'workspace.created',
          'workspace',
          ${createdWorkspace.id}::uuid,
          ${JSON.stringify({ plan: body.plan, hostingMode: 'hosted', defaultProfilePacks: getDefaultProfilePacks().map((pack) => pack.key) })}::jsonb
        )
      `

      return createdWorkspace
    })

    if (!workspace) {
      throw createError({ statusCode: 500, statusMessage: 'Workspace creation returned no row.' })
    }

    return {
      mode: 'supabase',
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: 'owner',
        plan: workspace.plan,
        hostingMode: workspace.hosting_mode,
        createdAt: workspace.created_at,
        updatedAt: workspace.updated_at
      }
    }
  }

  if (!supabase) {
    throw createError({ statusCode: 503, statusMessage: 'Supabase service client is not configured.' })
  }

  const slug = await resolveSlug(supabase, requestedSlug)

  const { data: workspace, error: workspaceError } = await supabase
    .from('crm_workspaces')
    .insert({
      name: body.companyName,
      slug,
      plan: body.plan,
      hosting_mode: 'hosted',
      created_by: user.id
    })
    .select('id, name, slug, plan, hosting_mode, created_at, updated_at')
    .single()

  if (workspaceError) {
    throw createError({ statusCode: 500, statusMessage: workspaceError.message })
  }

  const { error: memberError } = await supabase
    .from('crm_workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner'
    })

  if (memberError) {
    throw createError({ statusCode: 500, statusMessage: memberError.message })
  }

  const { error: subscriptionError } = await supabase
    .from('crm_subscriptions')
    .insert({
      workspace_id: workspace.id,
      provider: 'stripe',
      status: 'trialing',
      plan_key: body.plan
    })

  if (subscriptionError) {
    throw createError({ statusCode: 500, statusMessage: subscriptionError.message })
  }

  if (user.email) {
    const { error: billingError } = await supabase
      .from('crm_billing_customers')
      .insert({
        workspace_id: workspace.id,
        email: user.email,
        provider: 'stripe'
      })

    if (billingError) {
      throw createError({ statusCode: 500, statusMessage: billingError.message })
    }
  }

  const { data: existingFields, error: existingFieldError } = await supabase
    .from('crm_field_definitions')
    .select('key')
    .eq('workspace_id', workspace.id)
    .eq('entity_type', 'person')
    .is('pack_key', null)

  if (existingFieldError) {
    throw createError({ statusCode: 500, statusMessage: existingFieldError.message })
  }

  const existingFieldKeys = new Set((existingFields || []).map((field) => field.key))
  const missingFields = shopifyCustomerFields
    .filter((field) => !existingFieldKeys.has(field.key))
    .map((field) => ({
      workspace_id: workspace.id,
      entity_type: 'person',
      key: field.key,
      label: field.label,
      value_type: field.type,
      required: field.required,
      origin: field.origin
    }))

  const { error: fieldError } = missingFields.length
    ? await supabase
      .from('crm_field_definitions')
      .insert(missingFields)
    : { error: null }

  if (fieldError) {
    throw createError({ statusCode: 500, statusMessage: fieldError.message })
  }

  const defaultPacks = getDefaultProfilePacks()
  const { error: profilePackError } = await supabase
    .from('crm_profile_packs')
    .upsert(
      defaultPacks.map((pack) => toDbProfilePackRow(workspace.id, pack)),
      { onConflict: 'workspace_id,key' }
    )

  if (profilePackError) {
    throw createError({ statusCode: 500, statusMessage: profilePackError.message })
  }

  for (const pack of defaultPacks) {
    for (const field of pack.fields) {
      const fieldRow = toDbFieldRow(workspace.id, field)
      const { data: existingField, error: defaultFieldLookupError } = await supabase
        .from('crm_field_definitions')
        .select('id')
        .eq('workspace_id', workspace.id)
        .eq('entity_type', 'person')
        .eq('pack_key', pack.key)
        .eq('key', field.key)
        .maybeSingle()

      if (defaultFieldLookupError) {
        throw createError({ statusCode: 500, statusMessage: defaultFieldLookupError.message })
      }

      const { error: defaultFieldError } = existingField
        ? await supabase
          .from('crm_field_definitions')
          .update(fieldRow)
          .eq('id', existingField.id)
        : await supabase
          .from('crm_field_definitions')
          .insert(fieldRow)

      if (defaultFieldError) {
        throw createError({ statusCode: 500, statusMessage: defaultFieldError.message })
      }
    }
  }

  const { error: sourceError } = await supabase
    .from('crm_data_sources')
    .upsert(
      plannedSources.map((source) => ({
        workspace_id: workspace.id,
        ...source
      })),
      { onConflict: 'workspace_id,key' }
    )

  if (sourceError) {
    throw createError({ statusCode: 500, statusMessage: sourceError.message })
  }

  const { error: auditError } = await supabase
    .from('crm_audit_events')
    .insert({
      workspace_id: workspace.id,
      actor_id: user.id,
      event_type: 'workspace.created',
      subject_type: 'workspace',
      subject_id: workspace.id,
      metadata: {
        plan: body.plan,
        hostingMode: 'hosted',
        defaultProfilePacks: defaultPacks.map((pack) => pack.key)
      }
    })

  if (auditError) {
    throw createError({ statusCode: 500, statusMessage: auditError.message })
  }

  return {
    mode: 'supabase',
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: 'owner',
      plan: workspace.plan,
      hostingMode: workspace.hosting_mode,
      createdAt: workspace.created_at,
      updatedAt: workspace.updated_at
    }
  }
})
