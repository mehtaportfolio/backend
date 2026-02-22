/**
 * Initialize stock_mapping table
 * This script creates the stock_mapping table and seeds it with initial data from stock_master
 */

import { supabase } from './supabaseClient.js';

export async function initializeStockMapping() {
  try {
    console.log('[Init] Checking if stock_mapping table exists...');
    
    // Try to fetch from stock_mapping to check if table exists
    const { data, error } = await supabase
      .from('stock_mapping')
      .select('stock_name')
      .limit(1);
    
    if (!error) {
      console.log('[Init] ✅ stock_mapping table exists');
      return true;
    }
    
    console.log('[Init] ⚠️  stock_mapping table does not exist or is not accessible');
    console.log('[Init] Please create the table manually using:');
    console.log('[Init] 1. Go to Supabase Dashboard > SQL Editor');
    console.log('[Init] 2. Copy and run the SQL from: supabase/migrations/create_stock_mapping.sql');
    console.log('[Init] 3. Or execute the following SQL:');
    console.log(`
    CREATE TABLE IF NOT EXISTS public.stock_mapping (
      id BIGSERIAL PRIMARY KEY,
      stock_name VARCHAR(255) NOT NULL UNIQUE,
      cmp NUMERIC(18, 2),
      lcp NUMERIC(18, 2),
      category VARCHAR(100),
      sector VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_stock_mapping_stock_name ON public.stock_mapping(stock_name);
    
    ALTER TABLE public.stock_mapping ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Enable read access for authenticated users" 
    ON public.stock_mapping 
    FOR SELECT 
    USING (auth.role() = 'authenticated');
    `);
    
    return false;
  } catch (err) {
    console.error('[Init] Error checking stock_mapping table:', err);
    return false;
  }
}

/**
 * Seed stock_mapping with initial data from stock_master
 */
export async function seedStockMappingFromMaster() {
  try {
    console.log('[Seed] Fetching all stocks from stock_master...');
    
    const { data: masterStocks, error: fetchError } = await supabase
      .from('stock_master')
      .select('stock_name, cmp, lcp, category, sector');
    
    if (fetchError) {
      console.error('[Seed] Error fetching from stock_master:', fetchError);
      return false;
    }
    
    if (!masterStocks || masterStocks.length === 0) {
      console.log('[Seed] No stocks found in stock_master');
      return false;
    }
    
    console.log(`[Seed] Found ${masterStocks.length} stocks in stock_master`);
    console.log('[Seed] Attempting to upsert into stock_mapping...');
    
    // Upsert into stock_mapping
    const { error: upsertError, data: upserted } = await supabase
      .from('stock_mapping')
      .upsert(
        masterStocks.map(stock => ({
          stock_name: stock.stock_name,
          cmp: stock.cmp,
          lcp: stock.lcp,
          category: stock.category,
          sector: stock.sector,
        })),
        { onConflict: 'stock_name' }
      );
    
    if (upsertError) {
      console.error('[Seed] Error upserting into stock_mapping:', upsertError);
      return false;
    }
    
    console.log(`[Seed] ✅ Successfully seeded ${upserted?.length || 0} stocks into stock_mapping`);
    return true;
  } catch (err) {
    console.error('[Seed] Error seeding stock_mapping:', err);
    return false;
  }
}
