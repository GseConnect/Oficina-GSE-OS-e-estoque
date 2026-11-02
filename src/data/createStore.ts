import type { DataStore } from '../types';

/**
 * Com a configuração do Supabase no .env.local, usa o Supabase (PostgreSQL, tempo real entre aparelhos).
 * Senão, com a do Firebase, usa o Firestore. Sem nenhuma das duas, abre no modo demonstração,
 * com os dados só neste navegador.
 */
export async function createStore(): Promise<DataStore> {
  const env = import.meta.env;
  if (env.VITE_DEMO_ONLY !== 'true' && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const { createSupabaseStore } = await import('./supabaseStore');
    return createSupabaseStore(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  }
  const options = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  if (env.VITE_DEMO_ONLY !== 'true' && options.apiKey && options.projectId && options.appId) {
    const { createFirebaseStore } = await import('./firebaseStore');
    return createFirebaseStore(options, env.VITE_COLLECTION_PREFIX || 'oficina_');
  }
  const { createLocalStore } = await import('./localStore');
  return createLocalStore();
}
