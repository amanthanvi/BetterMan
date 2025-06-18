import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const query = url.searchParams.get('q') || ''
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const section = url.searchParams.get('section')

    // Build query
    let dbQuery = supabase
      .from('documents')
      .select('*')
      .limit(limit)

    if (query) {
      // Use full-text search
      dbQuery = dbQuery.or(`name.ilike.%${query}%,title.ilike.%${query}%,description.ilike.%${query}%`)
    }

    if (section) {
      dbQuery = dbQuery.eq('section', parseInt(section))
    }

    const { data, error } = await dbQuery

    if (error) throw error

    return new Response(
      JSON.stringify({
        query,
        count: data?.length || 0,
        results: data || []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})