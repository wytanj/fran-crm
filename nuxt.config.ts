export default defineNuxtConfig({
  compatibilityDate: '2026-06-01',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'Fran CRM',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#FFFEF5' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap'
        }
      ]
    }
  },
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
    '/fran/**': { cors: true },
    // UI redirects after nav cleanup (API under /fran/pos/* unchanged)
    '/integrations': { redirect: '/settings#integrations' },
    '/fran': { redirect: '/docs/fran-pos' },
    '/agents': { redirect: '/docs/agents' }
  },
  typescript: {
    strict: true
  }
})
