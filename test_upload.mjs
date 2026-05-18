import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.storage.from('product-images').upload('test.txt', 'hello world', { upsert: true });
  console.log('Anon upload:', data, error);
}

main();