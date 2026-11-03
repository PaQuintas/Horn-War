# Horn War

## Ejecutar en local

Necesitas Node.js 20 o posterior. Desde la carpeta del proyecto, ejecuta:

```powershell
npm.cmd install
npm.cmd start
```

Abre `http://localhost:3000`. No abras `index.html` directamente como archivo: las partidas online usan la API y WebSocket del servidor.

## Publicar en Render

Sube el proyecto completo a GitHub y en Render crea un **New Blueprint Instance** seleccionando ese repositorio. Render detectará `render.yaml`, instalará las dependencias y arrancará el servidor. El servidor sirve la web y la API desde el mismo servicio, por lo que no hace falta una carpeta ni un servicio separado.

## Salas online

Las salas se guardan en la memoria del servidor. No hay que configurar una base de datos. Si Render suspende o reinicia el servicio, las salas activas se borran y habrá que crear una nueva.
