import { configDefaults, defineConfig } from 'vitest/config';

const exclude = [...configDefaults.exclude, '**/.claude/worktrees/**', 'e2e/**'];

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: [...exclude, 'src/controller/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'controller',
          environment: 'jsdom',
          include: ['src/controller/**/*.test.ts'],
          exclude,
        },
      },
    ],
  },
});
