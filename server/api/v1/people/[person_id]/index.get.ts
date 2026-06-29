import { demoCrmGraph, demoCustomerProfile } from '../../../../utils/demo-crm'

export default defineEventHandler(async (event) => {
  const personId = getRouterParam(event, 'person_id')
  const supabase = useSupabaseAdmin()

  if (!supabase || !personId || !/^[0-9a-f-]{36}$/i.test(personId)) {
    return { mode: 'demo', person: demoCustomerProfile }
  }

  const { data: entity, error: entityError } = await supabase
    .from('crm_entities')
    .select('id, type, label, external_ids, attributes, tags, created_at, updated_at')
    .eq('id', personId)
    .eq('type', 'person')
    .single()

  if (entityError) {
    return { mode: 'demo', warning: entityError.message, person: demoCustomerProfile }
  }

  const { data: profile } = await supabase
    .from('crm_customer_profiles')
    .select('*')
    .eq('person_entity_id', personId)
    .maybeSingle()

  return {
    mode: 'supabase',
    person: {
      id: entity.id,
      displayName: profile?.display_name || entity.label,
      email: profile?.email || entity.attributes?.email,
      phone: profile?.phone || entity.attributes?.phone,
      externalIds: entity.external_ids || {},
      tags: entity.tags || [],
      attributes: entity.attributes || {},
      consent: profile?.consent_summary || {},
      computedAt: profile?.computed_at,
      relatedDemoEntities: demoCrmGraph.relationships.filter((relationship) => relationship.fromEntityId === entity.id)
    }
  }
})
