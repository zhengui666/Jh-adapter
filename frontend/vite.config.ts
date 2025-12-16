import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// GitHub Pages 项目页部署时需要设置 base 为仓库名
// 通过环境变量 GITHUB_PAGES 区分本地开发与 Pages 构建
const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  plugins: [vue()],
  base: isGitHubPages ? "/Jh-adapter/" : "/",
  server: {
    port: 5173
  }
});
