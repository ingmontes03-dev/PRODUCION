# Planta OP

Web app de gestión de órdenes de producción, maquila, inventario y finanzas, conectada a Supabase.

## Desarrollo local

```bash
npm install
cp .env.example .env   # ya trae las credenciales del proyecto; ajústalas si cambian
npm run dev
```

## Despliegue (Vercel o Netlify)

1. Sube esta carpeta a un repositorio de GitHub.
2. Importa el repositorio en Vercel o Netlify (detectan Vite automáticamente).
3. En las variables de entorno del proyecto agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Despliega. El comando de build es `npm run build` y la carpeta de salida es `dist`.
