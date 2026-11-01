import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export function useKdsConfig() {
  const token = useAuthStore((state) => state.token);
  const [config, setConfig] = useState({ enabled: false, carvoariaEnabled: false, stations: [] as string[] });
  useEffect(() => {
    let active = true;
    setConfig({ enabled: false, carvoariaEnabled: false, stations: [] });
    if (token)
      api
        .get('/v1/kds/config')
        .then((res) => {
          if (active) setConfig({ enabled: res.data.enabled === true, carvoariaEnabled: res.data.carvoariaEnabled === true,
            stations: res.data.stations || (res.data.enabled ? ['KITCHEN', 'BAR', 'SERVICE'] : []) });
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  return config;
}

export function useKdsEnabled() { return useKdsConfig().enabled; }
