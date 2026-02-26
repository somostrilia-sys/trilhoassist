import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { plate } = await req.json();
    
    if (!plate || typeof plate !== 'string' || plate.length < 7) {
      return new Response(JSON.stringify({ error: 'Placa inválida' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanPlate = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    
    // Try multiple free/public APIs for plate lookup
    let vehicleData: { model?: string; year?: number; brand?: string; category?: string } | null = null;

    // Attempt 1: BrasilAPI vehicle lookup (FIPE by plate - unofficial)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/fipe/preco/v1/${cleanPlate}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const vehicle = data[0];
          vehicleData = {
            model: vehicle.modelo || undefined,
            year: vehicle.anoModelo || undefined,
            brand: vehicle.marca || undefined,
          };
        }
      }
    } catch (e) {
      console.log('BrasilAPI FIPE lookup failed:', e);
    }

    // Attempt 2: Try API Placas style lookup if configured
    if (!vehicleData) {
      const apiPlacasToken = Deno.env.get('PLATE_API_TOKEN');
      if (apiPlacasToken) {
        try {
          const res = await fetch(`https://wdapi2.com.br/consulta/${cleanPlate}/${apiPlacasToken}`, {
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json();
            if (data && !data.error && data.MARCA) {
              vehicleData = {
                model: `${data.MARCA} ${data.MODELO}`.trim(),
                year: data.ano ? parseInt(data.ano) : undefined,
                brand: data.MARCA,
                category: data.TIPO === 'Moto' ? 'motorcycle' : data.TIPO === 'Caminhão' ? 'truck' : 'car',
              };
            }
          }
        } catch (e) {
          console.log('API Placas lookup failed:', e);
        }
      }
    }

    // Attempt 3: Try alternative free plate API
    if (!vehicleData) {
      try {
        const res = await fetch(`https://api-placas.vercel.app/api/consulta/${cleanPlate}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.modelo) {
            vehicleData = {
              model: data.modelo,
              year: data.ano ? parseInt(data.ano) : undefined,
              brand: data.marca || undefined,
              category: data.tipo?.toLowerCase()?.includes('moto') ? 'motorcycle' 
                : data.tipo?.toLowerCase()?.includes('caminh') ? 'truck' : 'car',
            };
          }
        }
      } catch (e) {
        console.log('Alternative plate API failed:', e);
      }
    }

    if (vehicleData) {
      return new Response(JSON.stringify({ found: true, ...vehicleData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ found: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('plate-lookup error:', err);
    return new Response(JSON.stringify({ error: 'Erro interno', found: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
