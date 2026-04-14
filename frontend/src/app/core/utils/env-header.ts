import { environment } from '../../../environments/environment';

export const ENV_HEADER_BG = (() => {
  const label = (environment as any).environmentLabel || '';
  if (['DEV', 'LOCAL'].includes(label)) return 'bg-blue-50';
  if (label === 'TEST') return 'bg-green-50';
  return 'bg-white';
})();
