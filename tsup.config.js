import { defineConfig } from 'tsup';

export default defineConfig([
    {
        entry: ['src/**/*.ts', '!src/**/*.test.ts'],
        format: 'esm',
        outDir: 'dist/esm',
        sourcemap: true,
        clean: true,
        dts: true,
        outExtension: () => ({ js: '.js' }),
        esbuildOptions(options) {
            options.outbase = 'src';
        }
    },
    {
        entry: ['src/**/*.ts', '!src/**/*.test.ts'],
        format: 'cjs',
        outDir: 'dist/cjs',
        sourcemap: true,
        clean: true,
        dts: false,
        outExtension: () => ({ js: '.cjs' }),
        esbuildOptions(options) {
            options.outbase = 'src';
        }
    }
]);
