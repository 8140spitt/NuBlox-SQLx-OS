export default {
  security: {
    requireTLSForRemote: true,
    allowPlainLocalhost: true,
    trust: process.env.SQLX_TLS_TRUST || 'system',
    pin: process.env.SQLX_TLS_PIN || undefined
  },
  learner: {
    probes: process.env.SQLX_SYSTEM_TESTS || './sqlx.tests.yaml',
    maxRuntimeMs: 30000
  }
};
