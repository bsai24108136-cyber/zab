/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow cross-origin requests to backend
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // Suppress hydration warnings from extensions
  reactStrictMode: true,
};

module.exports = nextConfig;
