export default defineNuxtConfig({
  compatibilityDate: '2026-06-01',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    supabaseDatabaseUrl: process.env.SUPABASE_DB_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    public: {
      appName: 'Fran CRM',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
      supabase: {
        url: process.env.NUXT_PUBLIC_SUPABASE_URL,
        key: process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY
      },
      paidPlanPriceId: process.env.NUXT_PUBLIC_STRIPE_PRICE_ID,
      billingMode: process.env.NUXT_PUBLIC_BILLING_MODE || 'demo'
    }
  },
  routeRules: {
    '/api/**': { cors: true },
    '/fran/**': { cors: true }
  },
  typescript: {
    strict: true
  }
})
