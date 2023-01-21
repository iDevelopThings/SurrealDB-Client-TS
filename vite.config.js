import { defineConfig }     from 'vite';

export default defineConfig({
	plugins : [],
	test    : {
		globals     : true,
		testTimeout : 60000,
	},
	
	build : {
		outDir      : 'dist',
		sourcemap   : true,
		emptyOutDir : false,
		
		lib : {
			name     : 'SurrealDbClient',
			entry    : './src/index.ts',
			fileName : 'index',
			formats  : ['es', 'cjs'],
		},
		
		rollupOptions : {
			external : ['WebSocket', 'ws'],
			output   : {
				globals : {
					WebSocket : 'WebSocket',
				},
			},
		},
		
	},
});
