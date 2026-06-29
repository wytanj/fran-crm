import { demoCustomerProfile } from '../../../../../utils/demo-crm'

export default defineEventHandler(async (event) => {
  const personId = getRouterParam(event, 'person_id')
  const supabase = useSupabaseAdmin()

  if (!supabase || !personId || !/^[0-9a-f-]{36}$/i.test(personId)) {
    return { mode: 'demo', profile: demoCustomerProfile }
  }

  const { data, error } = await supabase
    .from('crm_customer_profiles')
    .select('*')
    .eq('person_entity_id', personId)
    .maybeSingle()

  if (error || !data) {
    return { mode: 'demo', warning: error?.message || 'No computed profile found', profile: demoCustomerProfile }
  }

  return {
    mode: 'supabase',
    profile: {
      id: data.person_entity_id,
      displayName: data.display_name,
      email: data.email,
      phone: data.phone,
      consent: data.consent_summary,
      activityProfile: data.activity_profile,
      valueProfile: data.value_profile,
      affinityProfile: data.affinity_profile,
      intentProfile: data.intent_profile,
      metricValues: data.metric_values,
      provenance: data.provenance,
      sensitivityLevel: data.sensitivity_level,
      computedAt: data.computed_at,
      inputWatermark: data.input_watermark
    }
  }
})
