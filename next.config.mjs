import { assertPublicCloudConfig } from "./scripts/public-cloud-config.mjs";

assertPublicCloudConfig();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
