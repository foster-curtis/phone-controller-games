// Unit tests (AGENTS.md): src/client/** runs in jsdom, everything else (the build) in node.
import { configDefaults, defineConfig } from 'vitest/config';

const exclude = [...configDefaults.exclude, '**/.claude/worktrees/**', 'e2e/**'];

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'build',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: [...exclude, 'src/client/**'],
          // The build tests run a full `vite build`, twice.
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/client/**/*.test.ts'],
          exclude,
        },
      },
    ],
  },
});
