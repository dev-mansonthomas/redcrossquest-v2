// ── Superset (embedded dashboards) ──
// To re-enable Superset:
// 1. Set enableSuperset: true below
// 2. Deploy Superset Cloud Run: ./gcp-deploy.sh <env> --infra --superset
// 3. The sidebar will show "Objectifs Annuels (SS)" link

export const environment = {
  production: false,
  apiUrl: 'http://localhost:8010',
  supersetUrl: 'http://localhost:8088',
  rcqV1Url: 'https://devredcrossquest.croix-rouge.fr',
  // Set to true to enable Superset embedded dashboards (requires Superset Cloud Run service)
  enableSuperset: false,
};

