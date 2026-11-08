import type { NextConfig } from "next";

const qaRun = process.env.PORTFOLIO_QA_RUN ?? '';
if (process.env.PORTFOLIO_QA === '1' && qaRun && !/^[a-z0-9-]+$/.test(qaRun)) {
  throw new Error('PORTFOLIO_QA_RUN must contain lowercase letters, digits or hyphens');
}
const coldDirectory = `.next-portfolio-cold${qaRun ? `-${qaRun}` : ''}`;
const config: NextConfig = {
  distDir: process.env.PORTFOLIO_QA === '1'
    ? (process.env.PORTFOLIO_QA_MODE === 'production' ? '.next-portfolio-production' : process.env.PORTFOLIO_QA_MODE === 'cold-development' ? coldDirectory : '.next-portfolio')
    : '.next',
  devIndicators: false,
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost", "127.0.0.1:3000", "localhost:3000"],
};

export default config;
