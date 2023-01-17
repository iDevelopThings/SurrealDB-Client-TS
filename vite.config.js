import { defineConfig }     from 'vite';

export default defineConfig({
	plugins : [],
	build   : {
		outDir      : 'dist',
		sourcemap   : true,
		emptyOutDir : false,
		lib         : {
			name     : 'SurrealDbClient',
			entry    : './src/index.ts',
			fileName : 'index',
			formats  : ['es', 'cjs'],
		},
	},
});
