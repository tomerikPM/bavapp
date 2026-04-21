// useDiagramData.js — Henter { nodes, edges } fra BavApp backend per diagram-type.
// Backend genererer React Flow-format fra vessel_items + vessel_connections i DB.

import { useEffect, useState } from 'react';

const BACKEND_BASE = () => {
  // Når diagram-appen embeds som iframe via BavApp-backend, er den på samme origin
  // som /api/*. Når den kjøres standalone (npm run dev), pek til localhost:3001.
  if (typeof window === 'undefined') return 'http://localhost:3001';
  const { origin, hostname } = window.location;
  if (hostname === 'localhost' && window.location.port === '5173') return 'http://localhost:3001';
  return origin;
};

export function useDiagramData(type) {
  const [data, setData]     = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${BACKEND_BASE()}/api/vessel/diagram/${type}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // Lytter på reload-signaler fra parent-siden (vessel.js)
    const onMsg = (e) => {
      if (e.data?.type === 'reload') fetchData();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return { ...data, loading, error, reload: fetchData };
}
