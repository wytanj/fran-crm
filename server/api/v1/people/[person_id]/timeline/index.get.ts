import { demoCustomerTimeline } from '../../../../../utils/demo-crm'

export default defineEventHandler(async (event) => {
  const personId = getRouterParam(event, 'person_id')
  const supabase = useSupabaseAdmin()

  if (!supabase || !personId || !/^[0-9a-f-]{36}$/i.test(personId)) {
    return { mode: 'demo', timeline: demoCustomerTimeline }
  }

  const { data, error } = await supabase
    .from('crm_customer_facts')
    .select('id, fact_type, fact_key, value, source_system, occurred_at, event_id')
    .eq('person_entity_id', personId)
    .order('occurred_at', { ascending: false })
    .limit(100)

  if (error) {
    return { mode: 'demo', warning: error.message, timeline: demoCustomerTimeline }
  }

  return {
    mode: 'supabase',
    timeline: (data || []).map((fact) => ({
      id: fact.id,
      eventType: fact.fact_type,
      factKey: fact.fact_key,
      sourceSystem: fact.source_system,
      occurredAt: fact.occurred_at,
      payload: fact.value,
      sourceEventId: fact.event_id
    }))
  }
})
