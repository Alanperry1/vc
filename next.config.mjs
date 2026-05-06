/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // pg is a native Node module — never bundle it for edge or instrumentation.
  serverExternalPackages: [
    'pg',
    'pg-native',
    'pg-connection-string',
    'pgpass',
    'pg-pool',
    'pg-protocol',
    'pg-types',
    'split2',
  ],
  // Belt-and-suspenders: also mark these as webpack externals so the
  // instrumentation bundle (which doesn't honor serverExternalPackages)
  // doesn't try to pull `fs`/`stream` polyfills.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals)
        ? config.externals
        : [config.externals].filter(Boolean);
      externals.push({
        pg: 'commonjs pg',
        'pg-native': 'commonjs pg-native',
        'pg-connection-string': 'commonjs pg-connection-string',
        pgpass: 'commonjs pgpass',
        'pg-pool': 'commonjs pg-pool',
        'pg-protocol': 'commonjs pg-protocol',
        'pg-types': 'commonjs pg-types',
        split2: 'commonjs split2',
      });
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
