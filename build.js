import * as esbuild from 'esbuild'

const buildOptions = {
    bundle: true,
    sourcemap: 'linked',
    outdir: './dist/',
    target: "safari14",
    legalComments: "inline",
    entryPoints: ['./index.js'],
    keepNames: true,
    minify: true,
}

esbuild.build(buildOptions);
